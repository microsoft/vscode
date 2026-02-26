#!/usr/bin/env bash
set -e
TS=$(date +%F-%H%M)
OUT="/backups/backup-$TS"
mkdir -p "$OUT"
mongodump --uri "$MONGO_URI" --out "$OUT"
tar -czf "$OUT.tar.gz" -C /backups "backup-$TS"
openssl enc -aes-256-cbc -salt -in "$OUT.tar.gz" -out "$OUT.tar.gz.enc" -k "$BACKUP_KEY"
# آپلود به فضای S3 سازگار
aws s3 cp "$OUT.tar.gz.enc" "${S3_BUCKET}/"
ls -1t /backups/*.enc | tail -n +31 | xargs -r rm -f
