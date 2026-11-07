import { Progress } from '@base-ui/react/progress';

export const ProgressBar = ({ value, max, label }: { value: number; max: number; label: string }) => (
  <Progress.Root value={Math.min(value, max)} min={0} max={max} aria-label={label}>
    <Progress.Track className="ui-progress-track">
      <Progress.Indicator className="ui-progress-indicator" />
    </Progress.Track>
  </Progress.Root>
);
