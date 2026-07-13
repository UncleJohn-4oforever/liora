import type { Dict } from "../i18n";

interface Props {
  dict: Dict;
  models: string[];
  value: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
}

/** Normalize ollama tag names for display / storage. */
export function shortModelName(name: string): string {
  return name.replace(/:latest$/, "");
}

export function ModelSelect({
  dict,
  models,
  value,
  disabled,
  onChange,
}: Props) {
  const options = models.length
    ? models
    : value
      ? [value]
      : [];

  return (
    <label className="model-select">
      <span className="model-select-label">{dict.model}</span>
      <select
        className="model-select-input"
        disabled={disabled || options.length === 0}
        value={
          options.find((m) => m === value || m.startsWith(`${value}:`)) ??
          options[0] ??
          ""
        }
        onChange={(e) => onChange(shortModelName(e.target.value))}
        title={dict.modelSelectHint}
      >
        {options.length === 0 && (
          <option value="">{dict.modelNone}</option>
        )}
        {options.map((m) => (
          <option key={m} value={m}>
            {shortModelName(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
