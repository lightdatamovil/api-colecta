import { Router } from 'express';
import { colectar } from '../controller/colectaController/colectaController.js';
import { verifyParamaters } from '../src/functions/verifyParameters.js';
import { getCompanyById } from '../db.js';

const colecta = Router();

colecta.post('/colecta', async (req, res) => {
    const errorMessage = verifyParamaters(req.body, ['dataQr', 'autoAssign', 'deviceFrom']);

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