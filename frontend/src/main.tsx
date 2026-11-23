import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initGlobalOpticalInteractions } from './utils/opticalFx';

// 启动全站统一光学硬件按钮特效引擎（聚光灯跟踪 + 磁吸物理 + 点击波纹）
initGlobalOpticalInteractions();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
