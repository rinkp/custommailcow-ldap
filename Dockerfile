# FROM python:3-alpine3.14

# RUN apk --no-cache add build-base openldap-dev python2-dev python3-dev
# RUN pip3 install --upgrade pip
# RUN pip3 install python-ldap sqlalchemy requests

# ENTRYPOINT [ "python3", "syncer.py" ]

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
FROM node:16-alpine

VOLUME [ "/db" ]
VOLUME [ "/conf/dovecot" ]
VOLUME [ "/conf/sogo" ]

# Set correct dir.
WORKDIR /usr/src/custommailcow-ldap

# Copy over the template data
COPY templates /usr/src/custommailcow-ldap/templates
COPY conf /usr/src/custommailcow-ldap/conf
COPY db /usr/src/custommailcow-ldap/db

# Copy over the package and package-lock
COPY package*.json .

# Install production dependencies
RUN npm install --only=production

# Copy over the source files from the builder
COPY --from=builder /usr/src/custommailcow-ldap/dist ./src

# Set correct priv.
RUN chown -R node:node .
USER node

CMD ["node", "src/index.js"]