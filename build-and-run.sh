git pull
docker stop chat-ui
docker rm chat-ui
docker build -t chat-ui .
docker run -d -p 18087:3000 --restart always --name chat-ui chat-ui