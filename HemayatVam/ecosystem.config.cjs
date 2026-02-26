module.exports = {
  apps: [{ name: 'hemayatvam-server', script: './server/server.js', instances: 1, autorestart: true, watch: false }]
};
