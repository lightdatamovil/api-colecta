import axios from "axios";

const client = axios.create({
    baseURL: "10.70.0.69:44336",
    timeout: 100,
});

export async function obtenerEstado() {
    const resp = await client.get("/test");
    return { data: resp.data, status: resp.status };
}


