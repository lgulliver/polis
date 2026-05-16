FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl jq
WORKDIR /app
# Fetch the actual JAR URL from GitHub releases API (handles any filename)
RUN ASSET_URL=$(curl -sf "https://api.github.com/repos/Pugmatt/BedrockConnect/releases/latest" \
        | jq -r '.assets[] | select(.name | endswith(".jar")) | .browser_download_url' \
        | head -1) && \
    echo "Downloading BedrockConnect from: $ASSET_URL" && \
    curl -L -o BedrockConnect.jar "$ASSET_URL"
COPY custom_servers.json .
EXPOSE 19132/udp
EXPOSE 53/udp
ENTRYPOINT ["java", "-jar", "BedrockConnect.jar", "-nodb"]
