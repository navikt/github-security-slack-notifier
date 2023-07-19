FROM node:18-alpine

COPY package.json ./
COPY package-lock.json ./

RUN npm ci
COPY src/ src/

EXPOSE 3000
ENTRYPOINT ["npm", "start"]
