# CLAUDE.md — 手机文档扫描与可读性增强系统 (DocScanner-Enhancer)

本文件是本项目（华南理工大学《数字图像处理》课程设计大作业 · 课题一）的全局开发指导规范与工作流准则。所有 Agent 在阅读代码、规划功能、实现算法及构建界面时必须默认遵循。

---

## 📌 项目基本信息与核心红线

- **项目名称**：手机文档扫描与可读性增强系统 (`DocScanner-Enhancer`)
- **考核课程**：华南理工大学 计算机科学与工程学院 《数字图像处理》（任课教师：沃焱）
- **核心红线（必须严格遵守）**：
  1. **纯传统数字图像处理算法**：**严禁使用任何深度学习/神经网络（如 CNN、U-Net、GAN、Transformer 等）作为图像增强的核心算法**。所有算法必须基于经典图像处理理论与数学模型（以 Gonzalez《数字图像处理》第四版为理论基准）。
  2. **OCR 的合法定位**：下游 OCR 引擎（如 Tesseract、EasyOCR、PaddleOCR）仅作为**量化评测的标尺（Evaluation Metric）**，用于客观证明本系统增强前后识别准确率的提升，**不得**使用 OCR 自带的图像前处理黑盒替代本系统的算法实现。
  3. **模块化与可解释性**：每个处理阶段必须能输出中间结果图（用于报告撰写、答辩 PPT 展示与算法过程论述）。

---

## 🔬 课题一 核心算法流水线（7 大标准阶段）

系统必须严格实现以下 7 个处理模块，各模块应具备独立的算法逻辑与可调参数：

```
[手机拍摄原图]
      ↓
(1) 预处理与几何矫正 (边缘检测 -> 轮廓提取 -> 凸包检测 -> 透视变换矫正)
      ↓
(2) 色彩空间转换与通道分离 (RGB -> HSV / YCbCr，分离亮度通道 V/Y 与色度通道)
      ↓
(3) 空间域光照校正与阴影去除 (背景照度估计 -> 除法归一化 -> CLAHE 局部直方图均衡 -> 伽马自适应校正)
      ↓
(4) 频率域滤波抑制网纹/摩尔纹 (2D-FFT 频谱分析 -> 频谱中心化 -> 陷波滤波器/带阻滤波器消除周期性脉冲)
      ↓
(5) 退化建模与模糊复原 (建立散焦/运动点扩散函数 PSF -> 维纳滤波 Wiener Deconvolution 逆滤波抑制噪声)
      ↓
(6) 局部自适应二值化与文字锐化 (拉普拉斯/高提升锐化边缘 -> Sauvola / Niblack / Otsu 局部动态阈值分割)
      ↓
(7) 综合质量与 OCR 识别率量化评测 (计算 PSNR, SSIM, 字符识别准确率 CER/WER，输出量化对比表)
      ↓
[最终高清可读文档 + OCR 提取文本]
```

### 关键算法理论规范
* **阴影消除**：利用大核形态学闭运算或高斯模糊估算低频光照背景 $I_{bg}$，通过反射模型 $R = I / I_{bg}$ 还原真实纸面白度。
* **频域去网纹**：计算 2D 离散傅里叶变换的对数幅度谱，自动检测除直流分量外的异常孤立亮峰，设计对应坐标的高斯陷波带阻滤波器（Gaussian Notch Reject Filter）。
* **维纳滤波复原**：退化模型 $G(u, v) = H(u, v)F(u, v) + N(u, v)$，复原传递函数 $W(u, v) = \frac{H^*(u, v)}{|H(u, v)|^2 + K}$，其中 $K$ 作为信噪比相关的平滑调优参数。
* **二值化**：针对不均匀光照与阴影残差，优先选用 Sauvola 局部自适应阈值：$T(x,y) = m(x,y) \cdot [1 + k \cdot (\frac{s(x,y)}{R} - 1)]$，保护笔画细节。

---

## 🎨 前端 UI/UX 与交互开发规范（必须激活相应 Skills）

在构建 Web 或桌面端演示交互系统时，必须严格参考并调用本地已配置的技能体系：
* **`frontend-design`**（Anthropic 官方设计规范）：
  * **摒弃通用模板与廉价感（No AI Slop）**：严禁使用烂大街的紫色大渐变、过度浮夸的发光阴影和千篇一律的卡片堆叠。
  * **贴合专业工具调性**：界面以暗房工作台/专业扫描仪为设计隐喻，采用深邃细腻的中性色阶（如 Slate / Zinc / Neutral），以精细的单色强调（如工程蓝或暖黄）作为点缀。
  * **排版层级严谨**：界面标签与正文采用清晰的无衬线体，算法指标（PSNR、SSIM、耗时、阈值）必须使用等宽字体（Monospace）排布对齐。
* **`ui-ux-pro-max` & `web-design-guidelines`**：
  * **双重视窗对比（Side-by-side Viewport）**：必须提供“原图 vs 处理后”的滑块对比（Before/After Slider）或分步折叠面板。
  * **操作反馈**：图像滤镜处理需带有清晰的加载骨架/Progress Bar，禁止无反馈静默等待。
  * **触控与无障碍**：按钮与滑块最小点击热区 $\ge 44 \times 44\text{px}$，文本与背景对比度满足 WCAG AA 4.5:1。
* **`gsap` 动效库**：
  * 面板展开、图片对比切换使用平滑自然的缓动曲线（`power2.out` / `expo.out`），禁止突兀的 0ms 状态跳变。
  * 尊重系统的 `prefers-reduced-motion` 设置。
* **`shadcn`**：
  * 若使用前端全栈，组件优先采用基于 Radix Primitives 的现代无障碍设计，利用 Tailwind 样式规范统一管理 Tokens。

---

## 📁 推荐工程目录结构

```
doc-scanner-enhancer/
├── CLAUDE.md                    # 本规范文档
├── AGENTS.md                    # 智能体通用规则
├── README.md                    # 项目介绍与快速开始
├── .gitignore                   # Git 忽略配置
├── requirements.txt             # Python 依赖清单
├── docs/                        # 课程文档、开题与大作业报告
│   ├── 任务书及评分标准.docx
│   └── 课程设计报告-模板.doc
├── src/
│   ├── algorithms/              # 核心传统图像处理算法模块（纯 Numpy/OpenCV/Scipy）
│   │   ├── __init__.py
│   │   ├── geometric.py         # 边缘检测、角点提取、透视变换矫正
│   │   ├── color_space.py       # 色彩空间变换与亮度色度通道解耦
│   │   ├── spatial_enhance.py   # 阴影去除、CLAHE、自适应伽马校正
│   │   ├── frequency_filter.py  # 2D-FFT 频谱分析、陷波/带阻滤波器去网纹
│   │   ├── restoration.py       # PSF 建模、维纳滤波去模糊
│   │   └── binarization.py      # 拉普拉斯锐化、Sauvola/Otsu 自适应二值化
│   ├── pipeline.py              # 全流程串联管线（支持单步调试与批量执行）
│   ├── evaluation/              # 客观评价与 OCR 量化评测
│   │   ├── __init__.py
│   │   ├── metrics.py           # PSNR, SSIM 计算
│   │   └── ocr_eval.py          # OCR 识别准确率评测流水线
│   └── ui/                      # 演示界面系统（Web / Desktop GUI）
│       └── app.py
├── tests/                       # 单元测试与测试样本集
└── data/                        # 示例图片
    ├── samples/                 # 手机拍摄的退化测试图（发票、教材、带网纹屏幕照）
    └── ground_truth/            # 标准扫描图与真实文本对照标注
```

---

## 💻 常用开发与运行命令

```bash
# 激活 Python 虚拟环境
source .venv/bin/activate  # macOS/Linux

# 安装核心依赖
pip install -r requirements.txt

# 运行单张图片全流程测试并输出分步图
python -m src.pipeline --input data/samples/test1.jpg --output-dir outputs/

# 运行客观指标与 OCR 识别率评测
python -m src.evaluation.ocr_eval --samples-dir data/samples/

# 启动交互式演示系统
python -m src.ui.app
```

---

## 👥 答辩与课程设计报告得分要点

1. **过程图必须完整**：每个算法步骤必须有图前分析、原理公式说明、参数对比（例如：不同伽马值对阴影的消除效果图、滤波前后 2D 频谱图对比、二值化阈值对比）。
2. **定量数据支撑**：报告中必须有一张清晰的“增强前后 OCR 识别率与 PSNR/SSIM 提升对比表”，用数据证明算法工程的有效性。
3. **答辩演示稳健**：演示系统应支持用户实时上传一张新拍的手机照片，几秒内一键完成高清还原与文字提取，给评委老师直观震撼的演示体验。
