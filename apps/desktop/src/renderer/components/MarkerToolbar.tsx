import React from "react";

interface MarkerToolbarProps {
  enabled: boolean;
  color: string;
  width: number;
  displayMode: "fit" | "native";
  wheelDirection: "standard" | "natural";
  fullscreen: boolean;
  minimized?: boolean;
  onToggle: () => void;
  onEnable: () => void;
  onDisplayModeChange: (mode: "fit" | "native") => void;
  onWheelDirectionChange: (direction: "standard" | "natural") => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  hasStrokes: boolean;
  onToggleFullscreen: () => void;
  onToggleMinimized?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const COLORS = ["#ff6b6b", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585", "#ffffff"];
const WIDTHS = [2, 4, 8, 12];

export function MarkerToolbar({
  enabled,
  color,
  width,
  displayMode,
  wheelDirection,
  fullscreen,
  minimized = false,
  onToggle,
  onEnable,
  onDisplayModeChange,
  onWheelDirectionChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onClear,
  canUndo,
  hasStrokes,
  onToggleFullscreen,
  onToggleMinimized,
  dragHandleProps,
}: MarkerToolbarProps): React.ReactElement {
  const compact = fullscreen;

  return (
    <div
      style={{
        ...rootStyle,
        ...(compact ? floatingRootStyle(minimized) : inlineRootStyle),
      }}
    >
      <div
        {...dragHandleProps}
        style={{
          ...headerStyle,
          cursor: compact ? "move" : "default",
          ...(dragHandleProps?.style ?? {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: enabled ? "#4cc9f0" : "rgba(255,255,255,0.3)",
              boxShadow: enabled ? "0 0 10px rgba(76, 201, 240, 0.7)" : "none",
            }}
          />
          <div>
            <div style={{ color: "#fff", fontSize: compact ? 12 : 13, fontWeight: 700 }}>マーカーツール</div>
            <div style={{ color: "#8ea7c2", fontSize: 11 }}>
              {enabled ? "描画中" : "描画待機"} / {hasStrokes ? "注釈あり" : "注釈なし"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onToggleMinimized && (
            <ToolbarButton
              label={minimized ? "戻す" : "最小化"}
              tooltip={minimized ? "ツールボックスを展開" : "ツールボックスを半透明の最小表示にする"}
              onClick={onToggleMinimized}
              compact
            />
          )}
          <ToolbarButton
            label={fullscreen ? "全画面終了" : "全画面"}
            tooltip={fullscreen ? "全画面表示を終了" : "映像を全画面表示にする"}
            onClick={onToggleFullscreen}
            compact
          />
        </div>
      </div>

      {!minimized && (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 12 }}>
          <Section label="表示">
            <div style={segmentedStyle}>
              <ToolbarButton
                label="フィット"
                tooltip="映像全体が収まるように縮小表示"
                onClick={() => onDisplayModeChange("fit")}
                selected={displayMode === "fit"}
              />
              <ToolbarButton
                label="等倍"
                tooltip="共有画面を原寸に近い倍率で表示"
                onClick={() => onDisplayModeChange("native")}
                selected={displayMode === "native"}
              />
            </div>
            <ToolbarButton
              label={`ホイール: ${wheelDirection === "standard" ? "Windows" : "Mac"}`}
              tooltip="スクロール方向を Windows 方式と Mac 方式で切り替える"
              onClick={() => onWheelDirectionChange(wheelDirection === "standard" ? "natural" : "standard")}
            />
          </Section>

          <Section label="描画">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <ToolbarButton
                label={enabled ? "マーカーON" : "マーカーOFF"}
                tooltip={enabled ? "マーカー描画を有効化" : "マーカー描画を無効化"}
                onClick={onToggle}
                selected={enabled}
                emphasis
              />
              <div style={swatchGroupStyle}>
                {COLORS.map((option) => (
                  <TooltipBubble key={option} text={`色を ${option} に変更`}>
                    <button
                      onClick={() => {
                        onColorChange(option);
                        onEnable();
                      }}
                      aria-label={`marker-color-${option}`}
                      style={{
                        width: compact ? 18 : 20,
                        height: compact ? 18 : 20,
                        borderRadius: 999,
                        border: color === option ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)",
                        background: option,
                        boxShadow: color === option ? "0 0 0 2px rgba(76, 201, 240, 0.25)" : "none",
                      }}
                    />
                  </TooltipBubble>
                ))}
              </div>
              <div style={swatchGroupStyle}>
                {WIDTHS.map((option) => (
                  <ToolbarButton
                    key={option}
                    label={`${option}px`}
                    tooltip={`線の太さを ${option}px に変更`}
                    onClick={() => onWidthChange(option)}
                    selected={width === option}
                    compact
                  />
                ))}
              </div>
            </div>
          </Section>

          <Section label="マーカー注釈">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ToolbarButton
                label="1本戻す"
                tooltip="最後に描いたマーカー線を 1 本だけ取り消す"
                onClick={onUndo}
                disabled={!canUndo}
              />
              <ToolbarButton
                label="注釈を全削除"
                tooltip="描かれているマーカー注釈をすべて消す"
                onClick={onClear}
                disabled={!hasStrokes}
              />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#7f95ae", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{label}</div>
      {children}
    </div>
  );
}

function ToolbarButton({
  label,
  tooltip,
  onClick,
  disabled = false,
  selected = false,
  compact = false,
  emphasis = false,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
  emphasis?: boolean;
}): React.ReactElement {
  return (
    <TooltipBubble text={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: compact ? "5px 9px" : "7px 11px",
          borderRadius: 10,
          border: selected ? "1px solid #4cc9f0" : "1px solid rgba(255,255,255,0.14)",
          background: disabled
            ? "rgba(255,255,255,0.05)"
            : emphasis && selected
              ? "linear-gradient(135deg, rgba(76,201,240,0.35), rgba(76,201,240,0.18))"
              : selected
                ? "rgba(76, 201, 240, 0.16)"
                : "rgba(255,255,255,0.06)",
          color: disabled ? "rgba(255,255,255,0.38)" : "#fff",
          fontSize: compact ? 11 : 12,
          fontWeight: selected || emphasis ? 700 : 500,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    </TooltipBubble>
  );
}

function TooltipBubble({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      style={tooltipWrapStyle}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <div style={{ ...tooltipStyle, opacity: open ? 1 : 0, visibility: open ? "visible" : "hidden" }}>{text}</div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  color: "#fff",
  userSelect: "none",
};

const inlineRootStyle: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 16,
  background: "linear-gradient(180deg, rgba(18,31,54,0.96), rgba(11,18,32,0.94))",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 16px 30px rgba(0,0,0,0.28)",
  minWidth: 420,
};

function floatingRootStyle(minimized: boolean): React.CSSProperties {
  return {
    width: minimized ? 240 : 320,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: minimized ? "8px 10px" : "10px 12px 12px",
    borderRadius: 16,
    background: minimized
      ? "rgba(10, 16, 28, 0.52)"
      : "linear-gradient(180deg, rgba(14,22,39,0.92), rgba(8,12,22,0.9))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 18px 36px rgba(0,0,0,0.32)",
    backdropFilter: "blur(14px)",
  };
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const segmentedStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const swatchGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  padding: "4px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
};

const tooltipWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
};

const tooltipStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(100% + 10px)",
  transform: "translateX(-50%)",
  padding: "7px 9px",
  borderRadius: 8,
  background: "rgba(6, 10, 18, 0.94)",
  color: "#e9f1ff",
  fontSize: 11,
  lineHeight: 1.4,
  minWidth: 120,
  maxWidth: 220,
  textAlign: "center",
  boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
  border: "1px solid rgba(255,255,255,0.12)",
  pointerEvents: "none",
  opacity: 0,
  visibility: "hidden",
  transition: "opacity 120ms ease",
  zIndex: 30,
};
