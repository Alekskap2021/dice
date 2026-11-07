import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { useId } from 'react';

type SwitchProps = { label: string; checked: boolean; onChange: (checked: boolean) => void };

export const Switch = ({ label, checked, onChange }: SwitchProps) => {
  const id = useId();
  return (
    <div className="ui-switch-row">
      <label htmlFor={id}>{label}</label>
      <BaseSwitch.Root id={id} className="ui-switch" checked={checked} onCheckedChange={onChange}>
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
    </div>
  );
};
