package com.workbench.personal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

/** 闹钟到点时发一条系统通知，并安排下一次。 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "pw_reminders";
    static final String ACTION_TIMER = "com.workbench.personal.action.TIMER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        // 番茄钟的结束闹钟：只弹通知，不涉及重复提醒数据
        if (ACTION_TIMER.equals(intent.getAction())) {
            String title = intent.getStringExtra("title");
            String text = intent.getStringExtra("text");
            show(context, 9002,
                    title == null ? "时间到了" : title,
                    text == null ? "回来看看工作台吧" : text);
            return;
        }
        if (!ReminderScheduler.ACTION_FIRE.equals(intent.getAction())) {
            return;
        }
        String id = intent.getStringExtra("id");
        if (id == null || id.length() == 0) {
            return;
        }
        JSONObject item = ReminderStore.get(context, id);
        String label = item == null ? "时间到了" : item.optString("label", "时间到了");

        show(context, id.hashCode(), "工作台提醒", label);

        if (item == null) {
            return;
        }
        if (item.optBoolean("repeat", true) && item.optBoolean("enabled", true)) {
            ReminderScheduler.scheduleFollowingDay(context, item);
        } else {
            ReminderStore.remove(context, id);
        }
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "工作台提醒", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("番茄钟结束、时钟提醒等通知");
        channel.enableVibration(true);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }

    static void show(Context context, int notifyId, String title, String text) {
        ensureChannel(context);
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent content = PendingIntent.getActivity(context, notifyId, open, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }
        builder.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(content)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setDefaults(Notification.DEFAULT_ALL);

        try {
            nm.notify(notifyId, builder.build());
        } catch (SecurityException ignored) {
            // Android 13+ 未授予通知权限时会静默失败
        }
    }
}
