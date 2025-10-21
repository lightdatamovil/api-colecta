import redis from 'redis';
import dotenv from 'dotenv';
import { CompaniesService, logRed } from 'lightdata-tools';
import mysql2 from 'mysql2/promise';
import https from 'https';
import axios from 'axios';

dotenv.config({ path: process.env.ENV_FILE || ".env" });

/// Redis para obtener las empresas
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;
const redisPassword = process.env.REDIS_PASSWORD;

export const redisClient = redis.createClient({
    socket: {
        host: redisHost,
        port: redisPort,
    },
    password: redisPassword,
});

redisClient.on('error', (err) => {
    logRed(`Error al conectar con Redis: ${err.message}`);
});

// Servicio de empresas
export const companiesService = new CompaniesService({ redisClient, redisKey: "empresasData" })

/// Base de datos de colecta
const colectaDBHost = process.env.COLECTA_DB_HOST;
const colectaDBPort = process.env.COLECTA_DB_PORT;

/// Usuario y contraseña para los logs de la base de datos de colecta
const colectaDbUserForLogs = process.env.COLECTA_DB_USER_FOR_LOGS;
const colectaDbPasswordForLogs = process.env.COLECTA_DB_PASSWORD_FOR_LOGS;
const colectaDbNameForLogs = process.env.COLECTA_DB_NAME_FOR_LOGS;

export const poolLocal = mysql2.createPool({
    host: colectaDBHost,
    user: colectaDbUserForLogs,
    password: colectaDbPasswordForLogs,
    database: colectaDbNameForLogs,
    port: colectaDBPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    timeout: 10000,
    family: 4,
});

export const axiosInstance = axios.create({
    httpsAgent,
    timeout: 5000,
});

// Produccion
export const hostProductionDb = process.env.PRODUCTION_DB_HOST;
export const portProductionDb = process.env.PRODUCTION_DB_PORT;

// JWT
export const jwtSecret = process.env.JWT_SECRET;
export const jwtIssuer = process.env.JWT_ISSUER;
export const jwtAudience = process.env.JWT_AUDIENCE;
export const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';

/// Microservicios y colas
export const rabbitUrl = process.env.RABBITMQ_URL;
export const urlEstadosMicroservice = process.env.URL_ESTADOS_MICROSERVICE;
export const queueEstados = process.env.QUEUE_ESTADOS;
export const queueEstadosML = process.env.QUEUE_ESTADOS_ML;

/// Microservicio de asignacion
export const urlAsignacionMicroservice = process.env.URL_ASIGNACION_MICROSERVICE;

/// Microservicio de alta de envios
export const urlAltaEnvioMicroservice = process.env.URL_ALTA_ENVIO_MICROSERVICE;
export const urlAltaEnvioRedisMicroservice = process.env.URL_ALTA_ENVIO_REDIS_MICROSERVICE;
