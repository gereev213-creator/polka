"""Свой ИИ для Полки: OpenAI-совместимый сервер.

Смысл в совместимости: бот уже умеет говорить с OpenAI-подобными сервисами.
Значит переезд на свою модель — это смена трёх переменных, а не правка кода.
"""
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from llama_cpp import Llama

MODEL_PATH = os.environ.get("MODEL_PATH", "/app/model.gguf")
N_CTX = int(os.environ.get("N_CTX", "4096"))
N_THREADS = int(os.environ.get("N_THREADS", "2"))

app = FastAPI()
llm = None


@app.on_event("startup")
def load_model():
    """Загружаем модель при старте. После перезапуска Space это ~1 минута."""
    global llm
    llm = Llama(model_path=MODEL_PATH, n_ctx=N_CTX, n_threads=N_THREADS, verbose=False)


@app.get("/health")
def health():
    return {"ok": llm is not None}


@app.post("/v1/chat/completions")
async def chat_completions(req: Request):
    body = await req.json()
    messages = body.get("messages") or []
    max_tokens = int(body.get("max_tokens") or 150)
    temperature = float(body.get("temperature") or 0.2)

    out = llm.create_chat_completion(
        messages=messages, max_tokens=max_tokens, temperature=temperature)

    # Приводим к формату OpenAI: бот ждёт именно такую структуру.
    return JSONResponse({
        "id": "polka-local",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model") or "polka-local",
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": out["choices"][0]["message"]["content"],
            },
            "finish_reason": "stop",
        }],
        "usage": out.get("usage", {}),
    })
