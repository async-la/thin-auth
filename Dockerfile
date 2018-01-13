FROM mhart/alpine-node:8
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY / /usr/src/app
EXPOSE 3005
CMD [ "npm", "start" ]
