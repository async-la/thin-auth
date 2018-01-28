FROM mhart/alpine-node:8
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY / /usr/src/app
RUN apk add --no-cache autoconf automake gcc g++ libtool make python
RUN rm -rf node_modules
RUN npm install -g node-gyp
RUN npm install --production
EXPOSE 3005
CMD [ "npm", "start" ]
