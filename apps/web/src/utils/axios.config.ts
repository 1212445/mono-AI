import axios from "axios";

const server = axios.create({
  baseURL: "http://localhost:3000",
});

server.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

server.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);

export default server;
