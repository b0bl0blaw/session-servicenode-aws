FROM ubuntu:22.04

RUN apt update
RUN apt install -y curl lsb-release

RUN curl -so /etc/apt/trusted.gpg.d/oxen.gpg https://deb.oxen.io/pub.gpg
RUN echo "deb https://deb.oxen.io $(lsb_release -sc) main" | tee /etc/apt/sources.list.d/oxen.list
RUN apt update
RUN apt install -y oxen-storage-server

COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 22020 22021

CMD ["oxen-storage", "--oxend-rpc", "ipc:///efs/session-node/oxend.sock", "--data-dir", "/efs/storage-server"]