import mysql from 'mysql2/promise';

export async function conectarMySQL() {
    let connection;
    try {
        const t0 = Date.now();

        connection = await mysql.createConnection({
            host: 'http://bhsmysql1.lightdata.com.ar/',
            port: 3306,
            user: 'lightdat_uplanet',
            password: 'uplanet123456*',
            database: 'lightdat_tt_planet'
        });

        const connectMs = Date.now() - t0;
        console.log(`✓ Conectado a MySQL en ${connectMs} ms`);

        // Ejemplo de consulta (opcional: también medimos su tiempo)
        const t1 = Date.now();
        const [rows] = await connection.execute('SELECT NOW() as tiempo');
        const queryMs = Date.now() - t1;

        console.log('Hora actual:', rows[0].tiempo);
        console.log(`⏱️ Tiempo de la consulta: ${queryMs} ms`);
    } catch (err) {
        console.error('Error conectando a MySQL:', err);
    } finally {
        if (connection) await connection.end();
    }
}

conectarMySQL();
