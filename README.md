# BlueWhitePet

基于 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 改造的蓝白猫桌宠。默认角色为小八（Hachiware）风格的 Live2D 皮肤，复用原 BongoCat 的骨骼、动作、表情和键鼠参数；原有预设和自定义 Live2D 导入能力均保留。

![小八 A Live2D 预览](art-review/hachiware-live2d-render-a.png)

## 互动

- 短按角色：按“跳跃 → 压扁回弹 → 左右抖动”循环播放互动，Live2D 与静态角色均支持。
- 每次互动随机显示一句符合角色气质的简短中文气泡，气泡位于角色预留的空白区域。
- 拖动角色：指针移动超过点击阈值后移动桌宠窗口，短按不会误触拖动。
- 鼠标滚轮：触发短暂的上下晃头反馈；按住 `Ctrl`（macOS 为 `Command`）滚动时以 5% 为一档缩放桌宠，范围为 10%～500%。
- 右键角色：打开原有设置菜单。
- 设置 → 模型：切换预设，或导入完整的自定义 Live2D 模型目录。

每个内置形象都是独立模型包，可通过 `pet-model.json` 加入模型库；旧版无 manifest 的 BongoCat 模型仍可导入。完整格式和新增形象流程见 [MODEL_LIBRARY.md](MODEL_LIBRARY.md)。普通 PNG 不能直接当作 Live2D 模型导入，模型目录仍需包含 `.model3.json`、`.moc3` 及其引用资源。

## 桌宠体验功能

- **游戏模式**：从角色右键菜单、托盘菜单或设置页开启后，桌宠会同时保持置顶并穿透鼠标，避免游戏操作误触。由于开启后无法再点击角色，请通过托盘菜单或事先在“设置 → 快捷键”中配置的游戏模式快捷键退出。
- **短暂透明**：按住 `Ctrl`（macOS 为 `Command`）右键角色，桌宠会短暂变为近乎透明并穿透鼠标，随后自动恢复；不按修饰键的普通右键仍会打开菜单。
- **多屏定位**：在角色右键菜单或托盘菜单的“窗口位置”中，可把桌宠定位到当前显示器的左上、右上、左下、右下或中央，也可选择“下一显示器”循环移动到其他屏幕。
- **空闲低功耗**：可在设置中启用并调整空闲等待时间和空闲帧率。默认在 60 秒无输入后把渲染降至 15 FPS；键盘、鼠标或手柄再次活动时会恢复正常帧率。
- **本地统计**：设置页显示累计输入次数和角色互动次数，并可手动清零。统计只保存在本机应用数据中，不会上传。
- **模型收藏**：在“设置 → 模型”中点击模型卡片上的星标进行收藏；点击“随机收藏”可切换到一个收藏模型。有多个收藏时会优先避开当前模型，未收藏任何模型时会给出提示。
- **透明 PNG**：从角色右键菜单或托盘菜单选择“复制桌宠图片”，可把当前角色的透明背景图复制到剪贴板；选择“保存桌宠图片”，可另存为透明 PNG。图片仅包含角色本身，不包含桌面背景、互动气泡或按键面板。

以上功能是在开源版基础上独立实现、并参考同类桌宠体验的改进，不代表 Steam 版本的私有功能、素材或全部交互细节已被完整复刻。

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
