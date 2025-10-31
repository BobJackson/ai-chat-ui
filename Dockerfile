FROM dockerpull.pw/node:22 AS build
# 容器内的目录，通常我们会使用 app 目录
WORKDIR /app
COPY . .
RUN npm install --global corepack@latest && corepack enable pnpm
ENV CI=true
RUN pnpm install

FROM nginx
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=build /app/dist .