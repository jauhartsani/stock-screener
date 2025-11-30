const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const limit = event.queryStringParameters?.limit || 1000;
    const date = event.queryStringParameters?.date;

    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('Database URL not configured');
    }

    const sql = neon(databaseUrl);

    let data;
    
    if (date) {
      // Filter by specific date
      data = await sql`
        SELECT * FROM stock_data 
        WHERE tanggal = ${date}
        ORDER BY kode_saham ASC
        LIMIT ${limit}
      `;
    } else {
      // Get all data
      data = await sql`
        SELECT * FROM stock_data 
        ORDER BY tanggal DESC, kode_saham ASC
        LIMIT ${limit}
      `;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        data: data 
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
```

## **Fitur yang sudah ditambahkan:**

✅ **Tab tanggal horizontal** - Scroll horizontal untuk banyak tanggal  
✅ **Filter by date** - Klik tanggal untuk filter data  
✅ **Active state** - Tanggal yang dipilih highlighted biru  
✅ **Auto-select latest** - Tanggal terbaru otomatis dipilih  
✅ **Organized display** - Data terorganisir per tanggal upload

## **Tampilan:**
```
Master Data
[Refresh Button]

Filter by Tanggal Upload:
┌──────────────────────────────────────────┐
│ [21 Jan 2025] [22 Jan 2025] [23 Jan 2025] → scroll
└──────────────────────────────────────────┘

Menampilkan data untuk: 21 Jan 2025
┌─────────────────────────────────────┐
│         Tabel data saham            │
└─────────────────────────────────────┘
