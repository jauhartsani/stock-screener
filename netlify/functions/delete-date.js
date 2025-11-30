import { Client } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    // Pastikan body ter-parse
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const tanggal = body?.tanggal;

    if (!tanggal) {
      return res.json({ success: false, error: "Tanggal tidak dikirim" });
    }

    // Koneksi ke Neon
    const client = new Client(process.env.NETLIFY_DATABASE_URL);
    await client.connect();

    await client.query(
      "DELETE FROM master_stock WHERE tanggal = $1",
      [tanggal]
    );

    await client.end();

    return res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return res.json({ success: false, error: err.message });
  }
}
