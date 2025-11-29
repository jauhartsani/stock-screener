import { neon } from '@neondatabase/serverless';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const limit = event.queryStringParameters?.limit || 1000;

    // Connect to Neon
    const sql = neon(process.env.DATABASE_URL);

    // Query data
    const data = await sql`
      SELECT * FROM stock_data 
      ORDER BY tanggal DESC, kode_saham ASC
      LIMIT ${limit}
    `;

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        data: data 
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
