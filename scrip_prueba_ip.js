// armar un scrip que se conecte a una ip locasl (al 10.etc.445.jdf) y que este verifique si se puede conectar que devuelva un?hoola' o loq ue sea 


el endpoint es la ip(10.155.221.4) / estados
y ver si responde que se conecta bien o no


// Base de datos de asignaciones
ASIGNACIONES_DB_HOST = 149.56.182.49
ASIGNACIONES_DB_USER = root
ASIGNACIONES_DB_PASSWORD = 585
ASIGNACIONES_DB_NAME = asigna_data
ASIGNACIONES_DB_PORT = 44341


// Base de datos de produccion -- pedir a cris
PRODUCTION_DB_HOST = bhsmysql1.lightdata.com.ar
PRODUCTION_DB_PORT = 3306


// check_estados.js
const http = require('http');

const options = {
    hostname: '10.70.0.69',
    port: 80,
    path: '/estados',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, res => {
    console.log(`status: ${res.statusCode}`);
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log('body:', body.substring(0, 1000)); // muestra hasta 1000 chars
    });
});

req.on('timeout', () => {
    console.error('timeout');
    req.destroy();
});
req.on('error', e => console.error('error:', e.message));
req.end();