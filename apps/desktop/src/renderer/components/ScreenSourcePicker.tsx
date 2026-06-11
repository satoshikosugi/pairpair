import React, { useEffect, useState } from "react";

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
  appIcon: string | null;
}

interface ScreenSourcePickerProps {
  onSelect: (source: ScreenSource) => void;
}

export function ScreenSourcePicker({ onSelect }: ScreenSourcePickerProps): React.ReactElement {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.pairpair
      .getScreenSources()
      .then((srcs) => {
        setSources(srcs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: 16 }}>画面ソースを取得中...</div>;
  if (error) return <div style={{ padding: 16, color: "#f66" }}>エラー: {error}</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>共有する画面を選択</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
          maxHeight: 400,
          overflowY: "auto",
        }}
      >
        {sources.map((source) => (
          <div
            key={source.id}
            onClick={() => {
              setSelected(source.id);
              onSelect(source);
            }}
            style={{
              border: `2px solid ${selected === source.id ? "#4a9eff" : "#333"}`,
              borderRadius: 8,
              padding: 8,
              cursor: "pointer",
              background: selected === source.id ? "rgba(74, 158, 255, 0.1)" : "rgba(255,255,255,0.05)",
            }}
          >
            <img
              src={source.thumbnail}
              alt={source.name}
              style={{ width: "100%", borderRadius: 4, display: "block" }}
            />
            <div
              style={{
                fontSize: 12,
                marginTop: 6,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {source.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
