import { Slider as BaseSlider } from '@base-ui/react/slider';
import { useId } from 'react';

type SliderProps = {
  label: string;
  /** Значение в процентах, 0–100. */
  value: number;
  onChange: (value: number) => void;
  /** Вызывается, когда пользователь отпустил ползунок. */
  onCommit?: () => void;
};

export const Slider = ({ label, value, onChange, onCommit }: SliderProps) => {
  const id = useId();
  return (
    <div className="ui-slider-row">
      <div className="ui-slider-head">
        <label htmlFor={id}>{label}</label>
        <output className="ui-slider-value" htmlFor={id}>
          {value}%
        </output>
      </div>
      <BaseSlider.Root
        value={value}
        min={0}
        max={100}
        step={1}
        onValueChange={(next) => onChange(next)}
        onValueCommitted={() => onCommit?.()}
      >
        <BaseSlider.Control className="ui-slider-control">
          <BaseSlider.Track className="ui-slider-track">
            <BaseSlider.Indicator className="ui-slider-indicator" />
            <BaseSlider.Thumb className="ui-slider-thumb" getAriaLabel={() => label} />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </div>
  );
};
