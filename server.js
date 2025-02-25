const express = require('express');
const enviosRouter = require('./route'); // Importar el route

const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Usar el route
app.use('/api', enviosRouter);

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});