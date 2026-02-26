#!/usr/bin/env bash
set -e
docker compose pull || true
docker compose build
docker compose up -d
