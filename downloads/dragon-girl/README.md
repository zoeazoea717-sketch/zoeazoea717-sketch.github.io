# GPT小龙娘

白发紫瞳的小龙智能伙伴，带着淡紫龙角、龙翼和卷尾。ZOEA 制作，使用了 AI 辅助生成。

![小龙娘的待机和跳跃动画](./preview.gif)

## 安装

| 使用位置 | 图集 | 使用方法 |
| --- | --- | --- |
| ChatGPT 桌面端 | [v2 PNG](./spritesheet-extended.png?raw=true) · 1536 × 2288 | 打开发布页的「在桌面端安装」，在客户端确认。需要客户端已启用宠物安装功能。 |
| ChatGPT Work 网页端 | [v1 PNG](./spritesheet-web-v1.png?raw=true) · 1536 × 1872 | 下载图集。在网页的「设置 → 个性化 → 宠物」中选择上传宠物。需要账号或工作区已启用该功能。 |

v2 是当前版的原始动画图集，包含九种基础动作和十六个注视方向。v1 保留同一张图集的九种基础动作。

[完整动作视频](./preview.mp4) · [个人使用许可](./LICENSE.txt) · [官方宠物说明](https://learn.chatgpt.com/docs/pets)

## 发布方法

- **GitHub Releases** 上传 `GPT-Dragon-Girl-v1.0.1.zip` 作为附件。仓库若要展示预览，将解压后的文件放在同一目录。
- **个人站点或 GitHub Pages** 将解压后的文件一起放到同一个 HTTPS 目录，打开 `index.html`。安装按钮会按发布地址生成 v2 安装链接。
- **接入已有页面** 可沿用 `index.html` 中的安装按钮脚本，或手动拼接 `codex://pets/install?name=<URL编码后的名称>&imageUrl=<URL编码后的PNG直链>&spriteVersionNumber=2`。图片地址应让访客直接读取 PNG。GitHub 仓库的文件展示页属于 HTML 页面，请使用 Raw 图片地址或站点文件直链。

[桌面端链接参数](https://learn.chatgpt.com/docs/app/commands#pets)
