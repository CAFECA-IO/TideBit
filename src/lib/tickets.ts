import "server-only";
import { db } from "./db";

/**
 * 客服單使用既有 ticket_topics / ticket_comments：
 * - topic.content 第一行為主旨，其後為第一則訊息
 * - topic.state：open（等待客服）／ replied（客服已回覆）／ closed
 * - comment.author_id 與 topic.author_id 不同者視為客服
 */
export type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";

export function ticketStatus(state: string | null | undefined): TicketStatus {
  const s = (state ?? "").toLowerCase();
  if (s === "closed" || s === "close" || s === "resolved") return "CLOSED";
  if (s === "replied" || s === "answered" || s === "reply") return "ANSWERED";
  return "OPEN";
}

export const STATE_VALUE: Record<TicketStatus, string> = { OPEN: "open", ANSWERED: "replied", CLOSED: "closed" };

export function splitContent(content: string | null | undefined) {
  const c = (content ?? "").replace(/\r\n/g, "\n");
  const i = c.indexOf("\n");
  if (i < 0) return { subject: c.slice(0, 120) || "—", body: "" };
  return { subject: c.slice(0, i).slice(0, 120) || "—", body: c.slice(i + 1).replace(/^\n/, "") };
}

export function joinContent(subject: string, body: string) {
  return `${subject.replace(/\n/g, " ").trim()}\n\n${body.trim()}`;
}

export type ThreadMessage = { id: string; authorType: "MEMBER" | "ADMIN"; authorId: bigint | null; body: string; createdAt: Date };

export async function loadThread(topicId: bigint) {
  const topic = await db.ticketTopic.findUnique({ where: { id: topicId }, include: { comments: { orderBy: { id: "asc" } }, author: true } });
  if (!topic) return null;
  const { subject, body } = splitContent(topic.content);
  const messages: ThreadMessage[] = [];
  if (body) messages.push({ id: `t${topic.id}`, authorType: "MEMBER", authorId: topic.authorId, body, createdAt: topic.createdAt ?? new Date(0) });
  for (const c of topic.comments) {
    messages.push({
      id: `c${c.id}`,
      authorType: c.authorId === topic.authorId ? "MEMBER" : "ADMIN",
      authorId: c.authorId,
      body: c.content ?? "",
      createdAt: c.createdAt ?? new Date(0),
    });
  }
  return { topic, subject, status: ticketStatus(topic.state), messages };
}

export async function createTopic(authorId: bigint, subject: string, body: string, state: TicketStatus = "OPEN") {
  const now = new Date();
  return db.ticketTopic.create({
    data: { authorId, content: joinContent(subject, body), state: STATE_VALUE[state], lastReplyAt: now, createdAt: now, updatedAt: now },
  });
}

export async function addComment(topicId: bigint, authorId: bigint, body: string, nextState: TicketStatus) {
  const now = new Date();
  await db.$transaction([
    db.ticketComment.create({ data: { topicId, authorId, content: body, createdAt: now, updatedAt: now } }),
    db.ticketTopic.update({ where: { id: topicId }, data: { state: STATE_VALUE[nextState], lastReplyAt: now, updatedAt: now } }),
  ]);
}

export async function setTopicStatus(topicId: bigint, status: TicketStatus) {
  await db.ticketTopic.update({ where: { id: topicId }, data: { state: STATE_VALUE[status], updatedAt: new Date() } });
}
