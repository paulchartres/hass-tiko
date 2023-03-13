import express, {Application, Request, Response} from 'express';
import winston from "winston";

// Custom services
const roomService = require('./services/room-service');
const authService = require('./services/authentication-service');
const tempService = require('./services/temperature-service');
const modeService = require('./services/mode-service');

// Extra fluff
const YAML = require('yaml');

// Server-related
const _request = require('request');
const app: Application = express();
const expressSwagger = require('express-swagger-generator')(app);

// Global variables
let token: string; // Token that will be populated on init
let userId: number; // User ID that will be populated on init
let serverUrl: string = process.env.SERVER ? process.env.SERVER : 'https://portal-engie.tiko.ch'; // Server URL the queries will be sent to

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
    authService(serverUrl).then((data: any) => {
        if (data === null) {
            process.exit(1);
            return;
        }
        token = data.logIn.token;
        userId = data.logIn.user.properties[0].id;
        logger.debug('Successfully retrieved userId and token for this instance\'s user.');
    });
}

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
        const tikoConfig: any = {
            tiko: {
                sensor: [],
                binary_sensor: [],
                switch: [],
                climate: [],
                shell_command: {},
                automation: [],
            }
        };
        const commandLineSensor = {
            platform: 'command_line',
            name: 'Tiko_settings',
            json_attributes: [
                'boost',
                'frost',
                'absence',
                'disableHeating'
            ],
            command: `curl -s ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
            scan_interval: 60,
            value_template: 1
        };
        data.property.rooms.forEach((room: any) => {
            const roomName = room.name.split(' ').join('-').toLowerCase();
            tikoConfig.tiko.sensor.push(
                {
                    platform: 'template',
                    sensors: {
                        [roomName + '_temperature']: {
                            friendly_name: room.name + ' temperature',
                            value_template: `{{ state_attr('sensor.tiko_settings', '${roomName}_cur')}}`,
                            unit_of_measurement: '°C',
                            device_class: 'temperature'
                        }
                    }
                },
                {
                    platform: 'template',
                    sensors: {
                        [roomName + '_temperature_target']: {
                            friendly_name: room.name + ' temperature target',
                            value_template: `{{ state_attr('sensor.tiko_settings', '${roomName}_tar')}}`,
                            unit_of_measurement: '°C',
                            device_class: 'temperature'
                        }
                    }
                },
                {
                    platform: 'template',
                    sensors: {
                        [roomName + '_humidity']: {
                            friendly_name: room.name + ' humidity',
                            value_template: `{{ state_attr('sensor.tiko_settings', '${roomName}_dry')}}`,
                            unit_of_measurement: '%',
                            device_class: 'humidity'
                        }
                    }
                }
            );
            tikoConfig.tiko.binary_sensor.push(
                {
                    platform: 'template',
                    sensors: {
                        [roomName + '_heating']: {
                            friendly_name: room.name + ' heating',
                            value_template: `{{ is_state_attr('sensor.tiko_settings','${roomName}_on', true)}}`,
                            device_class: 'heat'
                        }
                    }
                }
            );
            tikoConfig.tiko.automation.push(
                {
                    id: 'sync_status_on_' + roomName,
                    alias: 'sync_status_on_' + roomName,
                    description: 'On HA startup or heater status change, check if heater is currently on to update the climate object in HA',
                    trigger: [
                        {
                            platform: 'homeassistant',
                            event: 'start'
                        },
                        {
                            platform: 'state',
                            entity_id: 'binary_sensor.' + roomName + '_heating'
                        }
                    ],
                    condition: [
                        {
                            condition: 'state',
                            entity_id: 'binary_sensor.' + roomName + '_heating',
                            state: '{{ON}}'
                        }
                    ],
                    action: [
                        {
                            service: 'climate.turn_on',
                            target: {
                                entity_id: 'climate.' + roomName
                            }
                        }
                    ],
                    mode: 'single'
                },
                {
                    id: 'sync_status_off_' + roomName,
                    alias: 'sync_status_off_' + roomName,
                    description: 'On HA startup or heater status change, check if heater is currently off to update the climate object in HA',
                    trigger: [
                        {
                            platform: 'homeassistant',
                            event: 'start'
                        },
                        {
                            platform: 'state',
                            entity_id: 'binary_sensor.' + roomName + '_heating'
                        }
                    ],
                    condition: [
                        {
                            condition: 'state',
                            entity_id: 'binary_sensor.' + roomName + '_heating',
                            state: '{{OFF}}'
                        }
                    ],
                    action: [
                        {
                            service: 'climate.turn_off',
                            target: {
                                entity_id: 'climate.' + roomName
                            }
                        }
                    ],
                    mode: 'single'
                },
                {
                    id: 'sync_temp_' + roomName,
                    alias: 'sync_temp_' + roomName,
                    description: 'On HA startup or temp change, update the climate object in HA',
                    trigger: [
                        {
                            platform: 'homeassistant',
                            event: 'start'
                        },
                        {
                            platform: 'state',
                            entity_id: 'sensor.' + roomName + '_temperature_target'
                        }
                    ],
                    condition: [],
                    action: [
                        {
                            service: 'climate.set_temperature',
                            target: {
                                entity_id: 'climate.' + roomName
                            },
                            data: {
                                temperature: `{{ states('sensor.${roomName}_temperature_target') }}`
                            }
                        }
                    ],
                    mode: 'single'
                },
                {
                    id: 'set_temp_' + roomName,
                    alias: 'set_temp_' + roomName,
                    description: 'On climate update, send update command to endpoint',
                    trigger: [
                        {
                            platform: 'state',
                            entity_id: 'climate.' + roomName,
                            attribute: 'temperature'
                        }
                    ],
                    condition: [
                        {
                            condition: 'and',
                            conditions: [
                                {
                                    condition: 'state',
                                    entity_id: 'switch.heaters_off',
                                    state: '{{OFF}}'
                                },
                                {
                                    condition: 'state',
                                    entity_id: 'switch.heaters_frost',
                                    state: '{{OFF}}'
                                },
                                {
                                    condition: 'state',
                                    entity_id: 'switch.heaters_absence',
                                    state: '{{OFF}}'
                                }
                            ]
                        }
                    ],
                    action: [
                        {
                            service: 'shell_command.' + roomName + '_set_temp',
                        }
                    ],
                    mode: 'single'
                }
            );
            tikoConfig.tiko.shell_command[roomName + '_set_temp'] = `/usr/bin/curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/${room.id}/temperature?temp={{ state_attr("climate.${roomName}", "temperature") }}`
            tikoConfig.tiko.climate.push(
                {
                    platform: 'generic_thermostat',
                    name: room.name,
                    heater: 'switch.heaters_on_off',
                    target_sensor: 'sensor.' + roomName + '_temperature'
                }
            );
            commandLineSensor.json_attributes.push(roomName + '_cur', roomName + '_tar', roomName + '_dry', roomName + '_on');
        });
        tikoConfig.tiko.sensor.push({
            platform: 'command_line',
            name: 'Tiko consumption',
            json_attributes: [
                'today_total_wh',
                'yesterday_total_same_time_wh',
                'last_month_total_wh',
                'this_month_total_wh',
                'last_month_total_same_day_wh'
            ],
            command: `curl -s ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/consumption`,
            unit_of_measurement: 'W',
            scan_interval: 3600,
            value_template: 1
        });
        tikoConfig.tiko.sensor.push(commandLineSensor);
        tikoConfig.tiko.switch.push(
            {
                platform: 'command_line',
                switches: {
                    heaters_on_off: {
                        friendly_name: 'Heaters on/off',
                        command_on: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                        command_off: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/disableHeating`,
                        command_state: `curl -X GET ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                        value_template: '{{value_json["disableHeating"]}}',
                        icon_template: '{% if (value_json.disableHeating) %} mdi:radiator-off {% else %} mdi:radiator-off {% endif %}'
                    }
                }
            },
            {
                platform: 'command_line',
                switches: {
                    heaters_off: {
                        friendly_name: 'Heaters off',
                        command_on: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/disableHeating`,
                        command_off: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                        command_state: `curl -X GET ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                        value_template: '{{value_json["disableHeating"]}}',
                        icon_template: '{% if (value_json.disableHeating) %} mdi:radiator-off {% else %} mdi:radiator-off {% endif %}'
                    }
                }
            },
            {
                platform: 'command_line',
                switches: {
                    heaters_boost: {
                        friendly_name: 'Heaters boost',
                        command_on: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/boost`,
                        command_off: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                        command_state: `curl -X GET ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                        value_template: '{{value_json["boost"]}}',
                        icon_template: '{% if (value_json.boost) %} mdi:sun-thermometer {% else %} mdi:lightning-bolt-outline {% endif %}'
                    }
                }
            },
            {
                platform: 'command_line',
                switches: {
                    heaters_absence: {
                        friendly_name: 'Heaters absence',
                        command_on: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/absence`,
                        command_off: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                        command_state: `curl -X GET ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                        value_template: '{{value_json["absence"]}}',
                        icon_template: '{% if (value_json.absence) %} mdi:door-closed-lock {% else %} mdi:door {% endif %}'
                    }
                }
            },
            {
                platform: 'command_line',
                switches: {
                    heaters_frost: {
                        friendly_name: 'Heaters frost',
                        command_on: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/frost`,
                        command_off: `curl -X PUT ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                        command_state: `curl -X GET ${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                        value_template: '{{value_json["frost"]}}',
                        icon_template: '{% if (value_json.frost) %} mdi:snowflake-thermometer {% else %} mdi:snowflake-thermometer {% endif %}'
                    }
                }
            }
        );
        const doc = new YAML.Document();
        doc.contents = tikoConfig;
        res.send(doc.toString().replace(/"{{OFF}}"/g, "'off'").replace(/"{{ON}}"/g, "'on'"));
    });
});

app.listen(process.env.SERVICE_PORT, function () {
    logger.debug('App is listening on port ' + process.env.SERVICE_PORT + '!');
    authenticate();
});