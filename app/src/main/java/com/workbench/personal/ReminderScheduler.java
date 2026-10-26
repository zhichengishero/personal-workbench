package com.workbench.personal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Iterator;

/**
 * 用系统闹钟（AlarmManager）来调度提醒，这样 App 被划掉、手机锁屏后也能准时响。
 * 每次触发后由 ReminderReceiver 重新排下一次，因此不需要 setRepeating。
 */
final class ReminderScheduler {

    static final String ACTION_FIRE = "com.workbench.personal.action.FIRE";

    private ReminderScheduler() {
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            f |= PendingIntent.FLAG_IMMUTABLE;
        }
        return f;
    }

    private static PendingIntent pending(Context context, String id) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.putExtra("id", id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, flags());
    }

    /** 下一次触发：今天这个时刻已过，就顺延到明天。 */
    static long nextTriggerAt(JSONObject item) {
        return atDay(item, 0);
    }

    private static long atDay(JSONObject item, int dayOffset) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, dayOffset);
        cal.set(Calendar.HOUR_OF_DAY, item.optInt("hour", 8));
        cal.set(Calendar.MINUTE, item.optInt("minute", 0));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    static void schedule(Context context, JSONObject item) {
        if (item == null) {
            return;
        }
        String id = item.optString("id", "");
        if (id.length() == 0) {
            return;
        }
        if (!item.optBoolean("enabled", true)) {
            cancel(context, id);
            return;
        }
        long at = atDay(item, 0);
        if (at <= System.currentTimeMillis() + 1000L) {
            at = atDay(item, 1);
        }
        setAlarm(context, id, item, at);
    }

    /** 重复提醒触发后，排到第二天的同一时刻。 */
    static void scheduleFollowingDay(Context context, JSONObject item) {
        if (item == null || !item.optBoolean("enabled", true)) {
            return;
        }
        String id = item.optString("id", "");
        if (id.length() == 0) {
            return;
        }
        setAlarm(context, id, item, atDay(item, 1));
    }

    private static void setAlarm(Context context, String id, JSONObject item, long at) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        PendingIntent pi = pending(context, id);
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            exact = am.canScheduleExactAlarms();
        }
        try {
            if (exact) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            // 没有精确闹钟权限时退化为非精确闹钟（可能延迟几分钟）
            am.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void cancel(Context context, String id) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null || id == null || id.length() == 0) {
            return;
        }
        PendingIntent pi = pending(context, id);
        am.cancel(pi);
        pi.cancel();
    }

    /** 开机 / 改系统时间 / 换时区后，把所有提醒重新排一遍。 */
    static void rescheduleAll(Context context) {
        JSONObject all = ReminderStore.all(context);
        Iterator<String> keys = all.keys();
        while (keys.hasNext()) {
            JSONObject item = all.optJSONObject(keys.next());
            if (item != null) {
                schedule(context, item);
            }
        }
    }
}
