FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 GAME_BIND=0.0.0.0 GAME_STATIC_DIR=/app/public GAME_DATA_DIR=/data
WORKDIR /app
RUN mkdir /data && chown 10001:10001 /data
COPY server.py /app/
COPY index.html player.png audio-bank.js game-assets.js game-audio.js tunnel-mission.js online.js /app/public/
COPY assets/ /app/public/assets/
USER 10001:10001
EXPOSE 8080
CMD ["python", "/app/server.py"]
