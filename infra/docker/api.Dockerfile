FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/sdk/package.json ./packages/sdk/

RUN npm install --workspace=apps/api --workspace=packages/sdk

COPY apps/api ./apps/api
COPY packages/sdk ./packages/sdk

EXPOSE 4000

CMD ["npm", "run", "dev", "--workspace=apps/api"]
