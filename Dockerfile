ARG WORKSPACE="consumer"

FROM node:23-alpine AS build

WORKDIR /app

COPY . .

RUN yarn install --frozen-lockfile

ARG WORKSPACE
RUN yarn workspace ${WORKSPACE} build

FROM node:23-alpine AS production

WORKDIR /app

ARG WORKSPACE
ENV NODE_ENV="production"

COPY --from=build /app/packages/${WORKSPACE}/dist/. ./

CMD ["node", "index.js"]
