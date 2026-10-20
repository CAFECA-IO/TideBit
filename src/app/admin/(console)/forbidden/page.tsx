import { ButtonLink } from "@/components/ui";

export const metadata = { title: "權限不足" };

export default function Forbidden() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold">權限不足</p>
      <p className="text-sm text-muted">您的管理員角色無法使用此功能，如需權限請聯繫超級管理員。</p>
      <ButtonLink href="/admin" variant="secondary">
        回到儀表板
      </ButtonLink>
    </div>
  );
}
