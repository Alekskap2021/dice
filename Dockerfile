FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
