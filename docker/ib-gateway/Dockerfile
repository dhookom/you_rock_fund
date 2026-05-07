ARG IB_GATEWAY_TAG=latest
FROM ghcr.io/gnzsnz/ib-gateway:${IB_GATEWAY_TAG}

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/yrvi-gw-entrypoint.sh
RUN chmod +x /usr/local/bin/yrvi-gw-entrypoint.sh

USER 1000:1000
