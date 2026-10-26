package com.workbench.personal;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 整个 App 只有一个原生页面：一个 WebView 承载 assets 里的工作台界面。
 * 需要系统能力（闹钟、通知）的部分通过 AndroidBridge 暴露给 JS。
 */
public class MainActivity extends Activity {

    private static final int REQ_NOTIFY = 1001;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReminderReceiver.ensureChannel(this);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFFF4F5F9);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("AndroidBridge");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        final WebView view = web;
        if (view == null) {
            super.onBackPressed();
            return;
        }
        view.evaluateJavascript(
                "(function(){try{return !!(window.App&&window.App.onBack&&window.App.onBack());}catch(e){return false;}})()",
                value -> {
                    if (!"true".equals(value)) {
                        finish();
                    }
                });
    }

    /** 暴露给前端 JS 的桥接对象，调用方式：window.AndroidBridge.xxx() */
    public class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public int sdk() {
            return Build.VERSION.SDK_INT;
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void saveReminder(String json) {
            try {
                JSONObject item = new JSONObject(json);
                ReminderStore.put(MainActivity.this, item);
                ReminderScheduler.schedule(MainActivity.this, item);
            } catch (JSONException ignored) {
                // 数据格式不对就忽略
            }
        }

        @JavascriptInterface
        public void deleteReminder(String id) {
            if (id == null) {
                return;
            }
            ReminderStore.remove(MainActivity.this, id);
            ReminderScheduler.cancel(MainActivity.this, id);
        }

        @JavascriptInterface
        public String listReminders() {
            return ReminderStore.all(MainActivity.this).toString();
        }

        /** 番茄钟结束时立即弹一条通知（不经过闹钟）。 */
        @JavascriptInterface
        public void notifyNow(String title, String text) {
            ReminderReceiver.show(MainActivity.this, 9002, title, text);
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
            }
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.areNotificationsEnabled();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                } else {
                    openNotificationSettings();
                }
            });
        }

        @JavascriptInterface
        public boolean exactAlarmAllowed() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                return true;
            }
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        Intent intent = new Intent(
                                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                        return;
                    } catch (Exception ignored) {
                        // 部分机型没有这个页面，退回应用详情
                    }
                }
                openNotificationSettings();
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            });
        }

        /** 番茄钟开始/继续时排一个一次性闹钟，锁屏或退到后台也能准时收到通知。 */
        @JavascriptInterface
        public void setTimerAlarm(int seconds, String title, String text) {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) {
                return;
            }
            Intent intent = new Intent(MainActivity.this, ReminderReceiver.class);
            intent.setAction(ReminderReceiver.ACTION_TIMER);
            intent.putExtra("title", title);
            intent.putExtra("text", text);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, 9002, intent, flags);
            long at = System.currentTimeMillis() + Math.max(1, seconds) * 1000L;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } catch (SecurityException e) {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
        }

        @JavascriptInterface
        public void cancelTimerAlarm() {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) {
                return;
            }
            Intent intent = new Intent(MainActivity.this, ReminderReceiver.class);
            intent.setAction(ReminderReceiver.ACTION_TIMER);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, 9002, intent, flags);
            am.cancel(pi);
            pi.cancel();
        }

        @JavascriptInterface
        public void setStatusBar(String color, boolean darkIcons) {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    window.setStatusBarColor(Color.parseColor(color));
                    View decor = window.getDecorView();
                    int flags = decor.getSystemUiVisibility();
                    if (darkIcons) {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    } else {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    }
                    decor.setSystemUiVisibility(flags);
                } catch (Exception ignored) {
                    // 个别 ROM 不允许改状态栏，忽略即可
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return "1.0.0";
        }
    }
}
