/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { createVSIX } from '@vscode/vsce';
import { ChildProcess, spawn } from 'child_process';
import { AddressInfo, createServer, Socket } from 'net';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { SimpleRPC } from '../src/extension/onboardDebug/node/copilotDebugWorker/rpc';
import { deserializeWorkbenchState } from '../src/platform/test/node/promptContextModel';
import { createCancelablePromise, DeferredPromise, disposableTimeout, raceCancellablePromises, retry, timeout } from '../src/util/vs/base/common/async';
import { Emitter, Event } from '../src/util/vs/base/common/event';
import { Iterable } from '../src/util/vs/base/common/iterator';
import { Disposable, DisposableStore, toDisposable } from '../src/util/vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from '../src/util/vs/base/common/resources';
import { URI } from '../src/util/vs/base/common/uri';
import { generateUuid } from '../src/util/vs/base/common/uuid';
import { ProxiedSimulationEndpointHealth } from './base/simulationEndpointHealth';
import { ProxiedSimulationOutcome } from './base/simulationOutcome';
import { SimulationTest } from './base/stest';
import { ProxiedSONOutputPrinter } from './jsonOutputPrinter';
import { logger } from './simulationLogger';
import { ITestRunResult, SimulationTestContext } from './testExecutor';
import { findFreePortFaster } from '../src/util/vs/base/node/ports';
import { waitForListenerOnPort } from '../src/util/node/ports';

const MAX_CONCURRENT_SESSIONS = 10;
const HOST = '127.0.0.1';
const CONNECT_TIMEOUT = 60_000;

export interface IInitParams {
	folder: string;
}

export interface IInitResult {
	argv: readonly string[];
}

export interface IRunTestParams {
	testName: string;
	outcomeDirectory: string;
	runNumber: number;
}

export interface IRunTestResult {
	result: ITestRunResult;
}

export class TestExecutionInExtension {
	public static async create(ctx: SimulationTestContext) {
		const store = new DisposableStore();
		const { chromium } = await import('playwright');

		//@ts-ignore
		const testConfig: { default: { version: string } } = await import('../.vscode-test.mjs');
		const [serverBinary, browser] = await Promise.all([
			downloadAndUnzipVSCode(testConfig.default.version, getServerPlatform()),
			chromium.launch({ headless: ctx.opts.headless }),
		]);
		const browserContext = await browser.newContext();
		const childPortNumber = await findFreePortFaster(40_000, 1_000, 10_000);
		const connectionToken = generateUuid();

		const controlServer = createServer(s => inst._onConnection(s));
		await new Promise((resolve, reject) => {
			controlServer.on('listening', resolve);
			controlServer.on('error', reject);
			controlServer.listen(0, HOST);
		});
		store.add(toDisposable(() => controlServer.close()));

		const vsixFile = await TestExecutionInExtension._packExtension();
		const child = spawn(serverBinary, [
			'--server-data-dir', path.resolve(__dirname, '../.vscode-test/server-data'),
			'--extensions-dir', path.resolve(__dirname, '../.vscode-test/server-extensions'),
			...ctx.opts.installExtensions.flatMap(ext => ['--install-extension', ext]),
			'--install-extension', vsixFile,
			'--force',
			'--accept-server-license-terms',
			'--connection-token', connectionToken,
			'--port', String(childPortNumber),
			'--host', HOST,
			'--disable-workspace-trust',
			'--start-server'
		], {
			shell: process.platform === 'win32',
			env: {
				...process.env,
				VSCODE_SIMULATION_EXTENSION_ENTRY: __filename,
				VSCODE_SIMULATION_CONTROL_PORT: String((controlServer.address() as AddressInfo).port),
			}
		});
		const output: Buffer[] = [];
		await new Promise((resolve, reject) => {
			const log = logger.tag('VSCodeServer');
			const push = (data: Buffer) => {
				log.trace(data.toString().trim());
				output.push(data);
			};
			child.stdout.on('data', push);
			child.stderr.on('data', push);
			child.on('error', reject);
			child.on('spawn', resolve);
		});
		store.add(toDisposable(() => child.kill()));

		await raceCancellablePromises([
			createCancelablePromise(tkn => waitForListenerOnPort(childPortNumber, HOST, tkn)),
			createCancelablePromise(tkn => new Promise<void>((resolve, reject) => {
				const listener = () => {
					reject(new Error(`Child process exited unexpectedly. Output: ${Buffer.concat(output).toString()}`));
				};
				child.on('exit', listener);
				const l = tkn.onCancellationRequested(() => {
					l.dispose();
					child.off('exit', listener);
					resolve();
				});
			})),
			createCancelablePromise(tkn => timeout(10_000, tkn).then(e => {
				throw new Error(`Timeout waiting for server to start. Output: ${Buffer.concat(output).toString()}`);
			})),
		]);

		const inst = new TestExecutionInExtension(ctx, output, browser, browserContext, child, childPortNumber, store, connectionToken);
		return inst;
	}

	private static async _packExtension() {
		const packageJsonPath = path.resolve(__dirname, '..', 'package.json');

		const extensionDir = path.resolve(__dirname, '..', 'test', 'simulationExtension');
		const existingVsix = (await fs.readdir(extensionDir)).map(e => path.join(extensionDir, e)).find(f => f.endsWith('.vsix'));
		if (existingVsix) {
			const vsixMtime = await fs.stat(existingVsix).then(s => s.mtimeMs);
			const packageJsonMtime = await fs.stat(packageJsonPath).then(s => s.mtimeMs);
			if (vsixMtime >= packageJsonMtime) {
				return existingVsix;
			}

			await fs.rm(existingVsix, { force: true });
		}

		logger.info('Packing extension for simulation test run...');
		const packageJsonContents = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

		await fs.writeFile(path.join(extensionDir, 'package.json'), JSON.stringify({
			name: packageJsonContents.name,
			publisher: packageJsonContents.publisher,
			engines: packageJsonContents.engines,
			displayName: 'Simulation Extension',
			description: 'An extension installed in the VS Code server for the simulation test runs',
			enabledApiProposals: packageJsonContents.enabledApiProposals,
			version: `0.0.${Date.now()}`,
			activationEvents: ['*'],
			main: './extension.js',
			contributes: {
				languageModelTools: packageJsonContents.contributes?.languageModelTools,
			},
		}));

		const vsixPath = path.join(extensionDir, 'extension.vsix');
		await createVSIX({
			cwd: extensionDir,
			dependencies: false,
			packagePath: vsixPath,

			allowStarActivation: true,
			allowMissingRepository: true,
			skipLicense: true,
			allowUnusedFilesPattern: true,
		});

		logger.info('Simulation extension packed successfully.');
		return vsixPath;
	}

	private _isDisposed = false;
	private readonly _pending = new Set<{ dir: string; workspace: Promise<ProxiedWorkspace> }>();
	private readonly _available = new Set<ProxiedWorkspaceWithConnection>();
	private readonly _onDidChangeWorkspaces = new Emitter<void>();

	constructor(
		private readonly _ctx: SimulationTestContext,
		output: Buffer[],
		private readonly _browser: Browser,
		private readonly _browserContext: BrowserContext,
		private readonly _child: ChildProcess,
		private readonly _serverPortNumber: number,
		private readonly _store: DisposableStore,
		private readonly _connectionToken: string,
	) {
		_store.add(this._onDidChangeWorkspaces);
		this._child.on('exit', (code, signal) => {
			if (this._isDisposed) {
				return;
			}
			if (code !== 0) {
				logger.error(`Child process exited with code ${code} and signal ${signal}. Output:`);
				logger.error(Buffer.concat(output).toString());
			}
		});
	}

	public async executeTest(
		ctx: SimulationTestContext,
		_parallelism: number,
		outcomeDirectory: string,
		test: SimulationTest,
		runNumber: number
	): Promise<ITestRunResult> {
		let workspace: ProxiedWorkspaceWithConnection | undefined;

		const explicitWorkspaceFolder = test.options.scenarioFolderPath && test.options.stateFile ? deserializeWorkbenchState(test.options.scenarioFolderPath, path.join(test.options.scenarioFolderPath, test.options.stateFile)).workspaceFolderPath : undefined;

		const beforeWorkspace = Date.now();
		try {
			workspace = await this._acquireWorkspace(ctx, explicitWorkspaceFolder);
			const afterWorkspace = Date.now();
			ProxiedSimulationOutcome.registerTo(ctx.simulationOutcome, workspace.connection);
			ProxiedSONOutputPrinter.registerTo(ctx.jsonOutputPrinter, workspace.connection);
			ProxiedSimulationEndpointHealth.registerTo(ctx.simulationEndpointHealth, workspace.connection);

			const res: IRunTestResult = await workspace.connection.callMethod('runTest', {
				testName: test.fullName,
				outcomeDirectory,
				runNumber,
			} satisfies IRunTestParams);

			// For running in an explicit folder, don't let other connections reuse it
			if (explicitWorkspaceFolder) {
				await workspace.dispose();
				this._available.delete(workspace);
			} else {
				await workspace.clean();
			}

			this._onDidChangeWorkspaces.fire(); // wake up any tests waiting for a workspace

			const afterTest = Date.now();
			logger.trace(`[TestExecutionInExtension] Workspace acquired in ${afterWorkspace - beforeWorkspace}ms, test run in ${afterTest - afterWorkspace}ms`);

			return res.result;
		} catch (e) {
			logger.error(`Error running test: ${e}`);
			if (workspace) {
				await this._disposeWorkspace(workspace);
			}
			throw e;
		}
	}

	private async _disposeWorkspace(workspace: ProxiedWorkspaceWithConnection) {
		await workspace.dispose().catch(() => { });
		this._available.delete(workspace);
		this._onDidChangeWorkspaces.fire();
	}

	private async _acquireWorkspace(ctx: SimulationTestContext, explicitWorkspaceFolder?: string) {
		// Get a workspace if one is available. If not and there are no pending
		// workspaces, make one. And then wait for a workspace to be available.
		while (true) {
			const available = Iterable.find(this._available, v => !v.busy && (!explicitWorkspaceFolder || v.dir === explicitWorkspaceFolder));
			if (available) {
				available.busy = true;
				this._onDidChangeWorkspaces.fire();
				return available;
			}

			if (explicitWorkspaceFolder || this._pending.size + this._available.size < MAX_CONCURRENT_SESSIONS) {
				const dir = explicitWorkspaceFolder || path.join(tmpdir(), 'vscode-simulation-extension-test', generateUuid());
				const workspace = ProxiedWorkspace.create(dir, this._browserContext, this._serverPortNumber, this._connectionToken);
				const pending = { dir, workspace };

				this._pending.add(pending);
				workspace.then(w => w.onDidTimeout(() => {
					logger.warn(`Pending workspace connection ${dir} timed out. Will retry...`);
					this._pending.delete(pending);
					this._onDidChangeWorkspaces.fire();
					w.dispose();
				}));
			}

			await Event.toPromise(this._onDidChangeWorkspaces.event);
		}
	}

	private _onConnection(socket: Socket) {
		const rpc = new SimpleRPC(socket);

		rpc.registerMethod('deviceCodeCallback', ({ url }) => {
			logger.warn(`⚠️ \x1b[31mAuth Required!\x1b[0m Please open the link: ${url}`);
		});

		rpc.registerMethod('init', async (params: IInitParams): Promise<IInitResult> => {
			const record = [...this._pending].find(w => extUriBiasedIgnorePathCase.isEqual(URI.file(w.dir), URI.file(params.folder)));
			if (!record) {
				socket.end();
				const err = new Error(`No workspace found for folder ${params.folder}`);
				logger.error(err);
				throw err;
			}

			const workspace = await record.workspace;
			this._pending.delete(record);
			this._available.add(workspace.onConnection(rpc));
			this._onDidChangeWorkspaces.fire();

			const argv = [...process.argv, '--in-extension-host', 'false'];
			if (!argv.some(a => a.startsWith('--output'))) {
				// Ensure output is stable otherwise it's regenerated
				argv.push('--output', this._ctx.outputPath);
			}

			return { argv };
		});
	}

	public async dispose() {
		this._isDisposed = true;

		await Promise.all([...this._pending].map(w => w.workspace.then(w => w.dispose())));
		await Promise.all([...this._available].map(w => w.dispose()));
		this._pending.clear();
		this._available.clear();

		await this._browserContext.close();
		await this._browser.close();

		this._store.dispose();
	}
}

type ProxiedWorkspaceWithConnection = ProxiedWorkspace & { connection: SimpleRPC };

class ProxiedWorkspace extends Disposable {
	public static async create(dir: string, context: BrowserContext, serverPort: number, connectionToken: string) {
		// swebench runs run on the 'real' working directory and expect to be modified
		// in-place. If it looks like this is happening, don't clear the directory
		// afte each run.

		let isReused = false;
		try {
			isReused = (await fs.readdir(dir)).length > 0;
		} catch {
			// ignore
		}
		await fs.mkdir(dir, { recursive: true });

		const url = new URL('http://127.0.0.1');
		url.port = String(serverPort);
		url.searchParams.set('tkn', connectionToken);
		url.searchParams.set('folder', URI.file(dir).path);

		const page = await context.newPage();
		await page.goto(url.toString());

		return new ProxiedWorkspace(page, dir, isReused);
	}

	private readonly _connection = new DeferredPromise<SimpleRPC>();
	public get connection() {
		return this._connection.value;
	}

	private readonly _onDidTimeout = this._register(new Emitter<void>());
	public get onDidTimeout(): Event<void> {
		return this._onDidTimeout.event;
	}

	private readonly _connectionTimeout = this._register(disposableTimeout(() => {
		this._onDidTimeout.fire();
	}, CONNECT_TIMEOUT));

	public busy = false;

	constructor(
		private readonly _page: Page,
		public readonly dir: string,
		private readonly _dirIsReused: boolean,
	) {
		super();
		const log = logger.tag('ProxiedWorkspace');
		_page.on('console', e => log.debug(`[ProxiedWorkspace] ${e.type().toUpperCase()}: ${e.text()}`));
	}

	public onConnection(rpc: SimpleRPC): ProxiedWorkspaceWithConnection {
		this._connection.complete(rpc);
		this._connectionTimeout.dispose();
		return this as ProxiedWorkspaceWithConnection;
	}

	public async clean() {
		if (!this._dirIsReused) {
			const entries = await fs.readdir(this.dir);
			for (const entry of entries) {
				await fs.rm(path.join(this.dir, entry), { recursive: true, force: true });
			}
		}
		this.busy = false;
	}

	public override async dispose() {
		super.dispose();

		await this._connection.value?.callMethod('close', {}).catch(() => { });
		this._connection.value?.dispose();
		await this._page.close();
		// retry because the folder will be locked until the EH gets shut down
		if (!this._dirIsReused) {
			await retry(() => fs.rm(this.dir, { recursive: true, force: true }).catch(() => { }), 400, 10);
		}
	}
}

function getServerPlatform() {
	switch (process.platform) {
		case 'darwin':
			return process.arch === 'arm64' ? 'server-darwin-arm64-web' : 'server-darwin-web';
		case 'linux':
			return process.arch === 'arm64' ? 'server-linux-arm64-web' : 'server-linux-x64-web';
		case 'win32':
			return process.arch === 'arm64' ? 'server-win32-arm64-web' : 'server-win32-x64-web';
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}
