import { Input as BaseInput } from '@base-ui/react/input';
import type { ComponentProps } from 'react';

type InputProps = Omit<ComponentProps<typeof BaseInput>, 'className'> & { className?: string };

export const Input = ({ className, ...props }: InputProps) => (
  <BaseInput className={className ? `ui-input ${className}` : 'ui-input'} {...props} />
);
