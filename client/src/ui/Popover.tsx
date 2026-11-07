import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ReactElement, ReactNode } from 'react';

type PopoverProps = {
  trigger: ReactElement;
  title: string;
  children: ReactNode;
  /** Управляемое состояние: нужно, чтобы закрывать окно из содержимого. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Popover = ({ trigger, title, children, open, onOpenChange }: PopoverProps) => (
  <BasePopover.Root open={open} onOpenChange={onOpenChange}>
    <BasePopover.Trigger render={trigger} />
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={10} align="end" style={{ zIndex: 40 }}>
        <BasePopover.Popup className="ui-popover">
          <BasePopover.Title className="ui-popover-title">{title}</BasePopover.Title>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  </BasePopover.Root>
);
