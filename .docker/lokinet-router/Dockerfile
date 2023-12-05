FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt update
RUN apt install -y curl lsb-release gettext-base awscli jq

RUN curl -so /etc/apt/trusted.gpg.d/oxen.gpg https://deb.oxen.io/pub.gpg
RUN echo "deb https://deb.oxen.io $(lsb_release -sc) main" | tee /etc/apt/sources.list.d/oxen.list
RUN apt update
RUN apt install -y lokinet-router

RUN lokinet-bootstrap

COPY lokinet-router.ini /etc/loki/lokinet-router.ini
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 1090

CMD ["lokinet", "-r", "/opt/lokinet-router.ini"]