/**
 * Face verification client. Face embeddings and the match/liveness models run in a
 * separate Python service (ml/face_service) because they are too heavy for
 * serverless functions. The service is stateless: the server sends the face crop
 * and the card owner's stored embeddings; the service returns a distance and a
 * liveness (anti-spoofing) result. Nothing is stored by the service.
 *
 * There is NO card-only fallback: if the service is unavailable the check-in is
 * denied (FACE_SERVICE_UNAVAILABLE).
 */
import { db } from "./db";

export interface FaceResult {
  ok: true;
  match: boolean;
  distance: number;
  threshold: number;
  live: boolean;
  liveness_score: number;
}
export interface FaceFailure {
  ok: false;
  error: string;
}
export type FaceVerifier = (args: {
  studentId: string;
  jpeg: Buffer;
  embeddings: number[][];
}) => Promise<FaceResult | FaceFailure>;

const httpVerifier: FaceVerifier = async ({ jpeg, embeddings }) => {
  const url = process.env.FACE_SERVICE_URL;
  const token = process.env.FACE_SERVICE_TOKEN;
  if (!url || !token) return { ok: false, error: "FACE_SERVICE_UNAVAILABLE" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ image_b64: jpeg.toString("base64"), candidates: embeddings }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ok: false, error: "FACE_SERVICE_UNAVAILABLE" };
    const j = (await res.json()) as Partial<FaceResult>;
    if (typeof j.match !== "boolean" || typeof j.live !== "boolean") return { ok: false, error: "FACE_SERVICE_BAD_RESPONSE" };
    return {
      ok: true,
      match: j.match,
      distance: Number(j.distance),
      threshold: Number(j.threshold),
      live: j.live,
      liveness_score: Number(j.liveness_score),
    };
  } catch {
    return { ok: false, error: "FACE_SERVICE_UNAVAILABLE" };
  }
};

let verifier: FaceVerifier = httpVerifier;

/** Tests inject a deterministic verifier. */
export function setFaceVerifier(v: FaceVerifier | null) {
  verifier = v ?? httpVerifier;
}

export async function verifyFace(studentId: string, jpeg: Buffer): Promise<FaceResult | FaceFailure> {
  const rows = await db()<{ embedding: number[] }[]>`select embedding from face_embeddings where student_id = ${studentId}`;
  if (!rows.length) return { ok: false, error: "NOT_ENROLLED" };
  return verifier({ studentId, jpeg, embeddings: rows.map((r) => r.embedding) });
}

/** Very small JPEG sanity check: SOI marker and size limit. */
export function decodeFaceJpeg(b64: string): Buffer | null {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 100 || buf.length > 64 * 1024) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return buf;
}
