import { ExternalLink, Fingerprint, IdCard, ScanFace } from "lucide-react";
import { Alert, Card, CardHeader, DefinitionList } from "@/components/ui";
import { IdentityBadge, IdentityProgress } from "@/components/member/status";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { BindPanel } from "./bind-panel";

export const metadata = { title: "Verify" };

export default async function VerifyPage() {
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const settings = await getSettings();
  const b = member.binding;
  const note = b ? await db.adminComment.findFirst({ where: { resourceType: "MemberIdentity", resourceId: member.id.toString() }, orderBy: { id: "desc" } }) : null;
  const canBind = member.identityStatus === "UNBOUND" || member.identityStatus === "REJECTED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("identity.title")}</h1>
        <IdentityBadge status={member.identityStatus} t={t} />
      </div>
      <Card className="px-5 py-4">
        <IdentityProgress status={member.identityStatus} t={t} />
      </Card>

      {member.identityStatus === "REJECTED" && (
        <Alert tone="danger" title={t("identity.status.REJECTED")}>
          {note?.body ? (
            <>
              <span className="font-medium">{t("identity.reviewNote")}：</span>
              {note.body}
            </>
          ) : (
            t("identity.rejectedDesc")
          )}
        </Alert>
      )}
      {member.identityStatus === "PENDING_REVIEW" && <Alert tone="warning" title={t("identity.status.PENDING_REVIEW")}>{t("identity.pendingDesc")}</Alert>}
      {member.identityStatus === "VERIFIED" && <Alert tone="success" title={t("identity.status.VERIFIED")}>{t("identity.verifiedDesc")}</Alert>}

      {canBind && (
        <Card className="overflow-hidden">
          <div className="bg-navy px-6 py-6 text-white">
            <h2 className="text-lg font-semibold">{t("identity.gateTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{t("identity.gateDesc")}</p>
            <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              {[
                { icon: Fingerprint, label: t("identity.kycLevel") + " L2" },
                { icon: IdCard, label: t("identity.legalName") },
                { icon: ScanFace, label: t("identity.pairwise") },
              ].map((x, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2">
                  <x.icon size={16} className="text-brand-teal" aria-hidden />
                  {x.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 px-6 py-6">
            <p className="text-sm text-muted">{t("identity.consent")}</p>
            <BindPanel wallet={env.cafecaWallet} mock={env.cafecaMock} label={member.identityStatus === "REJECTED" ? t("identity.rebindButton") : t("identity.bindButton")} />
            <p className="text-center text-sm text-muted">
              {t("identity.noCafeca")}{" "}
              <a href={settings.cafecaSignupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                {t("identity.getCafeca")} <ExternalLink size={13} />
              </a>
            </p>
          </div>
        </Card>
      )}

      {b && (
        <Card>
          <CardHeader title={t("identity.boundAccount")} />
          <div className="px-5">
            <DefinitionList
              items={[
                { label: t("identity.boundAccount"), value: <span className="font-mono text-xs">{shortAddr(b.account, 10, 8)}</span> },
                { label: t("identity.legalName"), value: b.legalName ?? "—" },
                { label: t("identity.kycLevel"), value: `L${b.level}` },
                { label: t("identity.boundAt"), value: fmtDateTime(b.boundAt, locale) },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
