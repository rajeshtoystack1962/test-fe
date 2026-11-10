module.exports = {
  apps: [
    {
      name: "react-frontend",
      script: "server.js",
      instances: 1,
      autorestart: true,
      env: {
        PORT: 3000,
        BACKEND_URL: "http://localhost:8000",
      },
    },
  ],
};
