# PM Dashboard — Next.js + better-sqlite3 (native) + Python ETL/seed
#
# Debian "bookworm" base: has the build toolchain better-sqlite3 needs to
# compile, plus Python 3 so the seed/ETL scripts run in the same image.
FROM node:20-bookworm-slim

# Build deps for native node modules (better-sqlite3) + Python for the ETL/seed.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      build-essential \
      ca-certificates \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install node deps first (better layer caching). This compiles better-sqlite3
# for the Linux container, independent of the Windows host.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the app.
COPY . .

# Generate sample SQLite data, then build the production bundle.
# (Build needs data/dashboard.db to exist because pages read it at build time.)
RUN python etl/seed.py && npm run build

EXPOSE 3009

# Regenerate seed data on each start (in case the volume is empty), then serve.
CMD ["sh", "-c", "python etl/seed.py && npm start"]
