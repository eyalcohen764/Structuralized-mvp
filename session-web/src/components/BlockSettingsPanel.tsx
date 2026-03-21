import {
  Stack,
  Typography,
  Switch,
  TextField,
  Tooltip,
  IconButton,
  Divider,
  Box,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { BlockSettings, BlockType } from "../../../extension/src/shared";

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
  children: React.ReactNode;
};

function SettingRow({
  label,
  helpText,
  overridden,
  onReset,
  children,
}: SettingRowProps) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ minHeight: 36 }}
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
};

export default function BlockSettingsPanel({
  settings,
  scope,
  readOnly = false,
  onChange,
  localOverrides,
  onOverrideChange,
  blockType,
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
  // In global scope, always show all sections
  const showWork = scope === "global" ? true : showWorkSection;
  const showBreak = scope === "global" ? true : showBreakSection;

  return (
    <Stack spacing={1.5} sx={{ p: scope === "global" ? 0 : 1 }}>
      {/* Reflection */}
      <Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            color: "text.disabled",
            letterSpacing: "0.06em",
          }}
        >
          REFLECTION
        </Typography>
        {showWork && (
          <SettingRow
            label="Require reflection (Work / Dynamic)"
            helpText="Forces user to type something before proceeding after a work or dynamic block"
            overridden={isOverridden("inputRequired")}
            onReset={() => handleReset("inputRequired")}
          >
            <Switch
              size="small"
              checked={settings.inputRequired ?? false}
              disabled={readOnly}
              onChange={(e) => handleChange("inputRequired", e.target.checked)}
              sx={
                isOverridden("inputRequired")
                  ? {
                      "& .MuiSwitch-thumb": { bgcolor: "warning.main" },
                      "& .MuiSwitch-track": { bgcolor: "warning.light" },
                    }
                  : {}
              }
            />
          </SettingRow>
        )}
        {showBreak && (
          <SettingRow
            label="Require reflection (Break)"
            helpText="Forces user to type something before proceeding after a break block"
            overridden={isOverridden("breakInputRequired")}
            onReset={() => handleReset("breakInputRequired")}
          >
            <Switch
              size="small"
              checked={settings.breakInputRequired ?? false}
              disabled={readOnly}
              onChange={(e) => handleChange("breakInputRequired", e.target.checked)}
              sx={
                isOverridden("breakInputRequired")
                  ? {
                      "& .MuiSwitch-thumb": { bgcolor: "warning.main" },
                      "& .MuiSwitch-track": { bgcolor: "warning.light" },
                    }
                  : {}
              }
            />
          </SettingRow>
        )}
      </Box>

      {/* Work / Dynamic Block Snoozes */}
      {showWork && (
        <>
          <Divider />
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                color: "text.disabled",
                letterSpacing: "0.06em",
              }}
            >
              WORK / DYNAMIC
            </Typography>
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
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden("endMaxCount")
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
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
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden(
                      "endSnoozeMaxMinutes",
                    )
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
                />
              </SettingRow>
              <SettingRow
                label="Announce every (min)"
                helpText="Every N minutes during a work or dynamic block, the extension reads aloud the current time and how long until the session ends. Set to 0 to disable."
                overridden={isOverridden("workAnnounceEveryMinutes")}
                onReset={() => handleReset("workAnnounceEveryMinutes")}
              >
                <TextField
                  type="number"
                  value={settings.workAnnounceEveryMinutes ?? 0}
                  disabled={readOnly}
                  onChange={(e) =>
                    handleChange(
                      "workAnnounceEveryMinutes",
                      Number(e.target.value),
                    )
                  }
                  inputProps={{ min: 0, max: 120, step: 1 }}
                  size="small"
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden(
                      "workAnnounceEveryMinutes",
                    )
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
                />
              </SettingRow>
            </Stack>
          </Box>
        </>
      )}

      {/* Break Extensions */}
      {showBreak && (
        <>
          <Divider />
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                color: "text.disabled",
                letterSpacing: "0.06em",
              }}
            >
              BREAK
            </Typography>
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
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden("returnMaxCount")
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
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
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden(
                      "returnSnoozeMaxMinutes",
                    )
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
                />
              </SettingRow>
              <SettingRow
                label="Announce every (min)"
                helpText="Every N minutes during a break block, the extension reads aloud the current time and how long until the session ends. Set to 0 to disable."
                overridden={isOverridden("breakAnnounceEveryMinutes")}
                onReset={() => handleReset("breakAnnounceEveryMinutes")}
              >
                <TextField
                  type="number"
                  value={settings.breakAnnounceEveryMinutes ?? 0}
                  disabled={readOnly}
                  onChange={(e) =>
                    handleChange(
                      "breakAnnounceEveryMinutes",
                      Number(e.target.value),
                    )
                  }
                  inputProps={{ min: 0, max: 120, step: 1 }}
                  size="small"
                  sx={{
                    width: 70,
                    "& .MuiOutlinedInput-root": isOverridden(
                      "breakAnnounceEveryMinutes",
                    )
                      ? { "& fieldset": { borderColor: "warning.main" } }
                      : {},
                  }}
                />
              </SettingRow>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
