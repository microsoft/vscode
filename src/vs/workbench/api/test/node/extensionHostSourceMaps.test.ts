/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { dirname, join, relative } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

const execFileAsync = promisify(execFile);

suite('Extension host native source maps', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const outRoot = new URL('../../../../../', import.meta.url);
	const bootstrapPath = fileURLToPath(new URL('bootstrap-fork.js', outRoot));
	const moduleUrl = (path: string) => JSON.stringify(new URL(path, outRoot).href);
	let fixtureDirectory: string;
	let runnerPath: string;
	let entrypointPath: string;

	suiteSetup(async () => {
		fixtureDirectory = await mkdtemp(join(tmpdir(), 'vscode-extension-source-maps-'));
		runnerPath = join(fixtureDirectory, 'runner.mjs');
		entrypointPath = join(fixtureDirectory, 'entrypoint.js');
		await writeFile(join(fixtureDirectory, 'package.json'), JSON.stringify({ type: 'module' }));

		const source = `export function createError(): Error { return new Error('source map probe'); }`;
		const sourceMap = JSON.stringify({ version: 3, sources: ['fixture.ts'], sourcesContent: [source], names: [], mappings: 'AAAA' });
		await writeFile(join(fixtureDirectory, 'fixture.cjs'), `module.exports.createError = function createError() { return new Error('source map probe'); };\n//# sourceMappingURL=fixture.cjs.map\n`);
		await writeFile(join(fixtureDirectory, 'fixture.cjs.map'), sourceMap);

		await writeFile(entrypointPath, `
			import { createRequire } from 'node:module';
			const fixture = createRequire(import.meta.url)('./fixture.cjs');
			process.stdout.write(JSON.stringify({ enabled: process.sourceMapsEnabled, stack: fixture.createError().stack }));
		`);

		// Error.prepareStackTrace becomes non-configurable in the host. Use a fresh
		// process per case, rather than changing the test runner's global handler.
		await writeFile(runnerPath, `
			import { createRequire, setSourceMapsSupport } from 'node:module';
			const require = createRequire(import.meta.url);
			globalThis._VSCODE_PRODUCT_JSON = require(${JSON.stringify(fileURLToPath(new URL('../product.json', outRoot)))});
			globalThis._VSCODE_PACKAGE_JSON = require(${JSON.stringify(fileURLToPath(new URL('../package.json', outRoot)))});
			globalThis._VSCODE_FILE_ROOT = ${JSON.stringify(outRoot.href)};

			const mode = process.argv[2];
			setSourceMapsSupport(mode !== 'off');
			if (mode === 'custom-before' || mode === 'skip-fallback') {
				Error.prepareStackTrace = function () {
					if (mode === 'custom-before' && this !== Error) {
						throw new Error('Unexpected formatter receiver');
					}
					return mode;
				};
			}
			const fixture = require('./fixture.cjs');
			const expectedStack = fixture.createError().stack.split('\\n').slice(0, 2).join('\\n');

			const { ErrorHandler } = await import(${moduleUrl('vs/workbench/api/common/extensionHostMain.js')});
			const { IExtHostRpcService } = await import(${moduleUrl('vs/workbench/api/common/extHostRpcService.js')});
			const { IExtHostExtensionService } = await import(${moduleUrl('vs/workbench/api/common/extHostExtensionService.js')});
			const { IExtHostTelemetry } = await import(${moduleUrl('vs/workbench/api/common/extHostTelemetry.js')});
			const { IExtHostApiDeprecationService } = await import(${moduleUrl('vs/workbench/api/common/extHostApiDeprecationService.js')});
			const { ILogService } = await import(${moduleUrl('vs/platform/log/common/log.js')});
			const { onUnexpectedError } = await import(${moduleUrl('vs/base/common/errors.js')});
			const { ExtensionIdentifier } = await import(${moduleUrl('vs/platform/extensions/common/extensions.js')});

			const extension = { identifier: new ExtensionIdentifier('test.source-maps') };
			const runtimeErrors = [];
			const telemetryErrors = [];
			let attributionLookups = 0;
			const mainThread = {
				$onExtensionRuntimeError(id, error) { runtimeErrors.push({ extension: id.value, stack: error.stack }); },
				$onUnexpectedError() {}
			};
			const fixturePath = require.resolve('./fixture.cjs');
			const services = new Map([
				[ILogService, { error() {}, trace() {} }],
				[IExtHostRpcService, { getProxy() { return mainThread; } }],
				[IExtHostTelemetry, { onExtensionError(id) { telemetryErrors.push(id.value); return false; } }],
				[IExtHostApiDeprecationService, {}],
				[IExtHostExtensionService, {
					async getExtensionRegistry() { return {}; },
					async getExtensionPathIndex() {
						return { findSubstr(uri) {
							attributionLookups++;
							return uri.fsPath === fixturePath ? extension : undefined;
						} };
					}
				}]
			]);
			await ErrorHandler.installFullHandler({ get(id) { return services.get(id); } });
			if (mode === 'custom-after') {
				Error.prepareStackTrace = function () {
					if (this !== Error) {
						throw new Error('Unexpected formatter receiver');
					}
					return mode;
				};
			} else if (mode === 'disable-after') {
				setSourceMapsSupport(false);
			}
			const error = fixture.createError();
			let fallbackFormattingCalls = 0;
			if (mode === 'skip-fallback') {
				// Invoke the real host handler with a frame whose fallback rendering
				// can be counted, while the installed formatter supplies the output.
				Error.prepareStackTrace.call(Error, error, [{
					getFileName() { return fixturePath; },
					toString() { fallbackFormattingCalls++; return 'generated frame'; }
				}]);
			}
			const stack = error.stack;
			onUnexpectedError(error);
			process.stdout.write(JSON.stringify({ stack, expectedStack, attributionLookups, runtimeErrors, telemetryErrors, fallbackFormattingCalls }));
		`);
	});

	suiteTeardown(async () => {
		await rm(fixtureDirectory, { recursive: true, force: true });
	});

	function childEnvironment(): NodeJS.ProcessEnv {
		const env = { ...process.env };
		delete env.NODE_OPTIONS;
		delete env.VSCODE_PARENT_PID;
		delete env.VSCODE_PIPE_LOGGING;
		delete env.VSCODE_CODE_CACHE_PATH;
		delete env.VSCODE_CRASH_REPORTER_PROCESS_TYPE;
		delete env.VSCODE_NLS_CONFIG;
		env.ELECTRON_RUN_AS_NODE = '1';
		env.VSCODE_DEV = '1';
		return env;
	}

	interface HandlerResult {
		stack: string;
		expectedStack: string;
		attributionLookups: number;
		runtimeErrors: { extension: string; stack: string }[];
		telemetryErrors: string[];
		fallbackFormattingCalls: number;
	}

	async function runHandler(mode: string): Promise<HandlerResult> {
		const { stdout } = await execFileAsync(process.execPath, [runnerPath, mode], { env: childEnvironment() });
		return JSON.parse(stdout);
	}

	function assertAttribution(result: HandlerResult): void {
		assert.deepStrictEqual({
			lookups: result.attributionLookups,
			runtime: result.runtimeErrors,
			telemetry: result.telemetryErrors
		}, {
			lookups: 1,
			runtime: [{ extension: 'test.source-maps', stack: result.stack }],
			telemetry: ['test.source-maps']
		});
	}

	test('maps generated frames using the original formatter and still attributes the error', async () => {
		const result = await runHandler('on');
		assert.strictEqual(result.stack.split('\n').slice(0, 2).join('\n'), result.expectedStack);
		assert.match(result.stack, /fixture\.ts:1:1/);
		assertAttribution(result);
	});

	test('keeps the existing stack format when source maps are disabled', async () => {
		const result = await runHandler('off');
		// The host's existing formatter uses tabs rather than Node's four spaces.
		assert.strictEqual(result.stack.split('\n').slice(0, 2).join('\n'), result.expectedStack.replace('\n    at ', '\n\tat '));
		assert.match(result.stack, /fixture\.cjs:1:/);
		assertAttribution(result);
	});

	test('respects source maps being disabled after the handler is installed', async () => {
		const result = await runHandler('disable-after');
		assert.match(result.stack, /fixture\.cjs:1:/);
		assertAttribution(result);
	});

	test('does not build fallback stack text when a formatter is available', async () => {
		const result = await runHandler('skip-fallback');
		assert.deepStrictEqual({ stack: result.stack, fallbackCalls: result.fallbackFormattingCalls }, { stack: 'skip-fallback', fallbackCalls: 0 });
		assertAttribution(result);
	});

	for (const mode of ['custom-before', 'custom-after']) {
		test(`preserves a custom formatter and its Error receiver when installed ${mode === 'custom-before' ? 'before' : 'after'} the host handler`, async () => {
			const result = await runHandler(mode);
			assert.strictEqual(result.stack, mode);
			assertAttribution(result);
		});
	}

	for (const flag of [undefined, 'false', 'true']) {
		test(`bootstrap enables native source maps only with the opt-in flag (${flag ?? 'unset'})`, async () => {
			const env = childEnvironment();
			delete env.VSCODE_ENABLE_SOURCE_MAPS;
			if (flag !== undefined) {
				env.VSCODE_ENABLE_SOURCE_MAPS = flag;
			}
			env.VSCODE_ESM_ENTRYPOINT = relative(dirname(bootstrapPath), entrypointPath).replace(/\\/g, '/').replace(/\.js$/, '');
			const { stdout } = await execFileAsync(process.execPath, [bootstrapPath], { env });
			const result = JSON.parse(stdout) as { enabled: boolean; stack: string };
			assert.strictEqual(result.enabled, flag === 'true');
			assert.match(result.stack, flag === 'true' ? /fixture\.ts:1:1/ : /fixture\.cjs:1:/);
		});
	}
});
