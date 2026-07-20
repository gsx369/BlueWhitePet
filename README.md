# BlueWhitePet

基于 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 改造的蓝白猫桌宠。默认角色采用小八（Hachiware）风格的原创同人 PNG，保留了原项目导入自定义 Live2D 模型的能力。

![默认蓝白猫角色](public/characters/blue-white-cat.png)

## 互动

- 短按角色：按“跳跃 → 压扁回弹 → 左右抖动”循环播放互动。
- 每次互动随机显示一句符合角色气质的简短中文气泡，气泡位于角色上方的独立区域。
- 按住或拖动角色：移动桌宠窗口。
- 鼠标滚轮：以 5% 为一档缩放桌宠，范围为 40%～300%。
- 右键角色：打开原有设置菜单。
- 设置 → 模型：切换预设，或导入完整的自定义 Live2D 模型目录。

默认角色使用透明 PNG sprite；导入模型继续走 BongoCat 原有 Live2D 渲染链路。Live2D 模型目录仍需包含 `.model3.json`、`.moc3` 及其引用的纹理等资源，普通 PNG 不能直接当作 Live2D 模型导入。

## 开发

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

## 生成 Windows EXE

本地安装 Rust stable-msvc、Visual Studio 2022 Build Tools（Desktop development with C++）和 Windows SDK 后运行：

```powershell
pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis --no-sign --ci
```

安装器输出到：

```text
target/x86_64-pc-windows-msvc/release/bundle/nsis/BlueWhitePet_1.0.0_x64-setup.exe
```

也可以把项目推送到 GitHub，在 Actions 页面手动运行 **Build Windows EXE**，然后下载 `BlueWhitePet-windows-x64` 构建产物。

## 授权说明

- 本项目基于 MIT 许可的 BongoCat 修改，详见 [LICENSE](LICENSE)。
- Live2D Cubism Core 受其单独许可约束。
- 默认角色图为 AI 生成的非官方同人素材。吉伊卡哇及相关角色权利归原权利人所有，公开或商业分发前请自行确认获得必要授权。

完整第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
