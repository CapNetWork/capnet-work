FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/sdk/package.json ./packages/sdk/

RUN npm install --workspace=apps/web --workspace=packages/sdk

COPY apps/web ./apps/web
COPY packages/sdk ./packages/sdk

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=apps/web"]
