const https = require('https');
const WebSocket = require('ws');
const wsManager = require('./websocketServer');

let httpsServer = null;
let httpsWss = null;

function isRunning() {
    return Boolean(httpsServer);
}

function start(app, key, cert, httpsPort) {
    return new Promise((resolve, reject) => {
        if (!key || !cert) {
            resolve(false);
            return;
        }

        if (httpsServer) {
            httpsServer.close(() => {
                start(app, key, cert, httpsPort).then(resolve).catch(reject);
            });
            return;
        }

        httpsServer = https.createServer({ key, cert }, app);
        httpsWss = new WebSocket.Server({ server: httpsServer });
        wsManager.attach(httpsWss, 'https');

        httpsServer.on('error', (error) => {
            reject(error);
        });

        httpsServer.listen(httpsPort, () => {
            resolve(true);
        });
    });
}

function reload(app, key, cert, httpsPort) {
    return new Promise((resolve, reject) => {
        const closePromise = httpsServer
            ? new Promise((closeResolve) => {
                if (httpsWss) {
                    httpsWss.clients.forEach((client) => client.terminate());
                    httpsWss.close();
                    httpsWss = null;
                }
                httpsServer.close(() => {
                    httpsServer = null;
                    closeResolve();
                });
            })
            : Promise.resolve();

        closePromise
            .then(() => start(app, key, cert, httpsPort))
            .then(resolve)
            .catch(reject);
    });
}

module.exports = {
    isRunning,
    start,
    reload,
};
