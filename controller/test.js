import axios from "axios";

const client = axios.create({
    baseURL: "https://serverestado.lightdata.app",
    timeout: 5000,
});

export async function obtenerEstado() {
    const resp = await client.get("/test");
    return { data: resp.data, status: resp.status };
}


