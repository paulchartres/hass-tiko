import {gql, request} from "graphql-request";

module.exports = function(serverUrl: string, email: string, password: string): Promise<any> {
    return new Promise(async resolve => {
        const query = gql`
          mutation LogIn(
          $email: String!
          $password: String!
          $langCode: String
          $retainSession: Boolean
        ) {
          logIn(
            input: {
              email: $email
              password: $password
              langCode: $langCode
              retainSession: $retainSession
            }
          ) {
            settings {
              client {
                name
                __typename
              }
              support {
                serviceActive
                phone
                email
                __typename
              }
              __typename
            }
            user {
              id
              clientCustomerId
              agreements
              properties {
                id
                allInstalled
                __typename
              }
              inbox(modes: ["app"]) {
                actions {
                  label
                  type
                  value
                  __typename
                }
                id
                lockUser
                maxNumberOfSkip
                messageBody
                messageHeader
                __typename
              }
              __typename
            }
            token
            firstLogin
            __typename
          }
        }
        `;
        const variables = {
            "email": email,
            "password": password,
            "langCode": "fr",
            "retainSession": true
        }
        try {
            const data = await request(`${serverUrl}/api/v3/graphql/`, query, variables);
            resolve(data);
        } catch (error: unknown) {
            console.error(error);
            resolve(null);
        }
    });
};