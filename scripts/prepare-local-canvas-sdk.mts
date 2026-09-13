/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build, type BuildOptions } from '../build/node_modules/esbuild/lib/main.js';

async function run(command: string, args: string[], cwd: string, env = process.env): Promise<void> {
	const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
	await new Promise<void>((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
	});
}

const { values } = parseArgs({
	options: {
		'sdk-entry': { type: 'string' },
		'runtime-cli': { type: 'string' },
		root: { type: 'string', default: '.c0' },
		workspace: { type: 'string' },
		'source-user-data-dir': { type: 'string' },
		'cdp-port': { type: 'string', default: '0' },
		'agent-host-port': { type: 'string' },
		launch: { type: 'boolean', default: false },
		help: { type: 'boolean', default: false },
	},
});

if (values.help) {
	console.log('Usage: node scripts/prepare-local-canvas-sdk.mts --sdk-entry file:///.../dist/index.js --runtime-cli /.../dist-cli/index.js --workspace /... [--root .c0] [--source-user-data-dir /.../closed-profile] [--cdp-port port] [--agent-host-port port] [--launch]');
} else {
	if (process.platform !== 'darwin' || process.arch !== 'arm64') {
		throw new Error('The normal-workspace local canvas development preview is qualified only on macOS arm64. Windows, Linux and macOS x64 are not yet qualified; ordinary VS Code and the separate PoC are unchanged.');
	}
	const repository = fileURLToPath(new URL('../', import.meta.url));
	if (!values['sdk-entry'] || !values['runtime-cli'] || !values.workspace) {
		throw new Error('Explicit development SDK, runtime CLI and workspace paths are required.');
	}
	const sdkUrl = new URL(values['sdk-entry']);
	if (sdkUrl.protocol !== 'file:' || sdkUrl.host || sdkUrl.search || sdkUrl.hash || !isAbsolute(values['runtime-cli'])) {
		throw new Error('The SDK must be a local file URL and the runtime CLI must be an absolute file path.');
	}
	const sdkEntry = sdkUrl.href;
	const runtimeCli = await realpath(values['runtime-cli']);
	const workspace = await realpath(values.workspace);
	const root = resolve(repository, values.root);
	const rootRelative = relative(repository, root);
	if (!rootRelative || rootRelative.startsWith('..') || isAbsolute(rootRelative)) {
		throw new Error('The isolated development root must be inside this VS Code worktree.');
	}
	const socketLimit = process.platform === 'darwin' ? 103 : process.platform === 'linux' ? 107 : undefined;
	if (socketLimit && [join(root, 'u', '1.99-main.sock'), join(root, 'vscode-ipc-00000000.sock')].some(path => Buffer.byteLength(path) >= socketLimit)) {
		throw new Error('Choose a shorter worktree-local root, such as .c0, so native IPC sockets fit the platform limit.');
	}
	for (const file of [fileURLToPath(sdkUrl), fileURLToPath(new URL('./index.d.ts', sdkUrl)), runtimeCli]) {
		if (!(await stat(file)).isFile()) {
			throw new Error(`Not a built SDK/runtime file: ${file}`);
		}
	}
	if (!(await stat(workspace)).isDirectory()) {
		throw new Error('The workspace must be an existing directory.');
	}
	for (const directory of ['h/.config', 'c', 'u/User/globalStorage', 'e', 's', 'p']) {
		await mkdir(join(root, directory), { recursive: true, mode: 0o700 });
	}
	await writeFile(join(root, '.gitignore'), '*\n');
	if (values['source-user-data-dir']) {
		try {
			if ((await stat(join(values['source-user-data-dir'], 'User/globalStorage/state.vscdb-wal'))).size > 0) {
				throw new Error('Close and checkpoint the source profile before copying authentication storage.');
			}
		} catch (error) {
			if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
				throw error;
			}
		}
		for (const name of ['Local State', 'machineid', 'Network', 'User/globalStorage/state.vscdb']) {
			const source = join(values['source-user-data-dir'], name);
			try {
				await cp(source, join(root, 'u', name), { recursive: true, force: false, errorOnExist: true });
			} catch (error) {
				if (!(error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ERR_FS_CP_EEXIST'))) {
					throw error;
				}
			}
		}
	}
	const base: { compilerOptions: { paths: Record<string, string[]> } } = JSON.parse(await readFile(join(repository, 'src/tsconfig.base.json'), 'utf8'));
	const paths = Object.fromEntries(Object.entries(base.compilerOptions.paths).map(([name, entries]) => [name, entries.map(entry => resolve(repository, 'src', entry))]));
	const project = join(root, 'tsconfig.bridge.json');
	await writeFile(project, JSON.stringify({
		extends: join(repository, 'src/tsconfig.json'),
		compilerOptions: {
			noEmit: true, skipLibCheck: true, rootDir: repository, allowImportingTsExtensions: true,
			paths: { ...paths, 'vscode-canvas-development-sdk': [fileURLToPath(new URL('./index.d.ts', sdkUrl))] },
		},
		include: [join(repository, 'src/*.ts'), join(repository, 'src/**/*.d.ts'), join(repository, 'scripts/local-canvas-sdk-bridge.mts'), join(repository, 'scripts/local-canvas-sdk-bridge.test.mts')],
		exclude: [],
	}, null, '\t') + '\n');
	await run(process.execPath, [join(repository, 'node_modules/.bin/tsc'), '--project', project, '--pretty', 'false'], repository);
	const bridgeFile = join(root, 'canvas-sdk-bridge.mjs');
	const runtimeEnvironment = {
		HOME: join(root, 'h'), USERPROFILE: join(root, 'h'),
		COPILOT_DISABLE_KEYTAR: '1',
	};
	const bridgeBuild: BuildOptions = {
		entryPoints: [join(repository, 'scripts/local-canvas-sdk-bridge.mts')],
		outfile: bridgeFile, platform: 'node', format: 'esm', target: 'node22', bundle: true, sourcemap: true,
		define: {
			CANVAS_SDK_ENTRY: JSON.stringify(sdkEntry),
			CANVAS_RUNTIME_ENVIRONMENT: JSON.stringify(runtimeEnvironment),
		},
		plugins: [{
			name: 'explicit-canvas-sdk',
			setup: builder => builder.onResolve({ filter: /^vscode-canvas-development-sdk$/ }, () => ({ path: sdkEntry, external: true })),
		}],
	};
	await build(bridgeBuild);
	const eventTestsFile = join(root, 'canvas-sdk-bridge.test.mjs');
	await build({
		...bridgeBuild,
		entryPoints: [join(repository, 'scripts/local-canvas-sdk-bridge.test.mts')],
		outfile: eventTestsFile,
		packages: 'external',
	});
	await run(process.execPath, [join(repository, 'node_modules/mocha/bin/mocha.js'), '--ui', 'tdd', '--timeout', '5000', eventTestsFile], repository, {
		...process.env, TMPDIR: root, TMP: root, TEMP: root,
	});
	await writeFile(join(root, 'u/User/settings.json'), JSON.stringify({
		'chat.agentHost.localCanvases.enabled': true,
		'chat.sessionSync.enabled': false,
		'chat.remoteAgentHostsEnabled': false,
		'chat.agentHost.githubMcpServer.enabled': false,
		'chat.automations.enabled': false,
		'github.copilot.chat.cloudAgent.enabled': false,
		'chat.agentHost.claudeAgent.enabled': false,
		'chat.agentHost.codexAgent.enabled': false,
		'telemetry.telemetryLevel': 'off',
		'window.restoreWindows': 'none',
		'files.simpleDialog.enable': true,
	}, null, '\t') + '\n');
	const environment = {
		VSCODE_LOCAL_CANVAS_SDK_ENTRY: sdkEntry,
		VSCODE_LOCAL_CANVAS_SDK_BRIDGE: pathToFileURL(bridgeFile).href,
		VSCODE_LOCAL_CANVAS_RUNTIME_CLI: runtimeCli,
		COPILOT_HOME: join(root, 'c'),
		XDG_CONFIG_HOME: join(root, 'h/.config'),
		XDG_DATA_HOME: join(root, 'h/.local/share'),
		XDG_CACHE_HOME: join(root, 'h/.cache'),
		GH_CONFIG_DIR: join(root, 'h/.config/gh'),
		TMPDIR: root, TMP: root, TEMP: root,
		VSCODE_SKIP_PRELAUNCH: '1',
	};
	const debugArgs: string[] = [];
	for (const [key, flag] of [['cdp-port', 'remote-debugging-port'], ['agent-host-port', 'inspect-agenthost']] as const) {
		const value = values[key];
		if (value !== undefined) {
			const port = Number(value);
			if (!Number.isSafeInteger(port) || port < (key === 'cdp-port' ? 0 : 1) || port > 65535) {
				throw new Error(`${key} must be a valid integer port (only CDP accepts 0 for automatic allocation).`);
			}
			debugArgs.push(`--${flag}=${port}`);
		}
	}
	const args = [
		join(repository, 'scripts/code.sh'), '--agents', '--new-window',
		`--user-data-dir=${join(root, 'u')}`, `--extensions-dir=${join(root, 'e')}`,
		`--shared-data-dir=${join(root, 's')}`, `--agent-plugins-dir=${join(root, 'p')}`,
		...debugArgs,
		workspace,
	];
	const manifest = { sdkEntry, bridgeEntry: environment.VSCODE_LOCAL_CANVAS_SDK_BRIDGE, runtimeCli, root, workspace, cdpEndpointFile: join(root, 'u', 'DevToolsActivePort'), environment, runtimeEnvironment, command: 'bash', args };
	await writeFile(join(root, 'canvas-sdk-launch.json'), JSON.stringify(manifest, null, '\t') + '\n');
	console.log(JSON.stringify(manifest));
	if (values.launch) {
		if (process.env.VSCODE_LOCAL_CANVAS_POC_ROOT) {
			throw new Error('Unset VSCODE_LOCAL_CANVAS_POC_ROOT before launching the normal-workspace preview.');
		}
		await run('bash', args, repository, { ...process.env, ...environment });
	}
}
