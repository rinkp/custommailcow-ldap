# FROM python:3-alpine3.14

# RUN apk --no-cache add build-base openldap-dev python2-dev python3-dev
# RUN pip3 install --upgrade pip
# RUN pip3 install python-ldap sqlalchemy requests

COPY templates ./templates
# Wat hiermee?
# COPY api.py filedb.py syncer.py ./

VOLUME [ "/db" ]
VOLUME [ "/conf/dovecot" ]
VOLUME [ "/conf/sogo" ]

# ENTRYPOINT [ "python3", "syncer.py" ]

# We build our container using node:13-alpine
FROM node:13-alpine AS builder
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
RUN npm run build


# Create production container.
FROM node:13-alpine

# Set correct dir.
WORKDIR /usr/src/custommailcow-ldap

# Copy over the package and package-lock
COPY package*.json .

# Install production dependencies
RUN npm install --only=production

# Copy over the user data
COPY data /usr/src/custommailcow-ldap/data

# Copy over the source files from the builder
COPY --from=builder /usr/src/custommailcow-ldap/dist ./src

# Set correct priv.
RUN chown -R node:node .
USER node

CMD ["node", "src/index.js"]
