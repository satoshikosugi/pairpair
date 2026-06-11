import React from "react";
import { QUALITY_PRESETS, type QualityPresetName, type QualityPreset } from "@pairpair/shared";

interface QualityPresetSelectorProps {
  selected: QualityPresetName;
  customPreset?: Partial<QualityPreset>;
  onChange: (preset: QualityPresetName, custom?: Partial<QualityPreset>) => void;
}

export function QualityPresetSelector({ selected, customPreset, onChange }: QualityPresetSelectorProps): React.ReactElement {
  const presetNames: QualityPresetName[] = ["Low", "Balanced", "Sharp", "Ultra", "Custom"];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {presetNames.map((name) => (
          <button
            key={name}
            onClick={() => onChange(name)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `2px solid ${selected === name ? "#4a9eff" : "#444"}`,
              background: selected === name ? "#4a9eff" : "transparent",
              color: "#fff",
              fontSize: 13,
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {selected !== "Custom" && QUALITY_PRESETS[selected as Exclude<QualityPresetName, "Custom">] && (
        <div style={{ fontSize: 12, color: "#aaa" }}>
          {QUALITY_PRESETS[selected as Exclude<QualityPresetName, "Custom">].resolution} /{" "}
          {QUALITY_PRESETS[selected as Exclude<QualityPresetName, "Custom">].fps}fps /{" "}
          {QUALITY_PRESETS[selected as Exclude<QualityPresetName, "Custom">].bitrateMbps}Mbps
        </div>
      )}
      {selected === "Custom" && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <label>
            <span style={{ fontSize: 12, color: "#aaa" }}>Width</span>
            <input
              type="number"
              defaultValue={customPreset?.width ?? 1920}
              onChange={(e) => onChange("Custom", { ...customPreset, width: Number(e.target.value) })}
              style={{
                width: 80,
                marginLeft: 8,
                padding: "2px 6px",
                background: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 4,
              }}
            />
          </label>
          <label>
            <span style={{ fontSize: 12, color: "#aaa" }}>Height</span>
            <input
              type="number"
              defaultValue={customPreset?.height ?? 1080}
              onChange={(e) => onChange("Custom", { ...customPreset, height: Number(e.target.value) })}
              style={{
                width: 80,
                marginLeft: 8,
                padding: "2px 6px",
                background: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 4,
              }}
            />
          </label>
          <label>
            <span style={{ fontSize: 12, color: "#aaa" }}>FPS</span>
            <input
              type="number"
              defaultValue={customPreset?.fps ?? 30}
              onChange={(e) => onChange("Custom", { ...customPreset, fps: Number(e.target.value) })}
              style={{
                width: 60,
                marginLeft: 8,
                padding: "2px 6px",
                background: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 4,
              }}
            />
          </label>
          <label>
            <span style={{ fontSize: 12, color: "#aaa" }}>Mbps</span>
            <input
              type="number"
              defaultValue={customPreset?.bitrateMbps ?? 8}
              onChange={(e) => onChange("Custom", { ...customPreset, bitrateMbps: Number(e.target.value) })}
              style={{
                width: 60,
                marginLeft: 8,
                padding: "2px 6px",
                background: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 4,
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
