"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "./ui";

export type FormState = { error?: string; ok?: string } | undefined;
type Action = (state: FormState, form: FormData) => Promise<FormState>;

/** 包裝 Server Action 的表單：顯示錯誤 / 成功訊息 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && <Alert tone="danger" className="mb-4">{state.error}</Alert>}
      {state?.ok && <Alert tone="success" className="mb-4">{state.ok}</Alert>}
      {children}
    </form>
  );
}

export function SubmitButton({ children, className, variant, size, pendingText }: { children: ReactNode; className?: string; variant?: "primary" | "secondary" | "danger" | "accent" | "ghost"; size?: "sm" | "md" | "lg"; pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size} aria-busy={pending}>
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
