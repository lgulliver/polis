FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache wget
WORKDIR /app
# Download the latest BedrockConnect JAR from GitHub releases
RUN wget -q -O BedrockConnect.jar \
    https://github.com/Pugmatt/BedrockConnect/releases/latest/download/BedrockConnect.jar
COPY custom_servers.json .
EXPOSE 19132/udp
EXPOSE 53/udp
ENTRYPOINT ["java", "-jar", "BedrockConnect.jar", "-nodb"]
