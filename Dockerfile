FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .
RUN npm run build
COPY src/html dist/html
RUN mkdir -p dist/config

ENV PROD=true

EXPOSE 3001
CMD [ "node", "dist/server.js" ]