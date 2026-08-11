const path = require('path');

module.exports = {
  apps: [{
    name: 'kiedy-obiad',
    script: 'server.js',
    // Bez tego pm2 bierze katalog, z którego go wywołano — a wtedy `node server.js`
    // nie znajduje pliku i proces wpada w pętlę restartów.
    cwd: __dirname,
    env: {
      NODE_ENV: 'production'
      // PORT celowo NIE jest tu ustawiony: env z pm2 nadpisuje .env (dotenv nie rusza
      // istniejących zmiennych), a port musi pochodzić z .env — na mikr.us to port
      // wystawiony na świat (21535), nie 3000.
    },
    restart_delay: 3000,
    max_restarts: 10
  }]
};
