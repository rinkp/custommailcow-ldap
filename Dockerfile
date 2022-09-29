# We build our container using node:16-alpine
FROM node:16-alpine AS builder
ENV NODE_ENV=development

# Change dir to install dir.
WORKDIR /usr/src/custommailcow-ldap

# Copy over the package and package-lock
COPY package*.json .

# Install dependencies
RUN npm ci

# Copy over the tsconfig
COPY tsconfig.json .

# Copy over the source files
COPY src /usr/src/custommailcow-ldap/src

# Transpile the typescript files
RUN npx tsc


# Create production container.
FROM node:16-alpine AS prod

# Set correct dir.
WORKDIR /app

# Copy over the package and package-lock
COPY package*.json .

# Install production dependencies
RUN npm install --only=production

# Copy over the template data
COPY templates /app/templates

# Copy over the source files from the builder
COPY --from=builder /usr/src/custommailcow-ldap/dist /app/src

# Set correct priv.
RUN chown -R node:node .
USER node

VOLUME [ "/app/db" ]
VOLUME [ "/app/conf/dovecot" ]
VOLUME [ "/app/conf/sogo" ]

CMD ["node", "/app/src/index.js"]
