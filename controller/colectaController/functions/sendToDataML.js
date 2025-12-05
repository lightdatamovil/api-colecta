import { connect } from 'amqplib';
import dotenv from 'dotenv';
import CustomException from '../../../classes/custom_exception.js';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_ESTADOS = "dataML";

let connection = null;
let channel = null;

async function getChannel() {
    if (channel) return channel;

    connection = await connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_ESTADOS, { durable: true });

    process.on('exit', () => {
        if (channel) channel.close();
        if (connection) connection.close();
    });

    return channel;
}

export async function senToDataML(
    companyId,
    didEnvio,
    sellerId,
    shipmentId
) {
    const message = {
        idEmpresa: companyId,
        did: didEnvio,
        sellerId: sellerId,
        shipmentId: shipmentId
    };
    const ch = await getChannel();
    const sent = ch.sendToQueue(
        QUEUE_ESTADOS,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );

    if (!sent) {
        throw new CustomException({ title: 'Error en RabbitMQ', message: 'Buffer lleno en RabbitMQ' });
    }
}
