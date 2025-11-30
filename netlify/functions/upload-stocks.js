import { neon } from '@netlify/neon';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { records } = JSON.parse(event.body);

    if (!records || !Array.isArray(records)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid data format' })
      };
    }

    // Connect to Neon - otomatis pakai NETLIFY_DATABASE_URL
    const sql = neon();

    // Insert records with ON CONFLICT DO UPDATE
    for (const record of records) {
      await sql`
        INSERT INTO stock_data (
          kode_saham, nama_perusahaan, tanggal, 
          open_price, penutupan, tertinggi, terendah, volume,
          foreign_buy, foreign_sell, foreign_net
        ) VALUES (
          ${record.kode_saham}, ${record.nama_perusahaan}, ${record.tanggal},
          ${record.open_price}, ${record.penutupan}, ${record.tertinggi}, 
          ${record.terendah}, ${record.volume}, ${record.foreign_buy}, 
          ${record.foreign_sell}, ${record.foreign_net}
        )
        ON CONFLICT (kode_saham, tanggal) 
        DO UPDATE SET
          nama_perusahaan = EXCLUDED.nama_perusahaan,
          open_price = EXCLUDED.open_price,
          penutupan = EXCLUDED.penutupan,
          tertinggi = EXCLUDED.tertinggi,
          terendah = EXCLUDED.terendah,
          volume = EXCLUDED.volume,
          foreign_buy = EXCLUDED.foreign_buy,
          foreign_sell = EXCLUDED.foreign_sell,
          foreign_net = EXCLUDED.foreign_net
      `;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        count: records.length 
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error' 
      })
    };
  }
};
