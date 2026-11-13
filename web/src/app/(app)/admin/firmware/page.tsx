import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge, Card, PageTitle, Table, type Tone } from "@/components/ui";
import { DeployButton, FirmwareUpload } from "./FirmwareClient";

export const metadata = { title: "Firmware (OTA)" };
export const dynamic = "force-dynamic";

const jobTone: Record<string, Tone> = { pending: "warn", downloading: "accent", verifying: "accent", installed: "accent", done: "safe", rejected: "fire", failed: "fire", rolled_back: "danger" };

export default async function FirmwarePage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const sql = db();
  const releases = await sql<{ id: string; version: string; filename: string; size_bytes: number; sha256: string; notes: string | null; created_at: Date }[]>`
    select id, version, filename, size_bytes, sha256, notes, created_at from firmware_releases order by created_at desc`;
  const devices = await sql<{ id: string; device_uid: string; firmware_version: string | null }[]>`select id, device_uid, firmware_version from devices order by device_uid`;
  const jobs = await sql<{ id: string; device_uid: string; from_version: string | null; to_version: string; status: string; progress: number; message: string | null; updated_at: Date }[]>`
    select j.id, d.device_uid, j.from_version, j.to_version, j.status, j.progress, j.message, j.updated_at
      from ota_jobs j join devices d on d.id = j.device_id order by j.created_at desc limit 30`;
  return (
    <>
      <AutoRefresh ms={2000} />
      <PageTitle>{t("nav.firmware")}</PageTitle>
      <Card title={t("ota.upload")}>
        <FirmwareUpload labels={{ version: t("ota.version"), file: t("ota.file"), notes: t("ota.notes"), submit: t("ota.upload") }} />
      </Card>
      <Card title={t("ota.installed")}>
        <div className="flex flex-wrap gap-3">
          {devices.map((d) => <Badge key={d.id} t="accent">{d.device_uid}: {d.firmware_version ?? "—"}</Badge>)}
        </div>
      </Card>
      <Card title={t("ota.releases")}>
        <Table head={[t("ota.version"), t("ota.file"), "SHA-256", t("ota.check"), t("ota.deploy")]}>
          {releases.map((r) => {
            const failed = r.notes?.includes("SERVER CHECK FAILED");
            return (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-white">{r.version}</td>
                <td className="px-3 py-2 text-xs text-ink-300">{r.filename}<br />{(r.size_bytes / 1024).toFixed(1)} KB</td>
                <td className="px-3 py-2 font-mono text-[11px] break-all text-ink-400">{r.sha256}</td>
                <td className="px-3 py-2 text-xs">{failed ? <><Badge t="fire">✗</Badge> <span className="text-red-200">{r.notes}</span><div className="mt-1 text-ink-400">{t("ota.damagedNote")}</div></> : <Badge t="safe">{t("ota.checkOk")}</Badge>}</td>
                <td className="px-3 py-2"><DeployButton releaseId={r.id} devices={devices.map((d) => ({ id: d.id, label: d.device_uid }))} label={t("ota.deploy")} /></td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card title={t("ota.jobs")}>
        <Table head={[t("common.device"), `${t("ota.installed")} → ${t("ota.candidate")}`, t("common.status"), t("ota.progress"), t("common.time")]}>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-3 py-2 font-mono text-white">{j.device_uid}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{j.from_version ?? "—"} → {j.to_version}</td>
              <td className="px-3 py-2"><Badge t={jobTone[j.status] ?? "neutral"}>{j.status}</Badge>{j.message && <div className="mt-1 text-xs text-ink-400">{j.message}</div>}</td>
              <td className="px-3 py-2">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-cyan-500" style={{ width: `${j.progress}%` }} />
                </div>
                <span className="text-xs text-ink-400">{j.progress}%</span>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{j.updated_at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
