ARG BUILD_FROM=node:22-alpine
FROM ${BUILD_FROM} AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${BUILD_FROM}
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache tzdata
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/public ./public
COPY run.sh /run.sh
RUN chmod a+x /run.sh
EXPOSE 3000
CMD ["/run.sh"]
