import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useRef, type ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Запретить закрытие по клику вне окна и Esc. */
  modalOnly?: boolean;
};

export const Dialog = ({ open, onOpenChange, title, description, children, modalOnly }: DialogProps) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
  <BaseDialog.Root
    open={open}
    onOpenChange={(next) => {
      if (!modalOnly || next) onOpenChange(next);
    }}
  >
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="ui-backdrop" />
      <BaseDialog.Popup className="ui-dialog" initialFocus={titleRef}>
        <BaseDialog.Title className="ui-dialog-title" ref={titleRef} tabIndex={-1}>{title}</BaseDialog.Title>
        {description ? (
          <BaseDialog.Description className="ui-dialog-description">{description}</BaseDialog.Description>
        ) : null}
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  </BaseDialog.Root>
);
};
