import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

const bucket = "assets";
const objectKey = "healthcheck/polis.txt";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
const storage = new S3Client({ forcePathStyle: true });

type ServiceStatus = {
  ok: boolean;
  detail?: string;
};

async function checkPostgres(): Promise<ServiceStatus> {
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    console.error("[neon-health] postgres check failed", error);
    return { ok: false, detail: "Postgres query failed" };
  }
}

async function checkStorage(): Promise<ServiceStatus> {
  try {
    await storage.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: "Polis Neon storage health check",
        ContentType: "text/plain",
      }),
    );
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    return { ok: true };
  } catch (error) {
    console.error("[neon-health] object storage check failed", error);
    return { ok: false, detail: "Object Storage write/delete failed" };
  }
}

export default {
  async fetch(): Promise<Response> {
    const [postgres, objectStorage] = await Promise.all([
      checkPostgres(),
      checkStorage(),
    ]);
    const realtimeConfigured = Boolean(process.env.POLIS_NEON_REALTIME_URL);
    const services = {
      postgres,
      objectStorage,
      realtime: {
        ok: realtimeConfigured,
        detail: realtimeConfigured
          ? "Realtime URL is configured for client subscriptions"
          : "NEON_REALTIME_URL is missing",
      },
    };
    const ok = Object.values(services).every((service) => service.ok);
    return Response.json({ ok, services }, { status: ok ? 200 : 503 });
  },
};
