package com.workbench.personal;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 提醒数据的持久化：用 SharedPreferences 存一个 {id: {...}} 的 JSON 对象。
 * 放在原生层是为了让开机广播、闹钟广播在 WebView 没启动时也能读到数据。
 */
final class ReminderStore {

    private static final String PREFS = "pw_reminders";
    private static final String KEY = "items";

    private ReminderStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject all(Context context) {
        String raw = prefs(context).getString(KEY, "{}");
        try {
            JSONObject obj = new JSONObject(raw);
            return obj;
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static JSONObject get(Context context, String id) {
        return all(context).optJSONObject(id);
    }

    static void put(Context context, JSONObject item) {
        String id = item.optString("id", "");
        if (id.length() == 0) {
            return;
        }
        JSONObject all = all(context);
        try {
            all.put(id, item);
        } catch (JSONException ignored) {
            return;
        }
        prefs(context).edit().putString(KEY, all.toString()).apply();
    }

    static void remove(Context context, String id) {
        JSONObject all = all(context);
        all.remove(id);
        prefs(context).edit().putString(KEY, all.toString()).apply();
    }
}
