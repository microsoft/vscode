/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { SandboxOutputAnalyzer } from '../../browser/tools/sandboxOutputAnalyzer.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('SandboxOutputAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	function createAnalyzer(options: { sandboxService?: Partial<ITerminalSandboxService>; existingPaths?: string[] } = {}) {
		instantiationService = workbenchInstantiationService({}, store);
		const existingPaths = new Set(options.existingPaths ?? []);
		instantiationService.stub(IFileService, {
			_serviceBrand: undefined,
			exists: async resource => existingPaths.has(resource.path),
		});
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => true,
			promptToAllowWritePath: async () => false,
			wrapWithSandbox: async (_runtimeConfig, command) => command,
			wrapCommand: async command => command,
			...options.sandboxService,
		});
		return store.add(instantiationService.createInstance(SandboxOutputAnalyzer));
	}

	test('should prompt to allow a denied existing write path and ask for retry', async () => {
		const requestedPaths: string[] = [];
		const analyzer = createAnalyzer({
			existingPaths: ['/tmp/blocked.txt'],
			sandboxService: {
				promptToAllowWritePath: async path => {
					requestedPaths.push(path);
					return true;
				}
			}
		});

		const result = await analyzer.analyze({
			exitCode: 1,
			// eslint-disable-next-line local/code-no-unexternalized-strings
			exitResult: "Error: EPERM: operation not permitted, open '/tmp/blocked.txt'",
			commandLine: 'touch /tmp/blocked.txt'
		});

		strictEqual(requestedPaths[0], '/tmp/blocked.txt');
		ok(/Retry the command\./.test(result ?? ''));
		ok(/\/tmp\/blocked\.txt/.test(result ?? ''));
	});

	test('should fall back to the parent path when the extracted path does not exist', async () => {
		const requestedPaths: string[] = [];
		const analyzer = createAnalyzer({
			sandboxService: {
				promptToAllowWritePath: async path => {
					requestedPaths.push(path);
					return true;
				}
			}
		});

		const result = await analyzer.analyze({
			exitCode: 1,
			// eslint-disable-next-line local/code-no-unexternalized-strings
			exitResult: "Error: EPERM: operation not permitted, open '/tmp/new-folder/file.txt'",
			commandLine: 'mkdir -p /tmp/new-folder && touch /tmp/new-folder/file.txt'
		});

		strictEqual(requestedPaths[0], '/tmp/new-folder');
		ok(/\/tmp\/new-folder/.test(result ?? ''));
	});

	test('should return generic sandbox guidance when write path approval is declined', async () => {
		const analyzer = createAnalyzer({
			sandboxService: {
				promptToAllowWritePath: async () => false,
			}
		});

		const result = await analyzer.analyze({
			exitCode: 1,
			// eslint-disable-next-line local/code-no-unexternalized-strings
			exitResult: "Error: EPERM: operation not permitted, open '/tmp/blocked.txt'",
			commandLine: 'touch /tmp/blocked.txt'
		});

		ok(/Command failed while running in sandboxed mode\./.test(result ?? ''));
		ok(/allowWrite/.test(result ?? ''));
	});

	test('should extract an inline path followed by warning text', async () => {
		const requestedPaths: string[] = [];
		const analyzer = createAnalyzer({
			sandboxService: {
				promptToAllowWritePath: async path => {
					requestedPaths.push(path);
					return true;
				}
			}
		});

		const result = await analyzer.analyze({
			exitCode: 1,
			exitResult: 'Warning: Failed to create the file /home/testing/openai-api-docs.html:            Warning: Read-only file system',
			commandLine: 'touch /home/testing/openai-api-docs.html'
		});

		strictEqual(requestedPaths[0], '/home/testing');
		ok(/\/home\/testing/.test(result ?? ''));
	});

	test('should extract an inline path followed by plain text without a colon', async () => {
		const requestedPaths: string[] = [];
		const analyzer = createAnalyzer({
			sandboxService: {
				promptToAllowWritePath: async path => {
					requestedPaths.push(path);
					return true;
				}
			}
		});

		const result = await analyzer.analyze({
			exitCode: 1,
			exitResult: 'Warning: Failed to create the file /home/testing/openai-api-docs.html Warning Read-only file system',
			commandLine: 'touch /home/testing/openai-api-docs.html'
		});

		strictEqual(requestedPaths[0], '/home/testing');
		ok(/\/home\/testing/.test(result ?? ''));
	});
});
