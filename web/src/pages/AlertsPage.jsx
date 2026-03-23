import React from "react";
export default function AlertsPage() {
  return (
    <div className="alerts-card">
      <div className="alert-placeholder">
        <div className="alert-orb" />
        <h3 className="panel-title" style={{ marginBottom: 0 }}>智能预警中心</h3>
        <div className="muted" style={{ maxWidth: 520 }}>
          预警页面正在升级中。下一阶段将支持价格异动、成交量突变、区间突破、组合阈值与多条件触发。
        </div>
      </div>
    </div>
  );
}
