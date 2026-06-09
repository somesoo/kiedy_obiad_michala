module.exports = {
  apps: [{
    name: 'michal-obiad',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    restart_delay: 3000,
    max_restarts: 10
  }]
}
