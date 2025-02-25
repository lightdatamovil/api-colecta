const express = require('express');
const Colecta = require('./clase-colecta'); // Asegúrate de importar la clase correctamente
const redis = require('redis');
const mysql = require('mysql');
const router = express.Router();
const redisClient = redis.createClient({
    socket: {
        host: '192.99.190.137',
        port: 50301,
    },
    password: 'sdJmdxXC8luknTrqmHceJS48NTyzExQg',
});

async function actualizarEmpresas() {
    const empresasDataJson = await redisClient.get('empresas');
    let Aempresas = JSON.parse(empresasDataJson);
    return Aempresas;
}

async function iniciarProceso() {
    try {
        // Conectar a Redis
        await redisClient.connect();

        // Actualizar empresas
        let empresas = await actualizarEmpresas();

        // Cerrar la conexión de Redis
        await redisClient.quit();
        console.log("Conexión a Redis cerrada.");
        return empresas;
    } catch (error) {
        console.error("Error en el proceso:", error);
    }
}

// Endpoint POST /colecta
router.post('/colecta', async (req, res) => {
    try {
        const { dataQR, didempresa } = req.body; // Obtener el QR y didempresa del cuerpo de la solicitud
        
        if (!dataQR || !didempresa) {
            return res.status(400).json({ estado: false, mensaje: "Los campos dataQR y didempresa son requeridos" });
        }

        const Aempresas2 = await iniciarProceso();
        const AdataDB = Aempresas2[didempresa];

        if (!AdataDB) {
            return res.status(404).json({ estado: false, mensaje: "Empresa no encontrada" });
        }

        // Configuración de la conexión a la base de datos
        const connection = mysql.createConnection({
            host: "bhsmysql1.lightdata.com.ar",
            user: AdataDB.dbuser,
            password: AdataDB.dbpass,
            database: AdataDB.dbname
        });

        // Instancia de la clase GestionEnvios
        const colecta = new Colecta(connection, Aempresas2);

        // Llamar al método colecta de la clase GestionEnvios
        const resultado = await Colecta.colecta(dataQR, req);

        // Devolver la respuesta
        res.status(200).json(resultado);
    } catch (error) {
        console.error("Error en el endpoint /colecta:", error);
        res.status(500).json({ estado: false, mensaje: "Error interno del servidor" });
    }
});

module.exports = router;
