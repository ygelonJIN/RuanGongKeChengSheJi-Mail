# MailDesk 图标说明

## 应用图标

本目录需要以下图标文件：

1. **icon.png** (256x256) - 应用主图标（PNG格式，用于托盘）
2. **icon.ico** (256x256 多分辨率) - Windows 安装包图标

## 快速生成方法

使用在线工具将 SVG 转换为 ICO：

1. 打开 https://convertio.co/png-ico/
2. 上传 `icon.svg` 或手动设计的图标
3. 下载 `.ico` 文件，命名为 `icon.ico`

或者使用 Python（需安装 Pillow）：

```python
from PIL import Image
img = Image.open('icon.png')
img.save('icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
```

或者直接使用 `icon.png` 作为托盘图标（主进程会自动处理）。

## 推荐设计

- 主色：#2563eb（蓝色）
- 风格：简洁扁平，带邮件/信封元素
- 背景：纯色或圆角矩形
- 确保 16x16 尺寸下仍清晰可辨
