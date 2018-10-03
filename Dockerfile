FROM mhart/alpine-node:6
WORKDIR /opt/app
ADD . /opt/app
RUN npm install
CMD ["npm","test"]
