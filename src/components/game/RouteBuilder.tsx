"use client";

import type { Mode, Segment } from "@/types/game";

type Props = {
  segments: Segment[];
  selectedMode: Mode;
  modeDisabledReasons: Record<Mode, string | undefined>;
  canSubmit: boolean;
  playerName: string;
  destinationDistanceMeters: number;
  onSelectMode: (mode: Mode) => void;
  onUndo: () => void;
  onSubmit: () => void;
  onPlayerNameChange: (name: string) => void;
};

const MODE_LABELS: Record<Mode, string> = {
  WALK: "WALK",
  BIKE_SHARE: "BIKE_SHARE",
  SUBWAY: "SUBWAY",
  BUS: "BUS",
  FERRY: "FERRY",
};

const MODES: Mode[] = ["WALK", "BIKE_SHARE", "SUBWAY", "BUS", "FERRY"];

export function RouteBuilder({
  segments,
  selectedMode,
  modeDisabledReasons,
  canSubmit,
  playerName,
  destinationDistanceMeters,
  onSelectMode,
  onUndo,
  onSubmit,
  onPlayerNameChange,
}: Props) {
  return (
    <div className="builder-panel">
      <h2>Route Builder</h2>
      <p className="builder-note">Plan without times. Your score is revealed only after submit.</p>

      <div className="player-row">
        <label htmlFor="playerName">Player</label>
        <input
          id="playerName"
          value={playerName}
          onChange={(event) => onPlayerNameChange(event.target.value)}
          maxLength={30}
          placeholder="Your name"
        />
      </div>

      <div className="mode-grid">
        {MODES.map((mode) => {
          const reason = modeDisabledReasons[mode];
          const disabled = Boolean(reason);
          return (
            <button
              key={mode}
              type="button"
              className={selectedMode === mode ? "mode-btn selected" : "mode-btn"}
              disabled={disabled}
              title={reason}
              onClick={() => onSelectMode(mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>

      <div className="action-row">
        <button type="button" onClick={onUndo} disabled={segments.length === 0}>
          UNDO
        </button>
        <button type="button" onClick={onSubmit} disabled={!canSubmit}>
          SUBMIT
        </button>
      </div>

      <p className="finish-note">
        {canSubmit
          ? "Route is valid to submit."
          : `Finish within 50m of destination. Remaining: ${Math.max(destinationDistanceMeters, 0).toFixed(1)}m`}
      </p>

      <ol className="steps-list">
        {segments.map((segment, index) => (
          <li key={`${segment.mode}-${index}`}>
            <span>{segment.mode}</span>
            <small>
              ({segment.from.lat.toFixed(4)}, {segment.from.lng.toFixed(4)}) → ({segment.to.lat.toFixed(4)}, {segment.to.lng.toFixed(4)})
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}
