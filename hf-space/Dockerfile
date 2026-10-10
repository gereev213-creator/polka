FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# llama-cpp-python ставим готовым колесом под процессор: сборка из исходников
# занимает десять минут, колесо — секунды.
RUN pip install --no-cache-dir fastapi uvicorn \
    && pip install --no-cache-dir llama-cpp-python \
       --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

# Модель качаем на СБОРКЕ, а не при запуске: тогда Space стартует мгновенно.
# 1.5B — быстрая (ответ ~10 секунд на двух ядрах). Для лучшего качества
# замените на Qwen2.5-3B: имя файла смотрите во вкладке Files репозитория.
ARG MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
RUN mkdir -p /app && curl -L -o /app/model.gguf "$MODEL_URL"

WORKDIR /app
COPY app.py .

# Hugging Face Spaces слушает именно этот порт
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
