import express, {Application, Request, Response} from 'express';
import winston from "winston";
import path from "path";
require('dotenv').config(
    {
        path: path.join( __dirname, 'config', '.env' )
    }
);

// Default environment configuration if not defined
process.env.SERVICE_PORT ? process.env.SERVICE_PORT = process.env.SERVICE_PORT : process.env.SERVICE_PORT = '3001';

// Custom services
const roomService = require('./services/room-service');
const authService = require('./services/authentication-service');
const tempService = require('./services/temperature-service');
const modeService = require('./services/mode-service');
const yamlService = require('./services/yaml-service');
const envService = require('./services/env-service');

// Server-related
const _request = require('request');
const app: Application = express();
const expressSwagger = require('express-swagger-generator')(app);
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(express.static( __dirname + '/html' ));

// Global variables
let token: string; // Token that will be populated on init
let userId: number; // User ID that will be populated on init
let serverUrl: string;

// Logging
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.simple(),
    defaultMeta: { service: 'server' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// Swagger Definition
const options = {
    swaggerDefinition: {
        info: {
            description: 'Hass-Tiko REST API for Home Assistant integration',
            title: 'Swagger',
            version: '1.0.0',
        },
        host: `${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}`,
        basePath: '/api/v1',
        produces: [
            "application/json"
        ],
        schemes: ['http', 'https'],
        securityDefinitions: {
            JWT: {
                type: 'apiKey',
                in: 'header',
                name: 'Authorization',
                description: "",
            }
        }
    },
    basedir: __dirname, //app absolute path
    files: [process.env.PROD === 'true' ? '../**/*.ts' : './**/*.ts'] //Path to the API handle folder
};

expressSwagger(options);

/**
 * Initialization function that stores the Tiko token in the global-scope variable 'token'
 */
function authenticate(): void {
    if (!process.env.EMAIL || !process.env.PASSWORD || !process.env.ENDPOINT) {
        logger.info('Configuration not found. Please head to the /configuration endpoint to set everything up!');
        return;
    }
    serverUrl = process.env.ENDPOINT;
    authService(process.env.ENDPOINT, process.env.EMAIL, process.env.PASSWORD).then((data: any) => {
        if (data === null) {
            process.exit(1);
            return;
        }
        token = data.logIn.token;
        userId = data.logIn.user.properties[0].id;
        logger.debug('Successfully retrieved userId and token for this instance\'s user.');
    });
}

app.get('/configuration', function(req: Request, res: Response) {
    if (!process.env.EMAIL || !process.env.PASSWORD || !process.env.ENDPOINT) {
        res.sendFile(path.join( __dirname, 'html', 'config/config.html' ));
    } else {
        res.sendFile(path.join( __dirname, 'html', 'errors/config-done/config-done.html' ));
    }
});

app.get('/setup', function(req: Request, res: Response) {
    if (!process.env.EMAIL || !process.env.PASSWORD || !process.env.ENDPOINT) {
        res.sendFile(path.join( __dirname, 'html', 'setup/errors/config-missing/config-missing.html'));
    } else {
        res.sendFile(path.join( __dirname, 'html', 'setup/setup.html' ));
    }
});

/**
 * @typedef Connection
 * @property {string} endpoint.required - Endpoint of the Tiko API.
 * @property {string} email.required - Email of the Tiko account.
 * @property {string} password.required - Password of the Tiko account.
 */

/**
 * Returns a boolean defining whether the provided connection data is usable or not.
 * @route POST /test-connection
 * @group HMI - UI endpoints for easy setup
 * @param {Connection.model} point.body.required - Connection data for Tiko API
 * @returns {object} 200 - Connection was checked
 * @returns {Error}  default - Unexpected error
 */
app.post('/api/v1/test-connection', function (req: Request, res: Response) {
    authService(req.body.endpoint, req.body.email, req.body.password).then((data: any) => {
        res.send({ valid: data != null });
    });
});

/**
 * Saves the provided connection parameters in a .env file in order to re-use them in the server.
 * @route POST /save-connection
 * @group HMI - UI endpoints for easy setup
 * @param {Connection.model} point.body.required - Connection data for Tiko API
 * @returns {object} 200 - Connection was saved
 * @returns {Error}  default - Unexpected error
 */
app.post('/api/v1/save-connection', function (req: Request, res: Response) {
    const proxyHost = req.headers["x-forwarded-host"];
    const host = proxyHost ? proxyHost as string : req.headers.host as string;
    envService(req.body.endpoint, req.body.email, req.body.password, host.split(':')[0], host.split(':')[1], req.secure);
    authenticate();
    res.sendStatus(200);
});

/**
 * Returns the consumption statistics for the user this instance is configured for.
 * @route GET /consumption
 * @group Readable - Readonly data for display usage
 * @returns {object} 200 - Consumption data
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/consumption', function (req: Request, res: Response) {
    _request.get(`${serverUrl}/api/v3/properties/${userId}/consumption_summary/`, { json: true, headers: { "Authorization" : 'token ' + token } }, (err: Error, resp: any, body: any) => {
        if (err) { return logger.error(err) }
        res.send(body.response);
    });
});

/**
 * Returns the available rooms for the user this instance is configured for.
 * @route GET /rooms
 * @group Readable - Readonly data for display usage
 * @returns {object} 200 - Available rooms with their IDs
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/rooms', function (req: Request, res: Response) {
    roomService(token, userId, serverUrl).then((data: any) => {
        if (data === null) {
            res.send(500);
            return;
        }
        let rooms: any = {};
        data.property.rooms.forEach((room: any) => {
            const name = room.name.split(' ').join('-').toLowerCase();
            rooms[name] = room.id;
        });
        res.send(rooms);
    });
});

/**
 * Returns data about all the rooms for this instance's configured user, as sensor-exploitable data for Home Assistant.
 * @route GET /sensors
 * @group Readable - Readonly data for display usage
 * @returns {object} 200 - Sensor data for Home Assistant
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/sensors', async function (req: Request, res: Response) {
    roomService(token, userId, serverUrl).then((data: any) => {
        if (data === null) {
            res.send(500);
            return;
        }
        let sensors: any = {};
        data.property.rooms.forEach((room: any) => {
            const name = room.name.split(' ').join('-').toLowerCase();
            sensors[name] = {
                currentTemperature: room.currentTemperatureDegrees,
                targetTemperature: room.targetTemperatureDegrees,
                humidity: room.humidity,
                status: !!room.status.heatingOperating
            };
        });
        res.send(sensors);
    });
});

/**
 * Returns data about the currently toggled modes (boost, off, absence...) in sensor-exploitable data for Home Assistant.
 * @route GET /modes
 * @group Readable - Readonly data for display usage
 * @returns {object} 200 - Modes data for Home Assistant
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/modes', async function (req: Request, res: Response) {
    roomService(token, userId, serverUrl).then((data: any) => {
        if (data === null) {
            res.sendStatus(500);
            return;
        }
        let modes: any = {};
        Object.keys(data.property.mode).forEach((modeName: any) => {
            modes[modeName] = data.property.mode[modeName];
        });
        res.send(modes);
    });
});

/**
 * Returns data about every sensor and mode as JSON, exploitable by Home Assistant as-is (configured with the HA YAML).
 * @route GET /summary
 * @group Readable - Readonly data for display usage
 * @returns {object} 200 - Full summary data for Home Assistant
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/summary', async function (req: Request, res: Response) {
    roomService(token, userId, serverUrl).then((data: any) => {
        if (data === null) {
            res.sendStatus(500);
            return;
        }
        let summary: any = {};
        Object.keys(data.property.mode).forEach((modeName: any) => {
            summary[modeName] = data.property.mode[modeName];
        });
        data.property.rooms.forEach((room: any) => {
            const name = room.name.split(' ').join('-').toLowerCase();
            summary[name + '_cur'] = room.currentTemperatureDegrees;
            summary[name + '_tar'] = room.targetTemperatureDegrees;
            summary[name + '_dry'] = room.humidity;
            summary[name + '_on'] = !!room.status.heatingOperating;
        });
        res.send(summary);
    });
});

/**
 * Sets the temperature for a specific room. The room id is required and can be retrieved in the /api/v1/rooms endpoint.
 * @route PUT /{roomId}/temperature
 * @group Writable - Writable data from the outside
 * @param {number} roomId.path.required - ID of the room whose temperature should be set
 * @param {number} temp.query.required - Target temperature for this room
 * @returns {object} 202 - Temperature has been set
 * @returns {Error}  default - Unexpected error
 */
app.put('/api/v1/:roomId/temperature', async function (req: Request, res: Response) {
    logger.debug('Setting temperature of room ' + req.params.roomId + ' to ' + req.query.temp);
    tempService(token, userId, serverUrl, req.params.roomId, req.query.temp).then((data: any) => {
        if (data === null) {
            res.sendStatus(500);
            return;
        }
        res.sendStatus(202);
    });
});

/**
 * Sets the global mode of the heating system.
 * @route PUT /mode/{mode}
 * @group Writable - Writable data from the outside
 * @param {string} mode.path.required - Name of the mode that should be overridden
 * @returns {object} 202 - Mode has been set
 * @returns {Error}  default - Unexpected error
 */
app.put('/api/v1/mode/:mode', async function (req: Request, res: Response) {
    logger.debug('Setting mode to ' + req.params.mode);
    modeService(token, userId, serverUrl, req.params.mode).then((data: any) => {
        if (data === null) {
            res.sendStatus(500);
            return;
        }
        res.sendStatus(202);
    });
});

/**
 * Outputs the configuration yaml file for Home Assistant.
 * @route GET /configuration/yaml
 * @group Configuration - Configuration data for Home Assistant
 * @returns {object} 200 - Configuration yaml file
 * @returns {Error}  default - Unexpected error
 */
app.get('/api/v1/configuration/yaml', async function (req: Request, res: Response) {
    roomService(token, userId, serverUrl).then((data: any) => {
        res.send(yamlService(data));
    });
});

app.listen(process.env.SERVICE_PORT, function () {
    logger.debug('App is listening on port ' + process.env.SERVICE_PORT + '!');
    authenticate();
});