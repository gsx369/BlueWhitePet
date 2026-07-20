# BlueWhitePet

这是基于 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 制作的蓝白猫桌宠版本。

## 使用方式

- 短按角色：按“跳跃 → 压扁回弹 → 左右抖动”的顺序循环互动，并随机显示一句中文气泡。
- 按住或拖动角色：移动桌宠窗口。
- 鼠标滚轮：以 5% 为一档调整大小，范围为 40%～300%。
- 右键角色：打开原有设置菜单。
- 设置 → 模型：仍可切换键盘/手柄预设，或导入完整的自定义 Live2D 模型目录。

默认蓝白猫使用透明 PNG sprite；用户导入的模型继续使用 BongoCat 原有的 Live2D 渲染链路。普通 PNG 不等同于 Live2D 模型，导入模型仍需包含 `.model3.json`、`.moc3` 及其引用的纹理文件。

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
