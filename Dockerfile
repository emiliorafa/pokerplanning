FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
ENV PORT=8000 \
    DATA_DIR=/data \
    PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8000
CMD ["python", "server.py"]
