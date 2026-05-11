/**
 * BlockSettingsPanel.tsx — Reusable settings panel for configuring a BlockSettings object (reflection requirements, snooze limits, alert volume, time-awareness alerts); used both globally and per individual block in SessionBuilderPage.
 */
import {
  Stack,
  Typography,
  Switch,
  TextField,
  Tooltip,
  IconButton,
  Divider,
  Box,
  Slider,
  Select,
  MenuItem,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { BlockSettings, BlockType } from "../../../extension/src/shared";
import { PRE_END_THRESHOLDS } from "../../../extension/src/shared";

// ─── Audio preview ────────────────────────────────────────────────────────────

let _previewAudio: HTMLAudioElement | null = null;
let _previewTimer: ReturnType<typeof setTimeout> | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function playPreview(volume: number) {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    if (_previewTimer) {
      clearTimeout(_previewTimer);
      _previewTimer = null;
    }
    if (_previewAudio) {
      _previewAudio.pause();
      _previewAudio.currentTime = 0;
    }
    const audio = new Audio("/audio/remembering-these-places_E_minor.wav");
    const pct = Math.max(0, Math.min(1, volume / 100));
    audio.volume = pct * pct;
    audio.play().catch(() => {
      /* autoplay may be blocked */
    });
    _previewAudio = audio;
    _previewTimer = setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, 2500);
  }, 300);
}

// ─── Speech preview ───────────────────────────────────────────────────────────

let _speechDebounce: ReturnType<typeof setTimeout> | null = null;

function speakPreview(volume: number) {
  if (_speechDebounce) clearTimeout(_speechDebounce);
  _speechDebounce = setTimeout(() => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("15 minutes remaining.");
    utterance.volume = Math.min(1, Math.max(0, volume / 100));
    utterance.rate = 0.95;
    const voices = speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) => v.name.includes("Google") && v.lang.startsWith("en"),
      ) ?? voices.find((v) => v.lang.startsWith("en") && !v.localService);
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  }, 300);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip
      title={text}
      slotProps={{ tooltip: { sx: { fontSize: "0.82rem" } } }}
    >
      <HelpOutlineIcon
        sx={{ fontSize: 16, color: "text.disabled", cursor: "help", ml: 0.5 }}
      />
    </Tooltip>
  );
}

type SettingRowProps = {
  label: string;
  helpText: string;
  overridden?: boolean;
  onReset?: () => void;
  disabled?: boolean;
  disabledTooltip?: string;
  children: React.ReactNode;
};

function SettingRow({
  label,
  helpText,
  overridden,
  onReset,
  disabled,
  disabledTooltip,
  children,
}: SettingRowProps) {
  const row = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ minHeight: 36, opacity: disabled ? 0.45 : 1 }}
    >
      <Stack direction="row" alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: overridden ? 700 : 500,
            color: overridden ? "warning.dark" : "text.primary",
          }}
        >
          {label}
        </Typography>
        <HelpTooltip text={helpText} />
      </Stack>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {children}
        {overridden && onReset && (
          <Tooltip title="Reset to global default">
            <IconButton
              size="small"
              onClick={onReset}
              sx={{ color: "warning.main" }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );

  if (disabled && disabledTooltip) {
    return (
      <Tooltip title={disabledTooltip} placement="top">
        <Box>{row}</Box>
      </Tooltip>
    );
  }
  return row;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{ fontWeight: 800, color: "text.disabled", letterSpacing: "0.06em" }}
    >
      {children}
    </Typography>
  );
}

function SubSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        fontWeight: 700,
        fontSize: "0.90rem",
        color: "text.disabled",
        letterSpacing: "0.04em",
        mt: 1,
        mb: 0.25,
        display: "block",
      }}
    >
      {children}
    </Typography>
  );
}

// ─── PreEndSelect ─────────────────────────────────────────────────────────────

type PreEndSelectProps = {
  field: "preEndFrom" | "breakPreEndFrom";
  label: string;
  helpText: string;
  settings: BlockSettings;
  availableThresholds: number[];
  readOnly: boolean;
  scope: "global" | "per-block";
  isOverridden: (field: keyof BlockSettings) => boolean;
  onReset: (field: keyof BlockSettings) => void;
  onChange: (field: keyof BlockSettings, value: BlockSettings[keyof BlockSettings]) => void;
  selectSx: (field: keyof BlockSettings) => Record<string, unknown>;
};

function PreEndSelect({
  field,
  label,
  helpText,
  settings,
  availableThresholds,
  readOnly,
  scope,
  isOverridden,
  onReset,
  onChange,
  selectSx,
}: PreEndSelectProps) {
  const value = (settings[field] as number) ?? 0;
  const noOptions = availableThresholds.length === 0;

  return (
    <SettingRow
      label={label}
      helpText={helpText}
      overridden={isOverridden(field)}
      onReset={() => onReset(field)}
      disabled={noOptions && scope === "per-block"}
      disabledTooltip="No thresholds available for this block duration"
    >
      <Select
        size="small"
        value={noOptions ? 0 : value}
        disabled={readOnly || (noOptions && scope === "per-block")}
        onChange={(e) => onChange(field, Number(e.target.value))}
        sx={selectSx(field)}
      >
        <MenuItem value={0}>Off</MenuItem>
        {availableThresholds.map((t) => (
          <MenuItem key={t} value={t}>
            {t} min before
          </MenuItem>
        ))}
      </Select>
    </SettingRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BlockSettingsPanelProps = {
  settings: BlockSettings;
  scope: "global" | "per-block";
  readOnly?: boolean;
  // global only:
  onChange?: (patch: Partial<BlockSettings>) => void;
  // per-block only:
  localOverrides?: Partial<BlockSettings>;
  onOverrideChange?: (
    field: keyof BlockSettings,
    value: BlockSettings[keyof BlockSettings] | undefined,
  ) => void;
  blockType?: BlockType;
  blockMinutes?: number;
};

export default function BlockSettingsPanel({
  settings,
  scope,
  readOnly = false,
  onChange,
  localOverrides,
  onOverrideChange,
  blockType,
  blockMinutes,
}: BlockSettingsPanelProps) {
  const isOverridden = (field: keyof BlockSettings) =>
    scope === "per-block" &&
    localOverrides !== undefined &&
    field in localOverrides;

  const handleChange = (
    field: keyof BlockSettings,
    value: BlockSettings[keyof BlockSettings],
  ) => {
    if (readOnly) return;
    if (scope === "global") {
      onChange?.({ [field]: value });
    } else {
      onOverrideChange?.(field, value);
    }
  };

  const handleReset = (field: keyof BlockSettings) => {
    onOverrideChange?.(field, undefined);
  };

  const showWorkSection = blockType !== "break";
  const showBreakSection = blockType !== "work" && blockType !== "dynamic";
  const showWork = scope === "global" ? true : showWorkSection;
  const showBreak = scope === "global" ? true : showBreakSection;

  const quarterDisabled =
    scope === "per-block" && blockMinutes !== undefined && blockMinutes < 10;

  // For per-block context, only show thresholds that the block is long enough for
  const availableThresholds =
    scope === "per-block" && blockMinutes !== undefined
      ? PRE_END_THRESHOLDS.filter((t) => blockMinutes > t)
      : [...PRE_END_THRESHOLDS];

  const switchSx = (field: keyof BlockSettings) =>
    isOverridden(field)
      ? {
          "& .MuiSwitch-thumb": { bgcolor: "warning.main" },
          "& .MuiSwitch-track": { bgcolor: "warning.light" },
        }
      : undefined;

  const numberFieldSx = (field: keyof BlockSettings) => ({
    width: 70,
    "& .MuiOutlinedInput-root": isOverridden(field)
      ? { "& fieldset": { borderColor: "warning.main" } }
      : {},
  });

  const selectSx = (field: keyof BlockSettings) => ({
    width: 140,
    ...(isOverridden(field)
      ? {
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "warning.main" },
        }
      : {}),
  });

  return (
    <Stack spacing={1.5} sx={{ p: scope === "global" ? 0 : 1 }}>
      {/* ── Reflection ── */}
      <Box>
        <SectionHeader>REFLECTION</SectionHeader>
        {showWork && (
          <SettingRow
            label="Require reflection (Work / Dynamic)"
            helpText="Forces user to quickly document what they actually did during the work/dynamic block before proceeding to the next block"
            overridden={isOverridden("inputRequired")}
            onReset={() => handleReset("inputRequired")}
          >
            <Switch
              size="small"
              checked={settings.inputRequired ?? false}
              disabled={readOnly}
              onChange={(e) => handleChange("inputRequired", e.target.checked)}
              sx={switchSx("inputRequired")}
            />
          </SettingRow>
        )}
        {showBreak && (
          <SettingRow
            label="Require reflection (Break)"
            helpText="Forces user to quickly document what they actually did during the beark block before proceeding to the next block"
            overridden={isOverridden("breakInputRequired")}
            onReset={() => handleReset("breakInputRequired")}
          >
            <Switch
              size="small"
              checked={settings.breakInputRequired ?? false}
              disabled={readOnly}
              onChange={(e) =>
                handleChange("breakInputRequired", e.target.checked)
              }
              sx={switchSx("breakInputRequired")}
            />
          </SettingRow>
        )}
      </Box>

      {/* ── Work / Dynamic Settings ── */}
      {showWork && (
        <>
          <Divider />
          <Box>
            <SectionHeader>WORK / DYNAMIC SETTINGS</SectionHeader>

            {/* Snoozes */}
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <SettingRow
                label="Max snoozes"
                helpText="How many times the user can snooze after a work or dynamic block ends (0 = disabled)"
                overridden={isOverridden("endMaxCount")}
                onReset={() => handleReset("endMaxCount")}
              >
                <TextField
                  type="number"
                  value={settings.endMaxCount ?? 0}
                  disabled={readOnly}
                  onChange={(e) =>
                    handleChange("endMaxCount", Number(e.target.value))
                  }
                  inputProps={{ min: 0, max: 10, step: 1 }}
                  size="small"
                  sx={numberFieldSx("endMaxCount")}
                />
              </SettingRow>
              <SettingRow
                label="Max snooze minutes"
                helpText="Maximum minutes per snooze for work/dynamic blocks"
                overridden={isOverridden("endSnoozeMaxMinutes")}
                onReset={() => handleReset("endSnoozeMaxMinutes")}
              >
                <TextField
                  type="number"
                  value={settings.endSnoozeMaxMinutes ?? 15}
                  disabled={readOnly || (settings.endMaxCount ?? 0) === 0}
                  onChange={(e) =>
                    handleChange("endSnoozeMaxMinutes", Number(e.target.value))
                  }
                  inputProps={{ min: 1, max: 120, step: 1 }}
                  size="small"
                  sx={numberFieldSx("endSnoozeMaxMinutes")}
                />
              </SettingRow>
            </Stack>

            {/* Time Awareness */}
            <SubSectionHeader>
              Time Awareness for Work / Dynamic Blocks
            </SubSectionHeader>
            <Stack spacing={0.5}>
              <Box>
                <SettingRow
                  label="Quarter-milestone alerts"
                  helpText="Spoken alerts at 25%, 50%, and 75% of the block's elapsed duration, announcing the milestone and current time"
                  overridden={isOverridden("quarterAlerts")}
                  onReset={() => handleReset("quarterAlerts")}
                  disabled={quarterDisabled}
                  disabledTooltip="Requires blocks of at least 10 minutes"
                >
                  <Switch
                    size="small"
                    checked={settings.quarterAlerts ?? false}
                    disabled={readOnly || quarterDisabled}
                    onChange={(e) =>
                      handleChange("quarterAlerts", e.target.checked)
                    }
                    sx={switchSx("quarterAlerts")}
                  />
                </SettingRow>
                {scope === "global" && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      pl: 0.5,
                      display: "block",
                      lineHeight: 1.4,
                    }}
                  >
                    Only applies to blocks of 10 minutes or longer
                  </Typography>
                )}
              </Box>

              <PreEndSelect
                field="preEndFrom"
                label="Ring every 5 min starting from"
                helpText="Spoken alert every 5 minutes starting from this many minutes before the block ends (Off = disabled)"
                settings={settings}
                availableThresholds={availableThresholds}
                readOnly={readOnly}
                scope={scope}
                isOverridden={isOverridden}
                onReset={handleReset}
                onChange={handleChange}
                selectSx={selectSx}
              />
            </Stack>
          </Box>
        </>
      )}

      {/* ── Break Settings ── */}
      {showBreak && (
        <>
          <Divider />
          <Box>
            <SectionHeader>BREAK SETTINGS</SectionHeader>

            {/* Snoozes */}
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <SettingRow
                label="Max break snoozes"
                helpText="How many times the user can extend a break before being forced to continue (0 = disabled)"
                overridden={isOverridden("returnMaxCount")}
                onReset={() => handleReset("returnMaxCount")}
              >
                <TextField
                  type="number"
                  value={settings.returnMaxCount ?? 0}
                  disabled={readOnly}
                  onChange={(e) =>
                    handleChange("returnMaxCount", Number(e.target.value))
                  }
                  inputProps={{ min: 0, max: 10, step: 1 }}
                  size="small"
                  sx={numberFieldSx("returnMaxCount")}
                />
              </SettingRow>
              <SettingRow
                label="Max extension minutes"
                helpText="Maximum minutes per extension for break blocks"
                overridden={isOverridden("returnSnoozeMaxMinutes")}
                onReset={() => handleReset("returnSnoozeMaxMinutes")}
              >
                <TextField
                  type="number"
                  value={settings.returnSnoozeMaxMinutes ?? 10}
                  disabled={readOnly || (settings.returnMaxCount ?? 0) === 0}
                  onChange={(e) =>
                    handleChange(
                      "returnSnoozeMaxMinutes",
                      Number(e.target.value),
                    )
                  }
                  inputProps={{ min: 1, max: 120, step: 1 }}
                  size="small"
                  sx={numberFieldSx("returnSnoozeMaxMinutes")}
                />
              </SettingRow>
            </Stack>

            {/* Time Awareness */}
            <SubSectionHeader>Time Awareness Of Break Blocks</SubSectionHeader>
            <Stack spacing={0.5}>
              <Box>
                <SettingRow
                  label="Quarter-milestone alerts"
                  helpText="Spoken alerts at 25%, 50%, and 75% of the break's elapsed duration, announcing the milestone and current time"
                  overridden={isOverridden("breakQuarterAlerts")}
                  onReset={() => handleReset("breakQuarterAlerts")}
                  disabled={quarterDisabled}
                  disabledTooltip="Requires blocks of at least 10 minutes"
                >
                  <Switch
                    size="small"
                    checked={settings.breakQuarterAlerts ?? false}
                    disabled={readOnly || quarterDisabled}
                    onChange={(e) =>
                      handleChange("breakQuarterAlerts", e.target.checked)
                    }
                    sx={switchSx("breakQuarterAlerts")}
                  />
                </SettingRow>
                {scope === "global" && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      pl: 0.5,
                      display: "block",
                      lineHeight: 1.4,
                    }}
                  >
                    Only applies to blocks of 10 minutes or longer
                  </Typography>
                )}
              </Box>

              <PreEndSelect
                field="breakPreEndFrom"
                label="Ring every 5 min starting from"
                helpText="Spoken alert every 5 minutes starting from this many minutes before the break ends (Off = disabled)"
                settings={settings}
                availableThresholds={availableThresholds}
                readOnly={readOnly}
                scope={scope}
                isOverridden={isOverridden}
                onReset={handleReset}
                onChange={handleChange}
                selectSx={selectSx}
              />
            </Stack>
          </Box>
        </>
      )}

      {/* ── Sound ── */}
      <Divider />
      <Box>
        <SectionHeader>SOUND </SectionHeader>
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          <SettingRow
            label="Block Transitions sound volume"
            helpText="Volume of the alert sound that plays at block transitions (0 = silent). Drag to hear a preview."
            overridden={isOverridden("alertVolume")}
            onReset={() => handleReset("alertVolume")}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ width: 130 }}
            >
              <Slider
                size="small"
                value={settings.alertVolume ?? 80}
                min={0}
                max={100}
                step={5}
                disabled={readOnly}
                onChange={(_, v) => {
                  handleChange("alertVolume", v as number);
                  playPreview(v as number);
                }}
                sx={
                  isOverridden("alertVolume")
                    ? { color: "warning.main", flex: 1 }
                    : { flex: 1 }
                }
              />
              <Typography
                variant="caption"
                sx={{
                  minWidth: 32,
                  textAlign: "right",
                  color: "text.secondary",
                }}
              >
                {settings.alertVolume ?? 80}%
              </Typography>
            </Stack>
          </SettingRow>
        </Stack>
      </Box>

      {/* ── Time Awareness Volume (global only) ── */}
      {scope === "global" && (
        <>
          <Divider />
          <Box>
            <SectionHeader>TIME AWARENESS VOLUME</SectionHeader>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <SettingRow
                label="Speech volume"
                helpText='Volume of the spoken time awareness alerts. Drag to hear a preview ("15 minutes remaining.").'
                overridden={false}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ width: 130 }}
                >
                  <Slider
                    size="small"
                    value={settings.timeAwarenessVolume ?? 70}
                    min={0}
                    max={100}
                    step={5}
                    disabled={readOnly}
                    onChange={(_, v) => {
                      handleChange("timeAwarenessVolume", v as number);
                      speakPreview(v as number);
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      minWidth: 32,
                      textAlign: "right",
                      color: "text.secondary",
                    }}
                  >
                    {settings.timeAwarenessVolume ?? 70}%
                  </Typography>
                </Stack>
              </SettingRow>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
