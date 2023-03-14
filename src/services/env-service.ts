const fs = require('fs');

module.exports = function(endpoint: string, email: string, password: string, host: string, port: string, secure: boolean): void {
    let content = '';
    content += 'ENDPOINT=' + endpoint + '\n';
    content += 'EMAIL=' + email + '\n';
    content += 'PASSWORD=' + password + '\n';
    content += 'SERVICE_URL=' + host + '\n';
    content += 'SERVICE_PORT=' + port + '\n';
    content += ('SERVICE_PROTOCOL=' + (secure ? 'https' : 'http'));

    process.env.ENDPOINT = endpoint;
    process.env.EMAIL = email;
    process.env.PASSWORD = password;
    process.env.SERVICE_URL = host;
    process.env.SERVICE_PORT = port;
    process.env.SERVICE_PROTOCOL = secure ? 'https' : 'http';

    try {
        fs.writeFileSync(process.env.PROD === 'true' ? 'config/.env' : 'src/config/.env', content);
    } catch (err) {
        console.error(err);
    }
}