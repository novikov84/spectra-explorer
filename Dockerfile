FROM node:18-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

# Copy built assets to the subdirectory to match the URL path
# This allows Nginx to serve it naturally at /apps/spectra/
COPY --from=builder /app/dist /usr/share/nginx/html/apps/spectra

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
