# BlueWhitePet 模型库

BlueWhitePet 将每个形象保存为一个独立目录。内置模型位于 `src-tauri/assets/models`，用户从“设置 → 模型”导入的目录会复制到应用数据目录；两者使用同一种包结构。

## 推荐目录结构

```text
my-pet/
├─ pet-model.json
├─ cat.model3.json
├─ model.moc3
├─ model.1024/
│  └─ texture_00.png
├─ motions/
├─ expressions/
└─ resources/
   └─ cover.png
```

`.model3.json` 中引用的文件名可以不同，但所有引用必须留在当前模型目录内。封面建议使用透明 PNG。

## pet-model.json

```json
{
  "schemaVersion": 2,
  "presetKey": "my-pet-standard",
  "displayName": "我的桌宠 · 标准模式",
  "renderer": "live2d",
  "mode": "standard",
  "entry": "cat.model3.json",
  "cover": "resources/cover.png",
  "interactionBounds": { "x": 0.12, "y": 0.02, "width": 0.74, "height": 0.76 },
  "bubbleBounds": { "x": 0.02, "y": 0.02, "width": 0.36, "height": 0.20 },
  "hudBounds": { "x": 0.62, "y": 0.03, "width": 0.32, "height": 0.12 },
  "interactions": {
    "tap": [
      {
        "motionGroup": "CAT_motion",
        "motionIndex": 0,
        "expressionIndex": 0,
        "fallback": "jump",
        "weight": 4
      },
      { "fallback": "shake", "weight": 1 }
    ]
  },
  "order": 100,
  "default": false
}
```

- `schemaVersion`：当前版本为 `2`。版本 `1` 仍可正常导入，只是不读取下面新增的 v2 字段。
- `presetKey`：包的稳定标识，仅使用小写字母、数字和连字符；内置模型之间不能重复。
- `displayName`：模型卡片显示的名称。
- `renderer`：Live2D 模型使用 `live2d`。
- `mode`：`standard`、`keyboard` 或 `gamepad`，决定键鼠/手柄资源的识别方式。
- `entry`：入口 `.model3.json`，允许放在子目录中，但不能使用绝对路径或 `..`。
- `cover`：模型卡片封面，相对当前包目录。
- `interactionBounds`：可选的角色点击区域，使用相对窗口的 `0～1` 坐标，避免点击桌面或透明区也触发互动。
- `bubbleBounds`：可选的对话气泡安全区，也使用 `0～1` 坐标；未声明时不显示气泡，以免遮挡未知布局的角色。
- `hudBounds`：可选的计数 HUD 安全区，同样使用归一化坐标。未声明时由界面使用兼容布局。
- `interactions.tap`：可选的点击反馈候选数组。每项都要提供 `fallback`（`jump`、`squash` 或 `shake`）与 `(0, 1000]` 范围内的 `weight`；权重只表示候选之间的相对概率。
- `motionGroup` 与 `motionIndex`：可选但必须同时出现，并且必须对应入口 `.model3.json` 中真实存在的动作。省略两者时直接使用 CSS `fallback`，因此图片模型也能声明点击反馈。
- `expressionIndex`：可选的 Live2D 表情下标，必须指向入口文件中真实存在的表情；图片模型不能使用动作或表情字段。
- `order`：内置模型的显示顺序，数字越小越靠前。
- `default`：仅用于内置模型；新安装时最多应有一个默认模型。

内置模型还可使用成对的 `rewardId` 与 `rarity` 建立奖励目录。`rewardId` 是小写 kebab-case 稳定标识；`rarity` 可为 `common`、`uncommon`、`rare`、`epic` 或 `legendary`。这两个字段只由应用自带清单提供：用户导入的自定义模型即使写入同名字段，运行时也会忽略，不能据此授予或冒充内置奖励。

版本 1 manifest 会沿用原有字段。manifest 缺失时，程序仍按原 BongoCat 规则查找 `.model3.json` 并推断模式，因此旧自定义模型无需立即修改。

## 制作多个形象

1. 复制一个已验证的模型包到新的独立目录。
2. 在不改变 UV 尺寸、布局和 alpha 的前提下替换纹理；如果重新绑定骨骼，则用 Cubism Editor 导出完整新包。
3. 修改 `presetKey`、`displayName`、封面和排序。
4. 确认 `.model3.json` 引用的 `.moc3`、纹理、动作、表情和声音都在包内。
5. 在应用的模型页面导入整个目录；manifest 信息会立即显示，重启后仍会保留。

当前 `blue-white-a-standard` 就是第一个可复用模板：它与原 `standard` 包的骨骼、动作、表情和输入参数一致，只替换了角色主纹理与封面。
