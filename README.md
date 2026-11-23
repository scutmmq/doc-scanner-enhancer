# DocScanner-Enhancer

**DocScanner-Enhancer** 是一套基于纯传统数字图像处理理论构建的高精度文档扫描、退化复原与可读性增强系统。系统提供从 3D 透视矫正、非均匀阴影消除、2D-FFT 频域去网纹、维纳反卷积去模糊、Sauvola 局部动态二值化到下游 OCR 可读性评测的完整管线，并配备现代化的 Web 交互式暗房工作台与 CLI 批处理工具。

---

## 核心特性

- **光学暗房开屏引导与极简/专业双模式工作台**：首次访问展示实时光学激光扫描互动开屏（支持替换挂载自定义 `frontend/public/hero-intro.mp4` 宣传视频）；工作台默认进入新手友好的「极简模式」，一键切换「专业视图」即可展开完整 7 阶段算子调参、中间诊断图层与分辨率实验工具。
- **纯传统信号自动退化诊断**：零深度学习依赖，基于 Canny 凸包轮廓、8 邻域孤立极值、纸面白点色差、2D-FFT 孤立亮峰、形态学照度落差、Crete 再模糊梯度衰减率与方向各向异性，自动诊断 7 类拍摄退化与红章批注并匹配最优修复方案。
- **4K 手机原图金字塔与红章/批注彩印模式**：对 12MP/4K 实拍照片自动执行多尺度工作金字塔（2200px 级 300 DPI 输出 + 原图坐标 1:1 对齐）与 EXIF 方向校正；新增「红章 / 批注彩印」模式，白底黑字同时完整保留暗影中的鲜艳公章与蓝笔批注。
- **PWA 移动端适配与局域网扫码无线拍传**：支持移动端浏览器安装为 PWA 或相机直拍，同时内置电脑端局域网二维码生成与 SSE 实时回传接力，同一 Wi-Fi 下手机拍照或选图秒传电脑大屏处理，照片全程本地流转。
- **几何透视矫正**：结合 Canny 边缘检测、Otsu 双阈值分割回退与凸包 Douglas-Peucker 四边形拟合，自动检测倾斜纸张四角并执行单应性透视变换（Homography），同时支持前端视窗交互式四角点手动校准。
- **色彩解耦与纸白平衡**：支持 RGB 与 HSV / YCbCr 空间无损解耦，内置灰度世界（Gray World）与纸面高分位白点先验（Paper-White Prior）自动色偏校正。
- **空间域去噪与零黑环去阴影**：提供中值、双边与高斯空域去噪；利用椭圆形结构元素形态学闭运算（Morphological Closing）在单调斜坡上的零位移恒等性质估算低频照度背景，通过 Retinex 除法归一化、分位数线性对比度拉伸、CLAHE 局部均衡与高白度先验自适应伽马校正还原净白纸面。
- **2D-FFT 频域陷波去摩尔纹**：基于二维离散傅里叶变换（2D-FFT）与方向脊线感知的局部显著性寻峰算法，在保护正文水平行距谐波的前提下，精准定位并滤除屏幕翻拍产生的周期性干涉条纹（Gaussian Notch Reject Filter）。
- **多模型 PSF 维纳反卷积去模糊**：支持圆盘散焦（Circular Disk PSF）、线性运动模糊（Linear Motion PSF）与光学高斯模糊（Gaussian PSF）建模，采用边界复制延拓与二阶拉普拉斯频域正则化抑制吉布斯振铃。
- **锐化与抗锯齿自适应二值化**：集成拉普拉斯二阶微分锐化、盒式积分图 $O(1)$ 加速的 Sauvola / Niblack / Otsu 阈值分割、连通域微杂点剔除及边缘抗锯齿灰阶软融合。
- **SSE 实时阶段进度与质量诊断引擎**：通过 Server-Sent Events 逐阶段推送增强进度条，杜绝大图静默等待；内置 DPI 空间重采样（60–300 DPI）与灰度位深量化（1–8 bit）分析器，实时计算 PSNR、SSIM、纸面均匀度、对比噪比（CNR）、信息熵及 RapidOCR 字符识别准确率（CER / WER）。

---

## 算法流水线架构

```
[输入文档图像]
      │
      ├─► Stage 1: 几何矫正 (Canny/Otsu 轮廓提取 → 凸包四边形拟合 → 透视单应性变换)
      ├─► Stage 2: 色彩解耦 (自动纸白平衡纠偏 → RGB ↔ HSV / YCbCr 亮度通道分离)
      ├─► Stage 3: 光照校正 (空域平滑降噪 → 椭圆形态学闭运算照度估计 → Retinex 除法 → CLAHE + 自适应伽马)
      ├─► Stage 4: 频域滤波 (2D-FFT 中心化频谱 → 方向脊线显著性寻峰 → 共轭对称高斯陷波滤波)
      ├─► Stage 5: 模糊复原 (散焦/运动/高斯 PSF 建模 → 零相位对齐与拉普拉斯正则化维纳反卷积)
      ├─► Stage 6: 锐化二值 (拉普拉斯高频锐化 → Sauvola 积分图动态阈值 → 连通域净噪与软融合)
      └─► Stage 7: 质量诊断 (PSNR / SSIM / 均匀度 / CNR / 信息熵 + RapidOCR 文本提取与 CER/WER 评测)
      │
[高清扫描文档 + 提取文本 + 阶段分析图]
```

---

## 基准场景实测表现

在涵盖 6 类典型拍摄退化的标准测试集上，系统各项客观画质指标与 OCR 识别率实测数据如下：

| 测试场景 | 样本文件 | 修复前 PSNR | 增强后 PSNR | 修复前 SSIM | 增强后 SSIM | 修复前识别率 | 增强后识别率 | 识别率净提升 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **侧光与手影遮挡** | `test1_shadow.png` | 5.28 dB | **25.46 dB** | 0.6374 | **0.9678** | 47.75% | **98.88%** | **+51.13%** |
| **屏幕翻拍摩尔纹** | `test2_moire.png` | 8.18 dB | **23.88 dB** | 0.1131 | **0.9681** | 48.31% | **98.50%** | **+50.19%** |
| **微距失焦模糊** | `test3_defocus.png` | 9.07 dB | **19.89 dB** | 0.7721 | **0.9249** | 91.01% | **97.00%** | **+5.99%** |
| **斜拍透视与复合干扰** | `test4_complex_degraded.png` | 3.07 dB | **23.21 dB** | 0.1134 | **0.8474** | 47.00% | **99.06%** | **+52.06%** |
| **手持抖动重影** | `test5_motion_blur.png` | 9.06 dB | **23.76 dB** | 0.7869 | **0.9588** | 6.18% | **97.57%** | **+91.39%** |
| **暖光偏色与噪点** | `test6_color_cast_noise.png` | 3.51 dB | **21.55 dB** | 0.1468 | **0.9396** | 41.76% | **94.19%** | **+52.43%** |

---

## 快速开始（基于 `uv`）

本项目采用 [uv](https://docs.astral.sh/uv/) 进行 Python 依赖与虚拟环境管理，无需手动激活虚拟环境即可一键运行。

### 1. 同步环境依赖

```bash
# 自动解析 pyproject.toml 与 uv.lock 并安装依赖
uv sync
```

### 2. 启动 Web 交互式工作台

```bash
uv run docscanner-server
# 或运行: uv run python -m src.server
```

服务启动后在浏览器打开 `http://localhost:8080`（端口占用时自动顺延至 `8088`）：
- 支持**拖拽上传**、**点击选择文件**、**直接按 `⌘V` / `Ctrl+V` 粘贴截图**，或点击顶栏「**手机拍传**」扫码实现同一 Wi-Fi 下手机拍照秒传电脑。
- 默认进入**极简模式**：自动展示纯传统退化诊断报告、4 大成片风格（含「红章 / 批注彩印」）与 OCR 文字一键复制；顶栏可随时切换至**专业视图**微调全部 7 阶段算子与查看中间诊断图层。
- **自定义开屏动画视频**：将任意 16:9 静音循环 MP4 宣传视频保存为 `frontend/public/hero-intro.mp4` 并重新执行 `npm --prefix frontend run build` 即可自动替换内置实时 Canvas 光学激光扫描演示。

### 3. 命令行批处理工具 (CLI)

```bash
# 处理单张图像并导出全部中间阶段图与评测报告
uv run docscanner --input data/samples/test1_shadow.png --output-dir data/outputs/

# 批量处理整个目录并生成汇总报表 data/outputs/benchmark_summary.md
uv run docscanner --input data/samples/ --output-dir data/outputs/
```

### 4. 运行自动化测试

```bash
uv run pytest -v
```

### 5. 前端开发与构建

```bash
# 启动 Vite 前端热更新开发服务器 (http://localhost:5173)
npm --prefix frontend run dev

# 构建生产环境静态资源至 frontend/dist
npm --prefix frontend run build
```

---

## 目录结构

```
doc-scanner-enhancer/
├── pyproject.toml                   # uv / PEP 621 项目配置与命令入口
├── uv.lock                          # uv 确定性依赖锁文件
├── requirements.txt                 # pip 兼容依赖清单
├── package.json                     # 根级快捷脚本
├── src/
│   ├── algorithms/                  # 传统数字图像处理核心算子库
│   │   ├── auto_diagnose.py         # 纯传统信号 7 类退化与红章自动诊断引擎
│   │   ├── geometric.py             # 边缘检测、凸包拟合与透视变换（支持 4K 缩放）
│   │   ├── color_space.py           # 色彩空间解耦、自动纸白平衡与红章彩印保真
│   │   ├── illumination.py          # 空域降噪、形态学背景估计与 CLAHE
│   │   ├── frequency.py             # 2D-FFT 频谱分析与高斯陷波滤波器
│   │   ├── restoration.py           # 多模型 PSF 建模与正则化维纳滤波
│   │   ├── binarization.py          # 拉普拉斯锐化与 Sauvola 自适应二值化
│   │   └── sampling_quantization.py # 空间采样率 (DPI) 与灰度位深重采样分析
│   ├── evaluation/                  # 画质诊断与 OCR 评测模块
│   │   ├── metrics.py               # PSNR, SSIM, 均匀度, CNR, 信息熵计算
│   │   ├── ocr_evaluator.py         # RapidOCR 文本识别与 CER/WER 计算
│   │   └── generate_samples.py      # 6 类标准退化测试样本合成器
│   ├── pipeline.py                  # 7 阶段全流程处理管线（4K 金字塔与进度回调）
│   ├── cli.py                       # 命令行批处理入口
│   └── server.py                    # FastAPI 服务（SSE 进度流与局域网 QR 手机拍传）
├── frontend/                        # React 19 + TypeScript + Tailwind + GSAP 工作台
│   ├── public/                      # PWA manifest、应用图标与可选 hero-intro.mp4 挂载目录
│   ├── src/
│   │   ├── App.tsx                  # 主应用（双模式工作台、SSE 流式消费、扫码路由）
│   │   └── components/
│   │       ├── HeroIntro.tsx        # GSAP + 光学扫描 Canvas / 视频开屏交互引导
│   │       ├── SimpleSmartPanel.tsx # 极简模式自动诊断报告、风格直选与文字复制
│   │       ├── PhoneRelayModal.tsx  # 桌面端局域网二维码手机无线拍传弹窗
│   │       ├── MobileCaptureView.tsx# 手机扫码无线拍传伴侣页（原生相机/相册直传）
│   │       ├── DarkroomViewer.tsx   # 滑块对比、双联视窗、SSE 进度条与四角点校准
│   │       ├── ParameterPanel.tsx   # 场景预设与 6 阶段实时调参面板
│   │       ├── MetricsDashboard.tsx # 文字提取复制与画质诊断看板
│   │       ├── StageStepper.tsx     # 处理步骤拆解与诊断图层切换器
│   │       └── SamplingLabPanel.tsx # 分辨率与灰度位深重采样工具
│   └── dist/                        # 前端生产构建产物
├── tests/                           # Pytest 自动化单元测试套件
└── data/
    ├── samples/                     # 内置典型问题测试样张
    ├── ground_truth/                # 标准对照真值图与文本
    └── outputs/                     # 批处理输出目录
```
