import axios from "axios";

const client = axios.create({
    baseURL: "http://10.70.0.69:13000",
    timeout: 10000,
});

const clientAnterior = axios.create({
    baseURL: "https://serverestado.lightdata.app",
    timeout: 10000,
});

export async function obtenerEstado() {
    const resp = await clientAnterior.get("/test");
    return { data: resp.data, status: resp.status };
}


