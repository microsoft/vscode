/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { AddressInfo, createServer } from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestOutputScanner } from './testOutputScanner';
import { TestCase, TestFile, TestSuite, itemData } from './testTree';

/**
 * From MDN
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
 */
const escapeRe = (s: string) => s.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');

const TEST_ELECTRON_SCRIPT_PATH = 'test/unit/electron/index.js';
const TEST_BROWSER_SCRIPT_PATH = 'test/unit/browser/index.js';

const ATTACH_CONFIG_NAME = 'Attach to VS Code';
const DEBUG_TYPE = 'pwa-chrome';

export abstract class VSCodeTestRunner {
	constructor(protected readonly repoLocation: vscode.WorkspaceFolder) { }

	public async run(baseArgs: ReadonlyArray<string>, filter?: ReadonlyArray<vscode.TestItem>) {
		const args = this.prepareArguments(baseArgs, filter);
		const cp = spawn(await this.binaryPath(), args, {
			cwd: this.repoLocation.uri.fsPath,
			stdio: 'pipe',
			env: this.getEnvironment(),
		});

		return new TestOutputScanner(cp, args);
	}

	public async debug(testRun: vscode.TestRun, baseArgs: ReadonlyArray<string>, filter?: ReadonlyArray<vscode.TestItem>) {
		const port = await this.findOpenPort();
		const baseConfiguration = vscode.workspace
			.getConfiguration('launch', this.repoLocation)
			.get<vscode.DebugConfiguration[]>('configurations', [])
			.find(c => c.name === ATTACH_CONFIG_NAME);

		if (!baseConfiguration) {
			throw new Error(`Could not find launch configuration ${ATTACH_CONFIG_NAME}`);
		}

		const server = this.createWaitServer();
		const args = [
			...this.prepareArguments(baseArgs, filter),
			`--remote-debugging-port=${port}`,
			// for breakpoint freeze: https://github.com/microsoft/vscode/issues/122225#issuecomment-885377304
			'--js-flags="--regexp_interpret_all"',
			// for general runtime freezes: https://github.com/microsoft/vscode/issues/127861#issuecomment-904144910
			'--disable-features=CalculateNativeWinOcclusion',
			'--timeout=0',
			`--waitServer=${server.port}`,
		];

		const cp = spawn(await this.binaryPath(), args, {
			cwd: this.repoLocation.uri.fsPath,
			stdio: 'pipe',
			env: this.getEnvironment(),
		});

		// Register a descriptor factory that signals the server when any
		// breakpoint set requests on the debugee have been completed.
		const factory = vscode.debug.registerDebugAdapterTrackerFactory(DEBUG_TYPE, {
			createDebugAdapterTracker(session) {
				if (!session.parentSession || session.parentSession !== rootSession) {
					return;
				}

				let initRequestId: number | undefined;

				return {
					onDidSendMessage(message) {
						if (message.type === 'response' && message.request_seq === initRequestId) {
							server.ready();
						}
					},
					onWillReceiveMessage(message) {
						if (initRequestId !== undefined) {
							return;
						}

						if (message.command === 'launch' || message.command === 'attach') {
							initRequestId = message.seq;
						}
					},
				};
			},
		});

		vscode.debug.startDebugging(this.repoLocation, { ...baseConfiguration, port }, { testRun });

		let exited = false;
		let rootSession: vscode.DebugSession | undefined;
		cp.once('exit', () => {
			exited = true;
			server.dispose();
			listener.dispose();
			factory.dispose();

			if (rootSession) {
				vscode.debug.stopDebugging(rootSession);
			}
		});

		const listener = vscode.debug.onDidStartDebugSession(s => {
			if (s.name === ATTACH_CONFIG_NAME && !rootSession) {
				if (exited) {
					vscode.debug.stopDebugging(rootSession);
				} else {
					rootSession = s;
				}
			}
		});

		return new TestOutputScanner(cp, args);
	}

	private findOpenPort(): Promise<number> {
		return new Promise((resolve, reject) => {
			const server = createServer();
			server.listen(0, () => {
				const address = server.address() as AddressInfo;
				const port = address.port;
				server.close(() => {
					resolve(port);
				});
			});
			server.on('error', (error: Error) => {
				reject(error);
			});
		});
	}

	protected getEnvironment(): NodeJS.ProcessEnv {
		return {
			...process.env,
			ELECTRON_RUN_AS_NODE: undefined,
			ELECTRON_ENABLE_LOGGING: '1',
		};
	}

	private prepareArguments(
		baseArgs: ReadonlyArray<string>,
		filter?: ReadonlyArray<vscode.TestItem>
	) {
		const args = [...this.getDefaultArgs(), ...baseArgs, '--reporter', 'full-json-stream'];
		if (!filter) {
			return args;
		}

		const grepRe: string[] = [];
		const runPaths = new Set<string>();
		const addTestFileRunPath = (data: TestFile) =>
			runPaths.add(
				path.relative(data.workspaceFolder.uri.fsPath, data.uri.fsPath).replace(/\\/g, '/')
			);

		const itemDatas = filter.map(f => itemData.get(f));
		/** If true, we have to be careful with greps, as a grep for one test file affects the run of the other test file. */
		const hasBothTestCaseOrTestSuiteAndTestFileFilters =
			itemDatas.some(d => (d instanceof TestCase) || (d instanceof TestSuite)) &&
			itemDatas.some(d => d instanceof TestFile);

		function addTestCaseOrSuite(data: TestCase | TestSuite, test: vscode.TestItem): void {
			grepRe.push(escapeRe(data.fullName) + (data instanceof TestCase ? '$' : ' '));
			for (let p = test.parent; p; p = p.parent) {
				const parentData = itemData.get(p);
				if (parentData instanceof TestFile) {
					addTestFileRunPath(parentData);
				}
			}
		}

		for (const test of filter) {
			const data = itemData.get(test);
			if (data instanceof TestCase || data instanceof TestSuite) {
				addTestCaseOrSuite(data, test);
			} else if (data instanceof TestFile) {
				if (!hasBothTestCaseOrTestSuiteAndTestFileFilters) {
					addTestFileRunPath(data);
				} else {
					// We add all the items individually so they get their own grep expressions.
					for (const [_id, nestedTest] of test.children) {
						const childData = itemData.get(nestedTest);
						if (childData instanceof TestCase || childData instanceof TestSuite) {
							addTestCaseOrSuite(childData, nestedTest);
						} else {
							console.error('Unexpected test item in test file', nestedTest.id, nestedTest.label);
						}
					}
				}
			}
		}

		if (grepRe.length) {
			args.push('--grep', `/^(${grepRe.join('|')})/`);
		}

		if (runPaths.size) {
			args.push(...[...runPaths].flatMap(p => ['--run', p]));
		}

		return args;
	}

	protected abstract getDefaultArgs(): string[];

	protected abstract binaryPath(): Promise<string>;

	protected async readProductJson() {
		const projectJson = await fs.readFile(
			path.join(this.repoLocation.uri.fsPath, 'product.json'),
			'utf-8'
		);
		try {
			return JSON.parse(projectJson);
		} catch (e) {
			throw new Error(`Error parsing product.json: ${(e as Error).message}`);
		}
	}

	private createWaitServer() {
		const onReady = new vscode.EventEmitter<void>();
		let ready = false;

		const server = createServer(socket => {
			if (ready) {
				socket.end();
			} else {
				onReady.event(() => socket.end());
			}
		});

		server.listen(0);

		return {
			port: (server.address() as AddressInfo).port,
			ready: () => {
				ready = true;
				onReady.fire();
			},
			dispose: () => {
				server.close();
			},
		};
	}
}

export class BrowserTestRunner extends VSCodeTestRunner {
	/** @override */
	protected binaryPath(): Promise<string> {
		return Promise.resolve(process.execPath);
	}

	/** @override */
	protected override getEnvironment() {
		return {
			...super.getEnvironment(),
			ELECTRON_RUN_AS_NODE: '1',
		};
	}

	/** @override */
	protected getDefaultArgs() {
		return [TEST_BROWSER_SCRIPT_PATH];
	}
}

export class WindowsTestRunner extends VSCodeTestRunner {
	/** @override */
	protected async binaryPath() {
		const { nameShort } = await this.readProductJson();
		return path.join(this.repoLocation.uri.fsPath, `.build/electron/${nameShort}.exe`);
	}

	/** @override */
	protected getDefaultArgs() {
		return [TEST_ELECTRON_SCRIPT_PATH];
	}
}

export class PosixTestRunner extends VSCodeTestRunner {
	/** @override */
	protected async binaryPath() {
		const { applicationName } = await this.readProductJson();
		return path.join(this.repoLocation.uri.fsPath, `.build/electron/${applicationName}`);
	}

	/** @override */
	protected getDefaultArgs() {
		return [TEST_ELECTRON_SCRIPT_PATH];
	}
}

export class DarwinTestRunner extends PosixTestRunner {
	/** @override */
	protected override getDefaultArgs() {
		return [
			TEST_ELECTRON_SCRIPT_PATH,
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--use-gl=swiftshader',
		];
	}

	/** @override */
	protected override async binaryPath() {
		const { nameLong } = await this.readProductJson();
		return path.join(
			this.repoLocation.uri.fsPath,
			`.build/electron/${nameLong}.app/Contents/MacOS/Electron`
		);
	}
}

export const PlatformTestRunner =
	process.platform === 'win32'
		? WindowsTestRunner
		: process.platform === 'darwin'
			? DarwinTestRunner
			: PosixTestRunner;
