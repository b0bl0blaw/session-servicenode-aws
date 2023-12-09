FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt update
RUN apt install -y curl lsb-release awscli jq

RUN curl -so /etc/apt/trusted.gpg.d/oxen.gpg https://deb.oxen.io/pub.gpg
RUN echo "deb https://deb.oxen.io $(lsb_release -sc) main" | tee /etc/apt/sources.list.d/oxen.list
RUN apt update
RUN apt install -y oxend oxen-wallet-cli

COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 22022 22025

CMD ["oxend", "--bootstrap-daemon-address", "auto" ,"--non-interactive", "--data-dir", "/efs/session-node", "--service-node"]