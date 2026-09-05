// db.js
// Connection pool สำหรับเชื่อมต่อ Neon Postgres
// ใช้ pooled connection string (มี -pooler ในชื่อ host) เพราะ backend
// อาจมี concurrent request จำนวนมาก การใช้ pool ช่วยไม่ให้ connection ล้น

require('dotenv').config();
const dns = require('dns');
const { Pool, types } = require('pg');

// สำคัญมาก: บังคับให้ pg ส่งค่าคอลัมน์ชนิด DATE (OID 1082) กลับมาเป็น
// string ธรรมดา "YYYY-MM-DD" แทนที่จะแปลงเป็น JavaScript Date object เอง
// เพราะพฤติกรรมเริ่มต้นของ pg จะแปลง DATE โดยใช้เวลาท้องถิ่นของเครื่องเซิร์ฟเวอร์
// (ไม่ใช่ UTC) พอเซิร์ฟเวอร์ตั้งอยู่โซนเวลา +7 (ไทย) แล้วมีการแปลงกลับเป็น UTC
// ทีหลัง (เช่นตอน JSON.stringify) จะถอยไป 7 ชม. ข้ามไปเป็นวันก่อนหน้าเสมอ
// การส่งเป็น string ตรงๆ ตัดปัญหานี้ทิ้งทั้งระบบในจุดเดียว
types.setTypeParser(1082, (val) => val);

// บังคับให้ Node.js เลือก resolve เป็น IPv4 ก่อนเสมอ
// (แก้ปัญหา ENOTFOUND ที่เกิดจากเครื่องมี IPv6 record แต่เส้นทางเน็ตจริงใช้ไม่ได้
// พบได้บ่อยกับเครือข่ายบ้าน/ที่ทำงานหลายแห่งในไทย)
dns.setDefaultResultOrder('ipv4first');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. ตรวจสอบไฟล์ .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon ต้องใช้ SSL เสมอ
  max: 10,                 // จำนวน connection สูงสุดใน pool (free tier ไม่ควรตั้งสูงเกินไป)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // เพิ่มจาก 5000 เป็น 15000 เผื่อเวลา Neon free tier
                                   // ปลุกเครื่องจากสถานะ idle (cold start) ซึ่งบางครั้งใช้เวลา
                                   // นานกว่าปกติ โดยเฉพาะ request แรกหลังไม่มีการใช้งานสักพัก
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

/**
 * รัน query ผ่าน pool โดยตรง (เหมาะกับ query เดี่ยว ๆ ที่ไม่ต้องใช้ transaction)
 * มี retry อัตโนมัติสูงสุด 2 ครั้ง ถ้าเจอ error จากปัญหาเครือข่ายชั่วคราว
 * (ENOTFOUND, ETIMEDOUT, connection timeout) เพื่อทนต่อ DNS/เน็ตไม่เสถียร
 * @param {string} text - SQL query
 * @param {Array} params - parameterized values
 */
async function query(text, params, retriesLeft = 2) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    const isTransient =
      err.code === 'ENOTFOUND' ||
      err.code === 'ETIMEDOUT' ||
      /connection terminated/i.test(err.message || '');

    if (isTransient && retriesLeft > 0) {
      console.warn(`Query failed (${err.code || err.message}), retrying... (${retriesLeft} left)`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return query(text, params, retriesLeft - 1);
    }
    throw err;
  }
}

/**
 * ขอ client แยกจาก pool สำหรับกรณีต้องใช้ transaction
 * ตัวอย่างการใช้งาน:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

module.exports = { pool, query, getClient };
