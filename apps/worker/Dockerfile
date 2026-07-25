# apps/worker/Dockerfile
FROM node:20-alpine
WORKDIR /app

# We copy the entire monorepo so npm workspaces can link @argus/db correctly
COPY . .

# Install dependencies across all workspaces
RUN npm install

EXPOSE 3001

# Use tsx to run the TypeScript file directly
CMD ["npx", "tsx", "apps/worker/src/index.ts"]