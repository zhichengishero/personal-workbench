# 个人工作台（Personal Workbench）

一个装在手机上的个人工作台 APK：**今日概览 · 减脂管理 · 番茄专注 · 时钟提醒**，数据全部存在本机，不联网、不注册、无广告。

- 体积小：只有一个 WebView 壳 + 前端页面，不引入任何第三方依赖
- 能响铃：提醒走系统 `AlarmManager` + 通知栏，锁屏、划掉 App 也能到点提醒，重启手机自动恢复
- 好修改：界面在 `app/src/main/assets/` 里，HTML/CSS/JS 直接改，不用懂 Android

---

## 一、5 分钟拿到 APK（GitHub Actions 云端打包，无需装 Android SDK）

### 1. 注册并新建仓库

1. 打开 <https://github.com>，注册/登录。
2. 右上角 `+` → **New repository**。
3. 仓库名填 `personal-workbench`，选 **Private**（私有也可以，Actions 免费额度足够），点 **Create repository**。

### 2. 把本项目上传上去

**方法 A：网页拖拽（最简单）**

1. 进入刚建好的仓库，点 **uploading an existing file**。
2. 把 `personal-workbench` 文件夹里的**所有内容**（不是文件夹本身）拖进去。
   ⚠️ 注意要包含隐藏目录 `.github`，否则不会自动打包。Windows 资源管理器里勾选「显示隐藏的项目」。
3. 点 **Commit changes**。

**方法 B：命令行**

```bash
cd personal-workbench
git init
git add .
git commit -m "personal workbench"
git branch -M main
git remote add origin https://github.com/你的用户名/personal-workbench.git
git push -u origin main
```

> 上传后请确认仓库里能看到 `.github/workflows/build-apk.yml`。如果网页上传时漏掉了 `.github` 目录，可以在仓库页面 **Add file → Create new file**，文件名填 `.github/workflows/build-apk.yml`，把本项目的同名文件内容粘进去再提交即可。

### 3. 等它自己打包

- 推送后自动开始。仓库页面点 **Actions** 标签，能看到 `Build APK` 正在跑（黄点）。
- 也可以手动触发：**Actions** → 左侧 `Build APK` → 右侧 **Run workflow** → **Run workflow**。
- 大约 2～4 分钟变成绿勾。

### 4. 下载并安装

1. 点进这次运行记录，页面底部 **Artifacts** → 下载 `personal-workbench-apk.zip`。
2. 解压得到 `app-debug.apk`（大约 2 MB）。
3. 传到手机（微信/QQ/数据线/网盘都行），点开安装。
4. 提示「禁止安装未知来源应用」时，按提示允许当前文件管理器/浏览器安装即可。

> 这个 APK 用调试证书签名，自己用完全没问题；要上应用商店才需要另做正式签名（见文末）。

---

## 二、本地用 Android Studio 打包（可选）

1. 下载安装 [Android Studio](https://developer.android.com/studio)（自带 JDK 17 和 SDK 管理器）。
2. `File → Open`，选择本项目的**根目录**（含 `settings.gradle` 的那一层）。
3. 首次打开会提示下载 Gradle 与 Android SDK 34，点同意，等同步完成。
4. 菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`。
5. 完成后右下角弹窗点 **locate**，APK 在：
   `app/build/outputs/apk/debug/app-debug.apk`

**关于 `gradlew`**：仓库为了保持纯文本、方便网页上传，没有放 `gradle-wrapper.jar`。两种解决办法：

- 在 Android Studio 的 `Settings → Build, Execution, Deployment → Build Tools → Gradle` 里，把 **Gradle distribution** 改成 `Local installation`，指向已安装的 Gradle 8.7；
- 或者本机装好 Gradle 8.7 后，在项目根目录执行一次 `gradle wrapper`，就会生成 `gradlew`，之后和普通项目一样用。

> 只想看界面效果：直接用 Chrome 打开 `app/src/main/assets/index.html` 即可预览（此时提醒、通知为模拟状态）。

---

## 三、这个工作台能做什么

| 模块 | 功能 |
| --- | --- |
| 首页 | 按时间段问候、大时钟（时:分:秒）、日期星期、连续记录天数、下一个提醒倒计时、减脂与专注摘要 |
| 减脂管理 | 记录体重（日期 + 数值 + 备注）、近 14 天趋势折线图、起始/目标体重进度环、已减/还差多少、BMI 与偏瘦/正常/偏重提示、记录删除 |
| 专注计时 | 番茄钟 25 分钟 / 短休息 5 分钟 / 长休息 15 分钟，环形进度、暂停继续、今日番茄数与分钟数、累计番茄数；结束有提示音 + 系统通知 |
| 时钟提醒 | 任意时间点 + 每天/仅一次、开关、删除；系统闹钟触发，锁屏也响，重启自动恢复，并带「通知权限 / 准时提醒」引导 |

数据位置：

- 体重、昵称、番茄统计 → WebView 的 `localStorage`
- 提醒 → `SharedPreferences`（`pw_reminders`），这样开机广播能读到

卸载 App 数据即全部清除，不会上传任何服务器。

---

## 四、目录结构

```
personal-workbench/
├─ .github/workflows/build-apk.yml   # 云端打包流水线
├─ settings.gradle / build.gradle    # 工程与插件版本
├─ gradle/wrapper/…                  # 仅声明 Gradle 8.7 版本
└─ app/
   ├─ build.gradle                   # compileSdk 34 / minSdk 24 / 无第三方依赖
   └─ src/main/
      ├─ AndroidManifest.xml         # 权限、Activity、广播接收器
      ├─ java/com/workbench/personal/
      │  ├─ MainActivity.java        # WebView 容器 + JS 桥接
      │  ├─ ReminderScheduler.java   # AlarmManager 排程
      │  ├─ ReminderStore.java       # 提醒持久化
      │  ├─ ReminderReceiver.java    # 到点发通知
      │  └─ BootReceiver.java        # 开机/改时间后恢复
      ├─ res/                        # 图标、主题、字符串
      └─ assets/                     # ← 界面全在这里
         ├─ index.html
         ├─ app.css
         └─ app.js
```

---

## 五、按自己的习惯改

| 想改什么 | 改哪里 |
| --- | --- |
| 应用名「个人工作台」 | `app/src/main/res/values/strings.xml` 的 `app_name` |
| 主题色（默认 #4F46E5 靛蓝） | `assets/app.css` 顶部的 `--brand`、`--brand-2`；以及 `res/values/colors.xml` 的 `ic_launcher_background` |
| 番茄时长 | `assets/app.js` 顶部 `MODES` 里的 `minutes`（同时改按钮文案） |
| 默认提醒时间 | `assets/index.html` 里 `<input type="time" id="rTime" value="07:30">` |
| 增加模块（如记账） | 在 `index.html` 加一个 `<section class="page" id="page-x">`，在 `.tabbar` 加按钮，在 `app.js` 的 `go()` 里加渲染分支 |
| 包名 | `app/build.gradle` 的 `namespace` 与 `applicationId`、`MainActivity.java` 的 `package`、目录名，四处要一致 |

改完后重新 push，GitHub Actions 会再打一个包。

---

## 六、已知限制

- 番茄钟的倒计时状态保存在页面内存里：App 被系统彻底杀掉后重新打开会回到 25:00；但**已经排好的结束通知仍会按时响**。
- 数据只在本机，不跨设备同步；换手机前请自行记录或后续加导出功能。
- 提醒依赖系统闹钟权限。Android 14 起新装应用默认不给「精确闹钟」，需要在设置里手动允许，否则会晚几分钟。

---

## 七、权限与「到点不响」排查

App 需要三项系统能力：

1. **通知权限**（Android 13+）：首次进「提醒」页会提示开启。
2. **精确闹钟**（Android 12+）：系统设置 → 应用 → 个人工作台 → 闹钟和提醒 → 允许。列表页顶部也有「允许准时」按钮，没授权时会退化成非精确闹钟（可能晚几分钟）。
3. **后台运行**：国产 ROM（小米/OPPO/vivo/华为/荣耀）建议在「电池 → 应用启动管理」里允许自启动和后台活动，否则系统可能杀掉闹钟。

其他常见问题：

- **安装失败「应用未安装」**：手机里已有同包名的其它版本，先卸载旧的；或 APK 没下载完整，重新解压。
- **Actions 打包失败**：多为 SDK license 或 Gradle 版本问题。本项目已在流水线里显式安装 `platforms;android-34`、`build-tools;34.0.0`，并固定 Gradle 8.7 + AGP 8.5.2；若你改动过版本，注意 AGP 8.5 需要 Gradle ≥ 8.7、JDK 17。
- **点提醒没反应**：确认提醒开关是开的、时间是未来的时刻；「仅一次」的提醒触发后会从列表消失。

---

## 八、做成正式签名的安装包（可选）

```bash
keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias workbench
```

在 `app/build.gradle` 的 `android { signingConfigs { release { … } } buildTypes { release { signingConfig signingConfigs.release } } }` 里填好路径与密码，然后：

```bash
gradle assembleRelease
```

产物在 `app/build/outputs/apk/release/`。`release.jks` 与密码**不要**提交到仓库。
