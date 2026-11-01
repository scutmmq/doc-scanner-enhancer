# 手机文档扫描与可读性增强系统 (DocScanner-Enhancer)

> 华南理工大学 计算机科学与工程学院《数字图像处理》课程设计大作业 · 课题一  
> 任课教师：沃焱 教授  
> 核心原则：**纯传统数字图像处理算法驱动，严禁深度学习黑盒，Downstream RapidOCR 作为客观评测标尺。**

---

## 📸 系统效果展示与架构

系统模拟“扫描全能王”类应用的核心图像处理流程，解决手机拍摄普遍存在的**透视畸变、强烈光照阴影、周期性网纹/摩尔纹、散焦运动模糊、字迹淡化与墨晕**等退化问题。

```
[手机拍摄原图]
      ↓ (1) 几何校正 (Canny 边缘 -> 凸包四边形拟合 -> 透视单应变换)
      ↓ (2) 色彩空间解耦 (RGB -> HSV / YCbCr 亮度通道分离)
      ↓ (3) 空间域去阴影 (大尺度形态学背景光照估计 -> Retinex 除法归一化 -> CLAHE 局部自适应均衡 -> 伽马自适应)
      ↓ (4) 频域滤波去网纹 (2D-FFT 频谱分析 -> 频谱能量中心化 -> 孤立脉冲亮峰检测 -> 高斯陷波带阻滤波)
      ↓ (5) 退化建模与模糊复原 (散焦/运动 PSF 点扩散函数建模 -> 维纳反卷积滤波)
      ↓ (6) 局部自适应二值化 (拉普拉斯高频锐化 -> Sauvola 动态阈值 $O(1)$ 积分图加速 -> 笔画软融合抗锯齿)
      ↓ (7) 下游客观量化评测 (PSNR, SSIM, 图像信息熵, RapidOCR 识别率 CER/WER 对比看板)
[最终高清可读文档 + 提取纯文本]
```

---

## 🛠️ 技术栈与工程规范

- **核心算法层**：Python 3.12 + NumPy 2.x + OpenCV 4.x + SciPy 1.x
- **后端服务层**：FastAPI + Uvicorn + Pydantic v2
- **评测引擎**：RapidOCR (ONNX Runtime CPU 纯本地推理) + Levenshtein 编辑距离
- **交互工作台**：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + GSAP (微动效)
- **UI 设计规范**：遵循 `frontend-design`、`ui-ux-pro-max`、`web-design-guidelines`（暗房工作台质感，双联视窗 Before/After 滑块对比，44×44px 触控区，WCAG AA 4.5:1 对比度，等宽字体指标对齐）。

---

## 🚀 快速启动指南

### 1. 激活虚拟环境与安装依赖
```bash
# 激活 Python 虚拟环境 (Mac/Linux)
source .venv/bin/activate

# 安装核心算法与后端依赖
pip install -r requirements.txt
```

### 2. 运行自动化单元测试
```bash
# 执行全部 9 项算法与流水线测试
pytest tests/ -v
```

### 3. 使用 CLI 命令行进行单张 / 批量测试
```bash
# 测试单张图片，自动输出 6 个阶段过程图与评测报告
python -m src.cli --input data/samples/test1_shadow.png --output-dir data/outputs/

# 批量处理某个文件夹下的所有图片
python -m src.cli --input data/samples/ --output-dir data/outputs/
```

### 4. 启动前后端交互工作台 (答辩演示推荐)
```bash
# 启动算法与 Web 服务 (默认端口 8080，避免 8000 冲突)
python -m src.server
```
打开浏览器访问：`http://localhost:8080` 即可直接操作！

如需进行前端热重载开发：
```bash
npm --prefix frontend run dev
```
前端开发服务器为：`http://localhost:5173`。

---

## 📁 项目目录结构

```
doc-scanner-enhancer/
├── CLAUDE.md                    # Claude 规范
├── AGENTS.md                    # Agent 通用规则
├── GEMINI.md                    # Antigravity 原生规则
├── README.md                    # 项目文档
├── requirements.txt             # Python 核心依赖
├── pyproject.toml               # pytest 配置
├── package.json                 # 快捷启动命令
├── src/                         # 核心算法与后端服务
│   ├── algorithms/              # 6 大传统图像处理算法包
│   │   ├── geometric.py         # 1. 边缘检测与透视变换
│   │   ├── color_space.py       # 2. 色彩解耦与通道分离
│   │   ├── illumination.py      # 3. 形态学背景除法去阴影与 CLAHE
│   │   ├── frequency.py         # 4. 2D-FFT 频谱分析与高斯陷波去网纹
│   │   ├── restoration.py       # 5. PSF 建模与维纳滤波去模糊
│   │   └── binarization.py      # 6. 拉普拉斯锐化与 Sauvola 动态二值化
│   ├── evaluation/              # 7. 客观评测与 OCR 标尺
│   │   ├── metrics.py           # PSNR, SSIM, 熵计算
│   │   ├── ocr_evaluator.py     # RapidOCR 评测与 CER/WER
│   │   └── generate_samples.py  # 真实退化测试样本库生成器
│   ├── pipeline.py              # 全流程串联管线
│   ├── cli.py                   # 命令行工具
│   └── server.py                # FastAPI 接口服务
├── frontend/                    # React 19 暗房工作台
│   ├── src/components/
│   │   ├── DarkroomViewer.tsx   # 双重视窗滑块对比组件
│   │   ├── ParameterPanel.tsx   # 专家级超参数微调面板
│   │   ├── StageStepper.tsx     # 7 大阶段流动查看器
│   │   └── MetricsDashboard.tsx # 客观指标与 OCR 看板
│   └── dist/                    # 生产打包静态资源 (已构建完成)
├── tests/                       # 全量自动化测试集 (9 项全部通过)
└── data/
    ├── samples/                 # 手机拍摄退化测试图
    ├── ground_truth/            # 标准扫描图与真实文本对照标注
    └── outputs/                 # 处理产物与各阶段中间图
```

---

## 👥 贡献与权限规则
* **主分支推送权限**：仅限仓库所有者写入。
* **团队协同**：组员由所有者邀请加入 Collaborator 后即可推送；外部贡献请通过 Fork 提交 Pull Request。
