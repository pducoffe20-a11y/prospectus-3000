FROM python:3.14.6-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/browser-cache/playwright \
    XDG_CACHE_HOME=/opt/browser-cache

WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock \
    && crawl4ai-setup \
    && python -m scrapling install
COPY app ./app

RUN useradd --create-home --uid 10001 worker \
    && chown -R worker:worker /app /opt/browser-cache
USER worker
EXPOSE 8787
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787", "--no-access-log"]
