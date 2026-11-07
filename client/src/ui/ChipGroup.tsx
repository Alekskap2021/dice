import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

type ChipGroupProps = {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
};

/** Одиночный выбор из набора кнопок-«таблеток». */
export const ChipGroup = ({ value, options, onChange, label }: ChipGroupProps) => (
  <ToggleGroup
    className="ui-chips"
    aria-label={label}
    value={[value]}
    onValueChange={(next) => {
      const picked = next[0];
      if (picked !== undefined) onChange(picked);
    }}
  >
    {options.map((option) => (
      <Toggle key={option.value} value={option.value} className="ui-chip">
        {option.label}
      </Toggle>
    ))}
  </ToggleGroup>
);
