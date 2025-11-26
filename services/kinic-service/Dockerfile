FROM python:3.11-slim

WORKDIR /app

# Install dfx for Kinic (optional - for IC deployment)
RUN apt-get update && apt-get install -y curl && \
    sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)" || true

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV PORT=3002

EXPOSE 3002

CMD ["python", "main.py"]
