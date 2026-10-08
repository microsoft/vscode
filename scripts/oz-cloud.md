# OZ cloud development smoke check

Use this after the OZ environment snapshot is up. It checks the toolchain and
built output already produced by the environment install, then runs one focused
unit-test file. It does not install packages, rebuild the client, or open a
public port.

## Check

From the repository root:

```sh
./scripts/oz-cloud-smoke.sh
```

The script checks:

- `node -v` matches `.nvmrc` (currently the `v` prefix plus that file).
- `node_modules/.package-lock.json` and `node_modules/mocha/package.json` exist, and the remote Node binary printed by `node build/lib/node.ts` is executable.
- Desktop output: `.build/electron/code-oss` (`product.json` `applicationName`) is executable, `.build/electron/version` matches the `.npmrc` `target`, and `out/main.js`, `out/vs/code/electron-main/main.js`, and `out/vs/workbench/workbench.desktop.main.js` exist.
- Web output: `out/server-main.js`, `out/vs/code/browser/workbench/workbench.js`, and `out/vs/code/browser/workbench/workbench-dev.html` exist.
- Unit tests, via the repository runner:

```sh
./scripts/test.sh --run src/vs/server/test/node/serverConnectionToken.test.ts
```

That file is the connection-token suite (`parseServerConnectionToken`, `requestHasValidConnectionToken`, and token redaction). `scripts/test.sh` launches it inside Electron. The smoke check rejects the run when that command exits 0 but Mocha prints no positive passing count, or when the only passing test is the runner harness (`assertCleanState`) and the selected file contributed none.

Add `--web` to also start the built server on loopback and request it:

```sh
./scripts/oz-cloud-smoke.sh --web
```

The probe writes a token file (mode `0600`), starts the server below, and then stops only that process tree. A request without the token must return `403` and `Forbidden.` A request with `?tkn=` must return `302` and a `vscode-tkn` cookie. The following cookie request for `/` must return `200` and the workbench page (`vscode-workbench-web-configuration`).

## Launch the built desktop

`DISPLAY` must point at the environment desktop (OZ uses `:1`). From the repository root:

```sh
./scripts/code.sh
```

`scripts/code.sh` runs `node build/lib/preLaunch.ts` unless `VSCODE_SKIP_PRELAUNCH` is set, then executes `.build/electron/code-oss`. Close that window when finished. The smoke script does not start the desktop.

## Launch the built web workbench

This is the compiled server (`out/server-main.js`), started by `scripts/code-server.sh`. Bind loopback and keep the connection token on. Do not pass `--without-connection-token` or `--host 0.0.0.0`.

```sh
token_file=$(mktemp)
chmod 600 "$token_file"
node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(24).toString('hex'), { mode: 0o600 })" "$token_file"

./scripts/code-server.sh \
  --host 127.0.0.1 \
  --connection-token-file "$token_file"
```

`--host` defaults to `localhost` in `src/server-main.ts`. `127.0.0.1` is explicit loopback. With no `--port`, `scripts/code-server.js` sets `VSCODE_SERVER_PORT=9888`. A non-zero `--port`, or a range such as `39200-39220`, is accepted; the server prints `Server bound to 127.0.0.1:<port> (IPv4)` and `Web UI available at http://localhost:<port>?tkn=...`. Open that URL only from this machine. Stop the process with Ctrl+C, then `rm -f "$token_file"`.

`product.json` has an empty `serverLicense`, so this development server starts without a license prompt. The commands above leave that default in place and keep the connection token required.
