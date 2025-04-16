import express, { json, urlencoded } from 'express';
import colecta from './routes/colecta.js';
import { redisClient } from './db.js';
import { logPurple } from './src/funciones/logsCustom.js';
import cors from 'cors';

const app = express();

app.use(json({ limit: '50mb' }));
app.use(urlencoded({ limit: '50mb', extended: true }));
app.use(json());
app.use(cors());

const PORT = process.env.PORT || 13000;

app.use("/api", colecta);
app.post('/api/testapi', async (req, res) => {
    const startTime = performance.now();
    const endTime = performance.now();
    logPurple(`Tiempo de ejecución: ${endTime - startTime} ms`)
    res.status(200).json({ message: 'API funcionando correctamente' });
});

app.get('/ping', (req, res) => {
    const currentDate = new Date();
    currentDate.setHours(currentDate.getHours()); // Resta 3 horas
  
    // Formatear la hora en el formato HH:MM:SS
    const hours = currentDate.getHours().toString().padStart(2, '0');
    const minutes = currentDate.getMinutes().toString().padStart(2, '0');
    const seconds = currentDate.getSeconds().toString().padStart(2, '0');
  
    const formattedTime = `${hours}:${minutes}:${seconds}`;
  
    res.status(200).json({
      hora: formattedTime
    });
  });
await redisClient.connect();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
