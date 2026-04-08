/* ===== label print override ===== */

.equipment-label-page .label-shell {
  padding-top: 20px;
  padding-bottom: 32px;
}

.equipment-label-page .label-hero {
  margin-bottom: 18px;
}

.equipment-label-page .label-hero-topline {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.equipment-label-page .label-hero-title {
  margin: 0 0 10px;
  font-size: 40px;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  font-weight: 800;
}

.equipment-label-page .label-hero-subtext {
  font-size: 17px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.equipment-label-page .label-preview-wrap {
  margin-top: 8px;
}

.equipment-label-page .label-preview-card {
  padding: 22px;
  border: 1px solid #d9dee7;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.05);
}

.equipment-label-page .label-preview-card:hover,
.equipment-label-page .label-preview-card:active {
  transform: none !important;
}

.equipment-label-page .section-head {
  margin-bottom: 18px;
}

.equipment-label-page .section-title {
  position: relative;
  display: inline-block;
  margin: 0;
  padding-left: 16px;
  font-size: 22px;
  line-height: 1.25;
  font-weight: 800;
  color: #0b1f44;
}

.equipment-label-page .section-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
}

.equipment-label-page .section-head .sub-text {
  margin-top: 8px;
  color: #667085;
  font-size: 14px;
  line-height: 1.5;
}

.equipment-label-page .label-sheet {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 0 8px;
}

.equipment-label-page .device-label {
  width: 440px;
  min-height: 220px;
  padding: 20px;
  border: 1px solid #cfd8e3;
  border-radius: 24px;
  background: #fff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px;
  gap: 18px;
  align-items: center;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.equipment-label-page .device-label-main {
  min-width: 0;
}

.equipment-label-page .label-hospital {
  margin-bottom: 10px;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 800;
  color: #0b3b91;
  letter-spacing: -0.01em;
}

.equipment-label-page .label-title {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 900;
  color: #0b1f44;
  letter-spacing: -0.03em;
  word-break: break-word;
}

.equipment-label-page .label-info-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.equipment-label-page .label-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.equipment-label-page .label-row-emphasis {
  margin-bottom: 2px;
}

.equipment-label-page .label-key {
  font-size: 13px;
  line-height: 1.45;
  color: #667085;
  font-weight: 700;
}

.equipment-label-page .label-value {
  font-size: 14px;
  line-height: 1.45;
  color: #0f172a;
  font-weight: 700;
  word-break: break-word;
}

.equipment-label-page .label-value-id {
  font-size: 20px;
  line-height: 1.2;
  font-weight: 900;
  color: #111827;
  letter-spacing: -0.02em;
}

.equipment-label-page .qr-panel {
  display: flex;
  align-items: center;
  justify-content: center;
}

.equipment-label-page .label-qr-box {
  width: 124px;
  height: 124px;
  min-width: 124px;
  min-height: 124px;
  padding: 8px;
  border: 1px solid #dbe3ee;
  border-radius: 18px;
  background: #fff;
  box-sizing: border-box;
}

.equipment-label-page .equipment-label-topbar {
  margin-bottom: 18px;
}

.equipment-label-page .equipment-label-top-actions {
  gap: 10px;
}

@media (max-width: 768px) {
  .equipment-label-page .label-hero-title {
    font-size: 30px;
  }

  .equipment-label-page .top-brand-bar {
    display: block;
    padding: 18px 18px 20px;
    border-radius: 24px;
  }

  .equipment-label-page .equipment-label-top-actions {
    width: 100%;
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .equipment-label-page .equipment-label-top-actions .portal-header-btn {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    justify-content: center;
  }

  .equipment-label-page .label-preview-card {
    padding: 18px;
    border-radius: 24px;
  }

  .equipment-label-page .device-label {
    width: 100%;
    grid-template-columns: 1fr;
    min-height: auto;
    padding: 18px;
  }

  .equipment-label-page .qr-panel {
    justify-content: flex-start;
  }

  .equipment-label-page .label-qr-box {
    width: 132px;
    height: 132px;
    min-width: 132px;
    min-height: 132px;
  }
}

@media (max-width: 480px) {
  .equipment-label-page .equipment-label-top-actions {
    grid-template-columns: 1fr;
  }

  .equipment-label-page .label-preview-card {
    padding: 16px;
    border-radius: 22px;
  }
}

@media print {
  body.equipment-label-page {
    background: #fff;
  }

  .equipment-label-page .no-print,
  .equipment-label-page .top-brand-bar,
  .equipment-label-page .label-hero,
  .equipment-label-page #messageBox {
    display: none !important;
  }

  .equipment-label-page .container.label-shell {
    max-width: none;
    padding: 0;
  }

  .equipment-label-page .label-preview-wrap {
    margin: 0;
  }

  .equipment-label-page .label-preview-card {
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    background: transparent !important;
  }

  .equipment-label-page .label-sheet {
    padding: 0;
    justify-content: flex-start;
  }

  .equipment-label-page .device-label {
    width: 90mm;
    min-height: 48mm;
    padding: 4mm;
    border: 1px solid #111827;
    border-radius: 4mm;
    box-shadow: none;
    gap: 4mm;
    grid-template-columns: 1fr 28mm;
  }

  .equipment-label-page .label-hospital {
    margin-bottom: 2mm;
    font-size: 10pt;
  }

  .equipment-label-page .label-title {
    margin: 0 0 2mm;
    font-size: 18pt;
  }

  .equipment-label-page .label-row {
    grid-template-columns: 18mm 1fr;
    gap: 1.6mm 2mm;
  }

  .equipment-label-page .label-key {
    font-size: 8pt;
  }

  .equipment-label-page .label-value {
    font-size: 8.5pt;
  }

  .equipment-label-page .label-value-id {
    font-size: 13pt;
  }

  .equipment-label-page .label-qr-box {
    width: 26mm;
    height: 26mm;
    min-width: 26mm;
    min-height: 26mm;
    padding: 1.5mm;
    border-radius: 3mm;
  }
}
