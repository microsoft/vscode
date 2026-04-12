/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IRunCommandExecutionService } from '../../../commands/common/runCommandExecutionService';
import { IExtensionsService } from '../../../extensions/common/extensionsService';
import { TestExtensionsService } from '../../../test/common/testExtensionsService';
import { createPlatformServices } from '../../../test/node/services';
import { NullTestProvider } from '../../common/nullTestProvider';
import { ITestProvider } from '../../common/testProvider';
import { ISetupTestsDetector, SetupTestActionType, SetupTestsDetector } from '../../node/setupTestDetector';
import { ITestDepsResolver } from '../../node/testDepsResolver';

suite('SetupTestsDetector', () => {
	let setupTestsDetector: ISetupTestsDetector;
	let testDepsResolver: TestTestDepsResolver;
	let extensionService: TestExtensionsService;
	let commandService: IRunCommandExecutionService;
	let testProvider: ITestProvider;

	class TestTestDepsResolver implements ITestDepsResolver {
		public deps: string[] = [];

		declare readonly _serviceBrand: undefined;

		getTestDeps(languageId: string): Promise<string[]> {
			return Promise.resolve(this.deps);
		}
	}

	beforeEach(() => {
		const services = createPlatformServices();
		testDepsResolver = new TestTestDepsResolver();
		services.define(ITestDepsResolver, testDepsResolver);
		services.define(ITestProvider, new NullTestProvider());
		const accessor = services.createTestingAccessor();
		commandService = accessor.get(IRunCommandExecutionService);
		testProvider = accessor.get(ITestProvider);
		extensionService = accessor.get(IExtensionsService) as TestExtensionsService;
		setupTestsDetector = accessor.get(IInstantiationService).createInstance(SetupTestsDetector);
	});

	suite('shouldSuggestSetup', () => {
		test('suggests generic search when ambiguous', async () => {
			const document = { languageId: 'javascript' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);

			expect(action).to.deep.equal({
				type: SetupTestActionType.SearchGeneric,
				context: document,
			});
		});

		test('suggests extension install for a framework', async () => {
			const document = { languageId: 'javascript' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			testDepsResolver.deps = ['mocha'];

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);

			expect(action).to.deep.equal({
				type: SetupTestActionType.InstallExtensionForFramework,
				extension: {
					id: 'hbenl.vscode-mocha-test-adapter',
					name: 'Mocha Test Explorer',
				},
				framework: 'mocha',
			});
		});

		test('does not suggest install when tests are in workspace', async () => {
			const document = { languageId: 'javascript' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			vi.spyOn(testProvider, 'hasAnyTests').mockReturnValue(Promise.resolve(true));
			testDepsResolver.deps = ['mocha'];
			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).to.be.undefined;
		});

		test('does not suggest extension install for a framework already installed', async () => {
			const document = { languageId: 'javascript' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			testDepsResolver.deps = ['mocha'];
			extensionService.addExtension({ id: 'hbenl.vscode-mocha-test-adapter' });

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).to.be.undefined;
		});

		test('suggests extension search for a known framework', async () => {
			const document = { languageId: 'javascript' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			testDepsResolver.deps = ['cypress'];

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);

			expect(action).to.deep.equal({
				type: SetupTestActionType.SearchForFramework,
				framework: 'cypress',
			});
		});

		test('suggests extension install for a language', async () => {
			const document = { languageId: 'python' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);

			expect(action).to.deep.equal({
				type: SetupTestActionType.InstallExtensionForLanguage,
				extension: {
					id: 'ms-python.python',
					name: 'Python',
				},
				language: 'python',
			});
		});

		test('reminds if the user already prompted', async () => {
			const document = { languageId: 'python' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).to.deep.equal({
				type: SetupTestActionType.InstallExtensionForLanguage,
				extension: {
					id: 'ms-python.python',
					name: 'Python',
				},
				language: 'python',
			});
			setupTestsDetector.showSuggestion(action!);

			expect(await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output)).to.deep.equal({
				type: SetupTestActionType.Remind,
				action: {
					type: SetupTestActionType.InstallExtensionForLanguage,
					extension: {
						id: 'ms-python.python',
						name: 'Python',
					},
					language: 'python',
				},
			});
		});

		test('does not suggest language extension install when already installed', async () => {
			const document = { languageId: 'python' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			extensionService.addExtension({ id: 'ms-python.python' });

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).to.be.undefined;
		});

		test('delegates to language extension setup', async () => {
			const document = { languageId: 'python' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;

			vi.spyOn(commandService, 'executeCommand').mockReturnValue(Promise.resolve({ message: 'msg', command: { command: 'followup', title: 'Follow Up' } }));

			extensionService.addExtension({ id: 'ms-python.python', packageJSON: { copilot: { tests: { getSetupConfirmation: 'my-command' } } } });

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).toMatchInlineSnapshot(`
			{
			  "command": {
			    "command": "followup",
			    "title": "Follow Up",
			  },
			  "message": "msg",
			  "type": 6,
			}
		`);
		});

		test('delegates to language extension setup no-op', async () => {
			const document = { languageId: 'python' } as vscode.TextDocument;
			const request = {} as vscode.ChatRequest;
			const output = {} as vscode.ChatResponseStream;
			vi.spyOn(commandService, 'executeCommand').mockReturnValue(Promise.resolve());
			extensionService.addExtension({ id: 'ms-python.python', packageJSON: { copilot: { tests: { getSetupConfirmation: 'my-command' } } } });

			const action = await setupTestsDetector.shouldSuggestSetup({ document } as any, request, output);
			expect(action).be.undefined;
		});
	});
});
