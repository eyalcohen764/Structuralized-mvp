import { type SyntheticEvent } from "react";
import {
  Autocomplete,
  TextField,
  IconButton,
  Typography,
  Stack,
  createFilterOptions,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import type { SavedTopic } from "../topicStorage";

// ─── Option type ──────────────────────────────────────────────────────────────

type SaveNewOption = { _type: "save"; name: string };
type TopicOption = SavedTopic | SaveNewOption;

function isSaveOption(opt: TopicOption): opt is SaveNewOption {
  return "_type" in opt && opt._type === "save";
}

const baseFilter = createFilterOptions<TopicOption>();

// ─── Props ────────────────────────────────────────────────────────────────────

type TopicAutocompleteProps = {
  value: string;
  onChange: (topic: string) => void;
  savedTopics: SavedTopic[];
  loading: boolean;
  onSave: (name: string) => void;
  onDelete: (topicId: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopicAutocomplete({
  value,
  onChange,
  savedTopics,
  loading,
  onSave,
  onDelete,
}: TopicAutocompleteProps) {
  function handleInputChange(_e: SyntheticEvent, newValue: string) {
    onChange(newValue);
  }

  function handleChange(
    _e: SyntheticEvent,
    newValue: string | TopicOption | null,
  ) {
    if (newValue === null) {
      onChange("");
      return;
    }
    if (typeof newValue === "string") {
      onChange(newValue);
      return;
    }
    if (isSaveOption(newValue)) {
      onSave(newValue.name);
      onChange(newValue.name);
      return;
    }
    onChange(newValue.name);
  }

  return (
    <Autocomplete<TopicOption, false, false, true>
      freeSolo
      options={savedTopics as TopicOption[]}
      inputValue={value}
      onInputChange={handleInputChange}
      onChange={handleChange}
      loading={loading}
      getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
      filterOptions={(options, params) => {
        const filtered = baseFilter(options, params);
        const trimmed = params.inputValue.trim();
        if (
          trimmed &&
          !savedTopics.some(
            (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
          )
        ) {
          filtered.push({ _type: "save", name: trimmed });
        }
        return filtered;
      }}
      renderOption={({ key: liKey, ...props }, option) => {
        if (isSaveOption(option)) {
          return (
            <li key={liKey ?? "__save__"} {...props}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <AddIcon fontSize="small" color="primary" />
                <Typography variant="body2" color="primary">
                  Save &ldquo;{option.name}&rdquo;
                </Typography>
              </Stack>
            </li>
          );
        }

        return (
          <li key={liKey ?? option.id} {...props}>
            <Stack direction="row" alignItems="center" sx={{ width: "100%" }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {option.name}
              </Typography>
              <IconButton
                size="small"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete(option.id);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Work topic"
          placeholder="e.g., CS problem set"
          helperText="Required for Work blocks"
          size="small"
          fullWidth
        />
      )}
    />
  );
}
