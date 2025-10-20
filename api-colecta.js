import express, { json, urlencoded } from 'express';
import colecta from './routes/colecta.js';
import { jwtAudience, jwtIssuer, jwtSecret, redisClient } from './db.js';
import cors from 'cors';
import clear from './routes/clearClient.js';
import { logBlue, verifyToken } from 'lightdata-tools';
import { conectarMySQLip, conectarMySQLUrl } from './pruebaChris.js';
import { getAllActiveLocal } from './src/funciones/dbList.js';

const app = express();

app.use(json({ limit: '50mb' }));
app.use(urlencoded({ limit: '50mb', extended: true }));
app.use(json());
app.use(cors());

const PORT = process.env.PORT;

app.use("/client", clear);
app.get('/active-db', (req, res) => {
  try {
    res.status(200).json(getAllActiveLocal());
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener el estado local' });
  }
});
app.use(verifyToken({ jwtSecret, jwtIssuer, jwtAudience }));
app.use("/api", colecta);

app.get('/db-url', async (_req, res) => {
  const result = await conectarMySQLUrl();
  res.status(result.ok ? 200 : 500).json({ when: new Date().toISOString(), result });
});

// GET #2 — IP
app.get('/db-ip', async (_req, res) => {
  const result = await conectarMySQLip();
  res.status(result.ok ? 200 : 500).json({ when: new Date().toISOString(), result });
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
  logBlue(`Servidor corriendo en el puerto ${PORT}`);

});
