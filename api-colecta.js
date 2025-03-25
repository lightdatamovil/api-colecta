import express, { json, urlencoded } from 'express';
import colecta from './routes/colecta.js';
import { redisClient } from './db.js';
import { logPurple } from './src/funciones/logsCustom.js';

const app = express();

app.use(json({ limit: '50mb' }));
app.use(urlencoded({ limit: '50mb', extended: true }));
app.use(json());

const PORT = process.env.PORT || 13000;

app.use("/api", colecta);
app.post('/api/testapi', async (req, res) => {
    const startTime = performance.now();
    const endTime = performance.now();
    logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`)
    res.status(200).json({ message: 'API funcionando correctamente' });
});


await redisClient.connect();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
