# KCClient Generation

The `src/kcclient` directory is auto-generated from the OpenAPI specification in `kernelbridge.json`.

To regenerate:
1. Update `kernelbridge.json` with any API changes
2. Run `cd src/kcclient && rm -rf model api *.ts .openapi* && npx @openapitools/openapi-generator-cli generate -i ../../kernelbridge.json -g typescript-node`
