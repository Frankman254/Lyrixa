import type { ReactNode } from 'react';

export function Group({
  title,
  open,
  children
}: {
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="insp-group" open={open}>
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}

export function EmptyText({ text }: { text: string }) {
  return <div className="insp-empty">{text}</div>;
}
