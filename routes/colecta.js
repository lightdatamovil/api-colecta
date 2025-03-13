import { Router } from 'express';
import { colectar } from '../controller/colectaController.js';
import { getCompanyById } from '../db.js';
import { verifyParameters } from '../src/funciones/verifyParameters.js';

const colecta = Router();

colecta.post('/colecta', async (req, res) => {
    const errorMessage = verifyParameters(req.body, ['dataQr', 'autoAssign', 'deviceFrom']);

    if (errorMessage) {
        return res.status(400).json({ message: errorMessage });
    }

    const { companyId, userId, profile, dataQr, autoAssign } = req.body;

    try {
        const company = await getCompanyById(companyId);

        const result = await colectar(company, JSON.parse(dataQr), userId, profile, autoAssign);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default colecta;