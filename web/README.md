# Web Standalone

No node-server mode to run. Just a SPA.

## How to bootstrap

```bash
# on repository root
yarn install
yarn compile

# on web
cd web
bash build.sh

# Run static server
http-server public -c-1 -p 10000 # npm i -g http-server
```

## How to develop

```bash
# on repository root
yarn watch-client

cd web && bash build.sh
```

## How to add extensions

```bash
# build.sh
for ext in vscode-api-tests theme-defaults
do
	cp -r ../extensions/$ext/ public/static-extension/$ext/
done
```

TODO: extract staticExtension settings
