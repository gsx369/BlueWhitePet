# BlueWhitePet

这是基于 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 制作的蓝白猫桌宠版本。

## 使用方式

- 短按角色：按“跳跃 → 压扁回弹 → 左右抖动”的顺序循环互动，并随机显示一句中文气泡。
- 按住或拖动角色：移动桌宠窗口。
- 鼠标滚轮：触发短暂的上下晃头反馈；按住 `Ctrl`（macOS 为 `Command`）滚动时以 5% 为一档调整大小，范围为 10%～500%。
- 右键角色：打开原有设置菜单。
- 设置 → 模型：仍可切换键盘/手柄预设，或导入完整的自定义 Live2D 模型目录。

### 新增桌宠体验

- 游戏模式会同时启用置顶和鼠标穿透；开启后请从托盘菜单退出，或使用“设置 → 快捷键”中事先配置的游戏模式快捷键。
- `Ctrl`（macOS 为 `Command`）+ 右键会让角色短暂透明并穿透鼠标，随后自动恢复；普通右键仍打开菜单。
- 角色右键菜单和托盘菜单的“窗口位置”提供当前屏幕四角、中央及“下一显示器”定位。
- 设置页可配置空闲低功耗渲染（默认无输入 60 秒后降至 15 FPS），新的键鼠或手柄活动会恢复正常帧率。
- 输入次数和角色互动次数只保存在本机，可在设置页清零。
- 在“设置 → 模型”中用星标收藏模型，再用“随机收藏”切换；多个收藏时会优先选择当前模型之外的形象。
- 角色右键菜单和托盘菜单可复制或保存当前角色的透明 PNG；图片不包含桌面背景、气泡或按键面板。

默认蓝白猫使用复用原骨骼与动作数据的 Live2D 皮肤；静态 PNG 版本仍作为可选预设保留。用户导入的模型继续使用 BongoCat 原有的 Live2D 渲染链路。模型库格式见 [MODEL_LIBRARY.md](MODEL_LIBRARY.md)。

这些改进是在开源项目内独立实现的体验增强，不代表 Steam 版本的私有功能、素材或完整行为已被复刻。

## Windows 构建

```powershell
pnpm install --frozen-lockfile
pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis --no-sign
```

标准 Windows 构建需要 Rust stable-msvc、Visual Studio 2022 Build Tools（Desktop development with C++）和 Windows SDK。NSIS 安装器生成在：

```text
target/x86_64-pc-windows-msvc/release/bundle/nsis/BlueWhitePet_1.0.0_x64-setup.exe
```

也可以把项目推送到 GitHub，在 Actions 页面手动运行 **Build Windows EXE**，完成后下载 `BlueWhitePet-windows-x64` artifact。

本项目已改用独立的应用名和标识符，并关闭上游自动更新，以免与官方 BongoCat 安装或数据目录冲突。
