const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { records } = JSON.parse(event.body);

    if (!records || !Array.isArray(records)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid data format' })
      };
    }

    // Get DATABASE_URL from environment
    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('Database URL not configured');
    }

    const sql = neon(databaseUrl);

    // Insert records
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
      headers,
      body: JSON.stringify({ 
        success: true, 
        count: records.length 
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error' 
      })
    };
  }
};
