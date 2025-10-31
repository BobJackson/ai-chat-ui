git pull
docker stop chat-ui
docker rm chat-ui
docker build -t chat-ui .
docker run -d -p 10087:80 --restart always --name chat-ui --network www_wordpress-network chat-ui