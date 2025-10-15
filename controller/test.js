import axios from "axios";

const client = axios.create({
    baseURL: "https://10.70.0.69:44336",
    timeout: 100,
});

const clientAnterior = axios.create({
    baseURL: "https://serverestado.lightdata.app/test",
    timeout: 100,
});

export async function obtenerEstado() {
    const resp = await clientAnterior.get("/test");
    return { data: resp.data, status: resp.status };
}


