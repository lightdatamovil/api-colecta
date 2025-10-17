
import mysql from 'mysql2/promise';

export async function conectarMySQL() {
    try {
        const connection = await mysql.createConnection({
            host: '10.60.0.125',
            port: 3306,
            user: 'lightdat_uplanet',
            password: 'uplanet123456*',
            database: 'lightdat_tt_planet'
        });

        console.log('✓ Conectado a MySQL');

        // Ejemplo de consulta
        const [rows] = await connection.execute('SELECT NOW() as tiempo');
        console.log('Hora actual:', rows[0].tiempo);

        await connection.end();
    } catch (err) {
        console.error('Error conectando a MySQL:', err);
    }
}


conectarMySQL();