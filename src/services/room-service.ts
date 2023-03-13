// Love the name of this file
import {gql, request} from "graphql-request";

module.exports = function(token: string, userId: number, serverUrl: string): Promise<any> {
    return new Promise(async resolve => {
        const query = gql`
          query GET_PROPERTY_OVERVIEW_DECENTRALISED($id: Int!, $excludeRooms: [Int]) {
          settings {
            benchmark {
              isEnabled
              __typename
            }
            __typename
          }
          property(id: $id) {
            id
            mode
            mboxDisconnected
            isNetatmoAuthorised
            netatmoLinkAccountUrl
            isSinapsiEnabled
            isSinapsiAuthorised
            allInstalled
            ownerPermission
            constructionYear
            surfaceArea
            floors
            valueProposition
            address {
              id
              street
              number
              city
              zipCode
              __typename
            }
            tips {
              id
              tip
              __typename
            }
            ...CentralisedDevicesCompact
            rooms(excludeRooms: $excludeRooms) {
              id
              name
              type
              color
              heaters
              hasTemperatureSchedule
              currentTemperatureDegrees
              targetTemperatureDegrees
              humidity
              sensors
              devices {
                id
                code
                type
                name
                mac
                __typename
              }
              ...Status
              __typename
            }
            __typename
          }
        }
        fragment CentralisedDevicesCompact on PropertyType {
          devices(excludeDecentralised: true) {
            id
            code
            type
            name
            mac
            __typename
          }
          externalDevices {
            id
            name
            __typename
          }
          __typename
        }
        fragment Status on RoomType {
          status {
            disconnected
            heaterDisconnected
            heatingOperating
            sensorBatteryLow
            sensorDisconnected
            temporaryAdjustment
            __typename
          }
          __typename
        }
        `;
        const variables = {
            "id": userId
        };
        const requestHeaders = {
            "Authorization": 'token ' + token,
        };
        try {
            const data = await request(`${serverUrl}/api/v3/graphql/`, query, variables, requestHeaders);
            resolve(data);
        } catch (error: unknown) {
            console.error(error);
            resolve(null);
        }
    });
};