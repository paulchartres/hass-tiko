import {gql, request} from "graphql-request";

module.exports = function(token: string, userId: number, serverUrl: string, mode: string): Promise<any> {
    return new Promise(async resolve => {
        const query = gql`
          mutation SET_PROPERTY_MODE($propertyId: Int!, $mode: String!) {
          setPropertyMode(input: { propertyId: $propertyId, mode: $mode }) {
            id
            mode
            __typename
          }
        }
        `;
        const variables = {
            "propertyId": userId,
            "mode": mode
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