import { Button as BaseButton } from '@base-ui/react/button';
import type { ComponentProps } from 'react';

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, 'className'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg' | 'icon';
  block?: boolean;
};

export const Button = ({ variant = 'secondary', size = 'md', block, ...props }: ButtonProps) => (
  <BaseButton
    className="ui-button"
    data-variant={variant}
    data-size={size}
    data-block={block ? '' : undefined}
    {...props}
  />
);
