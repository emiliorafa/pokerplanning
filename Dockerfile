FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
# No Railway, a porta vem da variável PORT definida pela plataforma.
# Para manter as salas entre deploys, crie um Volume no Railway montado em /data.
ENV PORT=8000 \
    DATA_DIR=/data \
    PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server.py"]
