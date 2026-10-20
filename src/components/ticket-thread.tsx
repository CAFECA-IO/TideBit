import clsx from "clsx";
import { fmtDateTime } from "@/lib/format";

export type ThreadView = { id: string; authorType: "MEMBER" | "ADMIN"; authorName: string; body: string; createdAt: Date };

/** 對話串：mine 決定哪一方靠右（會員端看自己、後台看客服） */
export function TicketThread({ messages, mine, locale }: { messages: ThreadView[]; mine: "MEMBER" | "ADMIN"; locale: string }) {
  return (
    <ol className="space-y-4">
      {messages.map((m) => {
        const own = m.authorType === mine;
        return (
          <li key={m.id} className={clsx("flex", own ? "justify-end" : "justify-start")}>
            <div className="max-w-[85%] sm:max-w-[75%]">
              <div className={clsx("mb-1 text-xs text-muted", own && "text-right")}>
                {m.authorName} · {fmtDateTime(m.createdAt, locale)}
              </div>
              <div
                className={clsx(
                  "whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  own ? "rounded-tr-sm bg-navy text-white" : "rounded-tl-sm border border-border bg-surface",
                )}
              >
                {m.body}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
