import {gql, request} from "graphql-request";

module.exports = function(token: string, userId: number, serverUrl: string, roomId: number, temp: number): Promise<any> {
    return new Promise(async resolve => {
        const query = gql`
          mutation SET_PROPERTY_ROOM_ADJUST_TEMPERATURE(
          $propertyId: Int!
          $roomId: Int!
          $temperature: Float!
        ) {
          setRoomAdjustTemperature(
            input: {
              propertyId: $propertyId
              roomId: $roomId
              temperature: $temperature
            }
          ) {
            id
            adjustTemperature {
              active
              endDateTime
              temperature
              __typename
            }
            __typename
          }
        }
        `;
        const variables = {
            "propertyId": userId,
            "roomId": roomId,
            "temperature": temp
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