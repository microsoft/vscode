curl -X POST 'https://api.example.com/v1/upload' \
  -H 'Authorization: Basic dXNlcjpwYXNz' \
  -H 'Content-Type: application/json' \
  -d '{
    "filename": "report.pdf",
    "tags": ["financial", "2023"]
  }' \
  --connect-timeout 5 \
  --retry 3
