import { Client } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    // Parse body untuk POST request
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const tanggal = body?.tanggal || null;

    const client = new Client(process.env.NETLIFY_DATABASE_URL);
    await client.connect();

    let query = "SELECT * FROM master_stock";
    let params = [];

    if (tanggal) {
      query += " WHERE tanggal = $1";
      params.push(tanggal);
    }

    query += " ORDER BY kode ASC"; // default sort biar rapi

    const result = await client.query(query, params);

    await client.end();

    return res.json({
      success: true,
      records: result.rows
    });

  } catch (err) {
    console.error("get-master error:", err);
    return res.json({
      success: false,
      error: err.message
    });
  }
}
