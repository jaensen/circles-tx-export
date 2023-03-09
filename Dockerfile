FROM node:latest

WORKDIR /app
COPY . /app

RUN npm install
RUN npx tsc

CMD ["node", "dist/main.js"]
