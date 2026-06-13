import React, { useEffect, useState } from "react";
import type { GuestToolboxAction, GuestToolboxState } from "../../common/guest-toolbox";
import { MarkerToolbar } from "../components/MarkerToolbar";

const EMPTY_STATE: GuestToolboxState = {
  enabled: false,
  color: "#ff6b6b",
  width: 4,
  displayMode: "fit",
  wheelDirection: "standard",
  canUndo: false,
  hasStrokes: false,
};

function dispatchToolboxAction(action: GuestToolboxAction): void {
  void window.pairpair.sendGuestToolboxAction(action).catch(console.error);
}

export function GuestToolboxPage(): React.ReactElement {
  const [state, setState] = useState<GuestToolboxState>(EMPTY_STATE);

  useEffect(() => {
    const handleState = (nextState: GuestToolboxState) => setState(nextState);
    window.pairpair.onGuestToolboxState(handleState);
    return () => {
      window.pairpair.removeGuestToolboxStateListener();
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 12,
        background:
          "radial-gradient(circle at top, rgba(76,201,240,0.16), transparent 32%), linear-gradient(180deg, #09111d, #050910)",
      }}
    >
      <MarkerToolbar
        enabled={state.enabled}
        color={state.color}
        width={state.width}
        displayMode={state.displayMode}
        wheelDirection={state.wheelDirection}
        fullscreen={false}
        onToggle={() => dispatchToolboxAction({ type: "toggle-marker" })}
        onEnable={() => dispatchToolboxAction({ type: "toggle-marker" })}
        onDisplayModeChange={(mode) => dispatchToolboxAction({ type: "set-display-mode", mode })}
        onWheelDirectionChange={() => dispatchToolboxAction({ type: "toggle-wheel-direction" })}
        onColorChange={(color) => dispatchToolboxAction({ type: "set-color", color })}
        onWidthChange={(width) => dispatchToolboxAction({ type: "set-width", width })}
        onUndo={() => dispatchToolboxAction({ type: "undo" })}
        onClear={() => dispatchToolboxAction({ type: "clear" })}
        canUndo={state.canUndo}
        hasStrokes={state.hasStrokes}
        onToggleFullscreen={() => dispatchToolboxAction({ type: "toggle-fullscreen" })}
      />
    </div>
  );
}
