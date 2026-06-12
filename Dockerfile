# ── Stage 1: Rust → WASM (SGP4 propagation engine) ───────────────────────────
FROM rust:1-slim AS wasm-builder
RUN cargo install wasm-pack --locked
WORKDIR /app
COPY wasm-src ./wasm-src
RUN rustup target add wasm32-unknown-unknown \
    && wasm-pack build wasm-src --target web --out-dir /app/wasm-out --no-pack --release

# ── Stage 2: Node → static bundle ─────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY --from=wasm-builder /app/wasm-out ./src/features/orbital-mechanics/wasm
RUN npm run build

# ── Stage 3: nginx (single runtime container) ─────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY --from=web-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
