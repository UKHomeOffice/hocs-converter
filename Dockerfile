FROM quay.io/ukhomeofficedigital/nodejs-base:v8

RUN yum install -y unoconv make gcc*

WORKDIR /app
COPY . /app
RUN npm --loglevel warn install -g node-gyp
RUN npm --loglevel warn install --no-optional

USER 999

EXPOSE 8080

CMD /app/scripts/run.sh
