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
  initialSourceName?: string | null;
  initialDisplayId?: string | null;
}

function isScreenSource(source: ScreenSource): boolean {
  return source.id.startsWith("screen:");
}

function compareSources(a: ScreenSource, b: ScreenSource): number {
  const aIsScreen = isScreenSource(a);
  const bIsScreen = isScreenSource(b);
  if (aIsScreen !== bIsScreen) {
    return aIsScreen ? -1 : 1;
  }

  const displayCompare = (a.display_id || "").localeCompare(b.display_id || "", "ja");
  if (displayCompare !== 0) return displayCompare;

  const nameCompare = a.name.localeCompare(b.name, "ja");
  if (nameCompare !== 0) return nameCompare;

  return a.id.localeCompare(b.id, "ja");
}

export function ScreenSourcePicker({ onSelect, initialSourceName, initialDisplayId }: ScreenSourcePickerProps): React.ReactElement {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.pairpair
      .getScreenSources()
      .then((srcs) => {
        const sortedSources = [...srcs].sort(compareSources);
        setSources(sortedSources);
        const previous = sortedSources.find((source) =>
          source.name === initialSourceName &&
          (!initialDisplayId || source.display_id === initialDisplayId),
        );
        if (previous) {
          setSelected(previous.id);
          onSelect(previous);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [initialDisplayId, initialSourceName, onSelect]);

  const screenSources = sources.filter(isScreenSource);
  const windowSources = sources.filter((source) => !isScreenSource(source));

  const renderSourceCard = (source: ScreenSource) => (
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
  );

  if (loading) return <div style={{ padding: 16 }}>画面ソースを取得中...</div>;
  if (error) return <div style={{ padding: 16, color: "#f66" }}>エラー: {error}</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>共有する画面を選択</h3>
      <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <section>
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#cfd8ea" }}>画面全体</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {screenSources.map(renderSourceCard)}
          </div>
        </section>
        <section>
          <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#cfd8ea" }}>アプリ</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {windowSources.map(renderSourceCard)}
          </div>
        </section>
      </div>
    </div>
  );
}
