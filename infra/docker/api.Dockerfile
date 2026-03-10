FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace=apps/api

COPY apps/api ./apps/api

EXPOSE 4000

CMD ["npm", "run", "dev", "--workspace=apps/api"]
