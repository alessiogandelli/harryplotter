# Self-hosted Harry Plotter: editor + AI proxy in one small container.
#   docker build -t harryplotter .
#   docker run -p 8765:8765 -e OPENROUTER_API_KEY=... harryplotter
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY python ./python
RUN pip install --no-cache-dir . && useradd --create-home harry
USER harry
EXPOSE 8765
ENV HARRYPLOTTER_DAILY_LIMIT=0
CMD ["harryplotter", "--host", "0.0.0.0", "--no-browser"]
