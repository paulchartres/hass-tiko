// Extra fluff
const YAML = require('yaml');

module.exports = function(data: any): string {
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
        command: `curl -s ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
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
        tikoConfig.tiko.shell_command[roomName + '_set_temp'] = `/usr/bin/curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/${room.id}/temperature?temp={{ state_attr("climate.${roomName}", "temperature") }}`
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
        command: `curl -s ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/consumption`,
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
                    command_on: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                    command_off: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/disableHeating`,
                    command_state: `curl -X GET ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
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
                    command_on: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/disableHeating`,
                    command_off: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                    command_state: `curl -X GET ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
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
                    command_on: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/boost`,
                    command_off: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                    command_state: `curl -X GET ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
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
                    command_on: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/absence`,
                    command_off: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                    command_state: `curl -X GET ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
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
                    command_on: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/frost`,
                    command_off: `curl -X PUT ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/mode/false`,
                    command_state: `curl -X GET ${process.env.SERVICE_PROTOCOL}://${process.env.SERVICE_URL}:${process.env.SERVICE_PORT}/api/v1/summary`,
                    value_template: '{{value_json["frost"]}}',
                    icon_template: '{% if (value_json.frost) %} mdi:snowflake-thermometer {% else %} mdi:snowflake-thermometer {% endif %}'
                }
            }
        }
    );
    const doc = new YAML.Document();
    doc.contents = tikoConfig;
    return doc.toString().replace(/"{{OFF}}"/g, "'off'").replace(/"{{ON}}"/g, "'on'");
};