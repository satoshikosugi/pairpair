import React from "react";

interface MarkerToolbarProps {
  enabled: boolean;
  color: string;
  width: number;
  onToggle: () => void;
  onEnable: () => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  hasStrokes: boolean;
  onEnterFullscreen: () => void;
}

const COLORS = ["#ff6b6b", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585", "#ffffff"];
const WIDTHS = [2, 4, 8, 12];

export function MarkerToolbar({
  enabled,
  color,
  width,
  onToggle,
  onEnable,
  onColorChange,
  onWidthChange,
  onUndo,
  onClear,
  canUndo,
  hasStrokes,
  onEnterFullscreen,
}: MarkerToolbarProps): React.ReactElement {
  return (
    <div
      style={{
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <button onClick={onEnterFullscreen} style={ghostButtonStyle}>
        全画面
      </button>
      <button
        onClick={onToggle}
        style={{
          ...solidButtonStyle,
          background: enabled ? "#f72585" : "#243b55",
        }}
      >
        {enabled ? "マーカーON" : "マーカーOFF"}
      </button>
      <div style={chipStyle}>
        {COLORS.map((option) => (
          <button
            key={option}
            onClick={() => {
              onColorChange(option);
              onEnable();
            }}
            aria-label={`marker-color-${option}`}
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              border: color === option ? "2px solid #fff" : "1px solid rgba(255,255,255,0.35)",
              background: option,
            }}
          />
        ))}
      </div>
      <div style={chipStyle}>
        {WIDTHS.map((option) => (
          <button
            key={option}
            onClick={() => onWidthChange(option)}
            style={{
              minWidth: 36,
              padding: "4px 8px",
              borderRadius: 999,
              border: width === option ? "1px solid #4cc9f0" : "1px solid rgba(255,255,255,0.18)",
              background: width === option ? "rgba(76, 201, 240, 0.18)" : "transparent",
              color: "#fff",
              fontSize: 12,
            }}
          >
            {option}px
          </button>
        ))}
      </div>
      <button onClick={onUndo} disabled={!canUndo} style={ghostButtonStyle}>
        Undo
      </button>
      <button onClick={onClear} disabled={!hasStrokes} style={ghostButtonStyle}>
        全削除
      </button>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
};

const solidButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  fontSize: 12,
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 12,
};
