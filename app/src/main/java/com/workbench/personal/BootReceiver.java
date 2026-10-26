package com.workbench.personal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机、改时间、换时区后恢复所有提醒。 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            ReminderScheduler.rescheduleAll(context);
        }
    }
}
