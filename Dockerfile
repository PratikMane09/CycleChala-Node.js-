# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# If you have a build step, uncomment the following line
# RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY --from=builder /app/package*.json ./

# If you have a build folder, adjust this line accordingly
COPY --from=builder /app/src ./src

# Install production dependencies only
RUN npm ci --production

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]