FROM alpine:3.20

WORKDIR /app
COPY . /app

CMD ["sh", "-lc", "echo 'VS Code Docker build succeeded'"]
