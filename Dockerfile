FROM quay.io/ukhomeofficedigital/nodejs-base:v8

RUN yum install -y unoconv

WORKDIR /app
COPY . /app
RUN npm --loglevel warn install --no-optional

USER 999

EXPOSE 8080

CMD /app/run.sh
