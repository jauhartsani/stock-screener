import { Client } from "@neondatabase/serverless";

export default async (req, res) => {
  try {
    const { tanggal } = req.body;

    const sql = new Client(process.env.NETLIFY_DATABASE_URL);
    await sql.connect();

    await sql.query(`DELETE FROM master_stock WHERE tanggal = $1`, [tanggal]);

    await sql.end();

    return res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return res.json({ success: false, error: err.message });
  }
};
