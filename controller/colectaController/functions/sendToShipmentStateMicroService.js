import { connect } from 'amqplib';
import dotenv from 'dotenv';
import { logCyan, logGreen, logRed, logYellow } from '../../../src/funciones/logsCustom.js';
import { formatFechaUTC3 } from '../../../src/funciones/formatFechaUTC3.js';
import axios from 'axios';
import { generarTokenFechaHoy } from '../../../src/funciones/generarTokenFechaHoy.js';
dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = process.env.QUEUE_ESTADOS;
const BACKUP_ENDPOINT = "https://serverestado.lightdata.app/estados"

let connection = null;
let channel = null;

async function getChannel() {
    if (channel) return channel;

    try {
        connection = await connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

        process.on('exit', () => {
            if (channel) channel.close();
            if (connection) connection.close();
        });

        return channel;
    } catch (err) {
        logRed(`❌ Error al inicializar RabbitMQ: ${err.stack}`);
        throw err;
    }
}

export async function sendToShipmentStateMicroService(
    companyId,
    userId,
    shipmentId,
    latitud,
    longitud
) {
    const message = {
        didempresa: companyId,
        didenvio: shipmentId,
        estado: 0,
        subestado: null,
        estadoML: null,
        fecha: formatFechaUTC3(),
        quien: userId,
        operacion: 'colecta',
        latitud,
        longitud,
        desde: "colectaAPP",
        tkn: generarTokenFechaHoy(),
    };
    logCyan(`Enviando mensaje a RabbitMQ: ${JSON.stringify(message)}`);
    try {
        if (process.env.LOCAL == 'true') {
            throw new Error();
        }
        logCyan(`Enviando mensaje a RabbitMQ: ${JSON.stringify(message)}`);
        const ch = await getChannel();
        const sent = ch.sendToQueue(
            QUEUE_ESTADOS,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );

        if (sent) {
            logGreen('✅ Mensaje enviado correctamente al microservicio de estados');
        } else {
            logYellow('⚠️ Mensaje no pudo encolarse (buffer lleno)');
            throw new Error('Buffer lleno en RabbitMQ');
        }
    } catch (error) {
        logRed(`❌ Falló RabbitMQ, intentando enviar por HTTP: ${error.message}`);

        try {
            const response = await axios.post(BACKUP_ENDPOINT, message);
            logGreen(`✅ Enviado por HTTP con status ${response.status}`);
        } catch (httpError) {
            logRed(`❌ Falló el envío por HTTP también: ${httpError.message}`);
            throw httpError;
        }
    }
}
