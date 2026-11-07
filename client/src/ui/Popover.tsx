import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ReactElement, ReactNode } from 'react';

type PopoverProps = { trigger: ReactElement; title: string; children: ReactNode };

export const Popover = ({ trigger, title, children }: PopoverProps) => (
  <BasePopover.Root>
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
