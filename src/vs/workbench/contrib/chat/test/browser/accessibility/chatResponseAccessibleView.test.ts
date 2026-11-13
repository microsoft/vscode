/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toAction } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Location } from '../../../../../../editor/common/languages.js';
import { AccessibleContentProvider } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createTestArtifactRequestPresentation } from '../../../../../../platform/artifactIntegrations/test/common/artifactIntegrationTestUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ChatResponseAccessibleView, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, getChatResponsePlaintextParts, getToolSpecificDataDescription, getResultDetailsDescription, getToolInvocationA11yDescription } from '../../../browser/accessibility/chatResponseAccessibleView.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { registerChatNativeComponentsRenderer } from '../../../browser/widget/chatContentParts/chatNativeComponents.js';
import { chatNativeComponentsRenderer } from '../../../browser/widget/chatContentParts/chatNativeComponentsPart.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatAutoModeResolutionPart, IChatExtensionsContent, IChatMcpAuthenticationRequired, IChatPullRequestContent, IChatSessionTargetData, IChatSubagentToolInvocationData, IChatTerminalToolInvocationData, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, IChatToolResourcesInvocationData, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { Response, type IChatResponseModel, type IResponse } from '../../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import type { IChatRequestViewModel, IChatResponseViewModel, IChatScheduledRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';

suite('ChatResponseAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMcpToolInvocation(): ChatToolInvocation {
		return new ChatToolInvocation({
			invocationMessage: 'Read issue',
			originMessage: 'GitHub (MCP Server)',
		}, {
			id: 'io-github-github-github-mcp-server-issue_read',
			displayName: 'Read issue',
			modelDescription: 'Read an issue',
			source: ToolDataSource.Internal,
		}, 'tc-mcp', undefined, undefined);
	}

	test('includes MCP tool titles and server origins in live and restored content', () => {
		const invocation = createMcpToolInvocation();
		invocation.didExecuteTool(undefined);
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({ value: [invocation, invocation.toJSON()] }),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
			{ partIndex: 0, text: 'Read issue. GitHub (MCP Server)' },
			{ partIndex: 1, text: 'Read issue. GitHub (MCP Server)' },
		]);
	});

	for (const toolId of ['image_generation', 'image_gen.imagegen', 'custom_image_tool', 'view']) {
		test(`keeps preconfirmation image tools out of accessible and response text (${toolId})`, async () => {
			const invocation = ChatToolInvocation.createStreaming({
				toolId, toolCallId: 'pending-tool',
				toolData: { id: toolId, displayName: 'Proposed tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			});
			if (toolId === 'custom_image_tool') {
				invocation.toolSpecificData = { kind: 'input', rawInput: {}, imageGeneration: { requestedModel: { id: 'image-model' } } };
			}
			const response = store.add(new Response([]));
			response.updateContent(invocation);
			const item = upcastPartial<IChatResponseViewModel>({ response });
			const snapshot = () => ({
				plaintext: getChatResponsePlaintextParts(item, true).map(part => part.text),
				response: response.toString(),
			});
			const snapshots = [snapshot()];
			invocation.requestConfirmation({
				invocationMessage: 'Run tool',
				confirmationMessages: { title: 'Allow Tool?', message: new MarkdownString('Inspect the proposed operation.') },
			});
			snapshots.push(snapshot());
			const confirmation = invocation.state.get();
			assert.ok(confirmation.type === IChatToolInvocation.StateKind.WaitingForConfirmation);
			confirmation.confirm({ type: ToolConfirmKind.UserAction });
			snapshots.push(snapshot());
			await invocation.didExecuteTool({ content: [], toolResultMessage: 'Done' });
			snapshots.push(snapshot());
			const restored = store.add(new Response([invocation.toJSON()]));
			assert.deepStrictEqual({
				snapshots,
				restored: { plaintext: getChatResponsePlaintextParts(upcastPartial<IChatResponseViewModel>({ response: restored }), true).map(part => part.text), response: restored.toString() },
			}, {
				snapshots: [
					toolId === 'view' ? { plaintext: ['Proposed tool'], response: 'Proposed tool' } : { plaintext: [], response: '' },
					{ plaintext: ['Allow Tool?\nInspect the proposed operation.'], response: 'Run tool' },
					{ plaintext: ['Run tool'], response: 'Run tool' },
					{ plaintext: ['Done'], response: 'Done' },
				],
				restored: { plaintext: ['Done'], response: 'Done' },
			});
		});
	}

	for (const error of [true, 'Connection refused'] as const) {
		test(`describes failures without output details in live and restored content (${error})`, async () => {
			const invocation = createMcpToolInvocation();
			await invocation.didExecuteTool({ content: [], toolResultError: error });
			const item = upcastPartial<IChatResponseViewModel>({
				response: upcastPartial<IResponse>({ value: [invocation, invocation.toJSON()] }),
			});
			const message = error === true ? 'Tool execution failed' : `Tool execution failed: ${error}`;

			assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
				{ partIndex: 0, text: `${message}. Read issue. GitHub (MCP Server)` },
				{ partIndex: 1, text: `${message}. Read issue. GitHub (MCP Server)` },
			]);
		});
	}

	for (const exitCode of [undefined, 0, 2]) {
		test(`describes terminal outcomes in live and restored content (exit code: ${exitCode})`, async () => {
			const invocation = new ChatToolInvocation({
				invocationMessage: 'Run tests',
				toolSpecificData: {
					kind: 'terminal',
					commandLine: { original: 'npm test' },
					language: 'bash',
					terminalCommandState: { exitCode },
				},
			}, {
				id: 'terminal', displayName: 'Terminal', modelDescription: 'Run a command', source: ToolDataSource.Internal,
			}, 'terminal', undefined, {});
			await invocation.didExecuteTool(undefined);
			const item = upcastPartial<IChatResponseViewModel>({
				response: upcastPartial<IResponse>({ value: [invocation, invocation.toJSON()] }),
			});
			const message = exitCode === 2 ? 'Tool execution failed with exit code 2. Run tests. npm test' : 'Run tests. npm test';

			assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
				{ partIndex: 0, text: message },
				{ partIndex: 1, text: message },
			]);
		});
	}

	test('includes the canonical MCP title and origin while waiting for authentication', () => {
		const invocation = createMcpToolInvocation();
		invocation.invocationMessage = new MarkdownString('**Read issue**');
		invocation.originMessage = new MarkdownString('**GitHub** (MCP Server)');
		invocation.setAuthenticationRequired({ id: 'github', name: 'GitHub account', resource: 'https://api.github.com/mcp' });
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({ value: [invocation] }),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [{
			partIndex: 0,
			text: 'MCP authentication required for GitHub account to continue Read issue.\nGitHub (MCP Server)',
		}]);
	});

	test('includes standalone MCP authentication prompts while they are pending', () => {
		const servers = observableValue('servers', [{ id: 'github', name: 'GitHub', resource: 'https://api.github.com/mcp' }]);
		const authentication: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers,
			isUsed: false,
		};
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({ value: [authentication] }),
		});
		const plaintext = () => getChatResponsePlaintextParts(item, true);
		const pending = plaintext();
		authentication.isUsed = true;
		const used = plaintext();
		authentication.isUsed = false;
		servers.set([], undefined);

		assert.deepStrictEqual({
			pending,
			used,
			empty: plaintext(),
		}, {
			pending: [{
				partIndex: 0,
				text: 'The MCP server GitHub requires authentication. Use the Authenticate button in the chat response to continue.',
			}],
			used: [],
			empty: [],
		});
	});

	test('includes the canonical MCP title and origin while waiting for result approval', async () => {
		const invocation = createMcpToolInvocation();
		invocation.confirmationMessages = { confirmResults: true };
		await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Issue details' }] });
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({ value: [invocation] }),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [{
			partIndex: 0,
			text: 'Approve results of Read issue? Result: Issue details\nGitHub (MCP Server)',
		}]);
	});

	test('omits the hidden workspace-continuation request text while preserving transition and provider response text', () => {
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({
				value: [
					{
						kind: 'systemNotification',
						content: new MarkdownString('Now working in vscode'),
						presentation: 'workspaceTransition',
						accessibilityLabel: 'Workspace changed. This session is now working in vscode using an isolated worktree.',
					},
					{ kind: 'markdownContent', content: new MarkdownString('Provider continued work') },
				],
			}),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
			{
				partIndex: 0,
				text: 'Workspace changed. This session is now working in vscode using an isolated worktree.',
			},
			{
				partIndex: 1,
				text: 'Provider continued work',
			},
		]);
	});

	test('includes warnings and their link text', () => {
		const item = upcastPartial<IChatResponseViewModel>({
			response: upcastPartial<IResponse>({
				value: [
					{
						kind: 'warning',
						content: new MarkdownString('The model only supports 128 tools, 114 tools were not provided to the model. [Configure Tools](command:aiCustomization.openManagementEditor?%5B%22tools%22%5D)', { isTrusted: { enabledCommands: ['aiCustomization.openManagementEditor'] } }),
						keepVisibleWhenCollapsed: true,
					},
					{ kind: 'markdownContent', content: new MarkdownString('Final answer') },
				],
			}),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
			{
				partIndex: 0,
				text: 'Warning: The model only supports 128 tools, 114 tools were not provided to the model. Configure Tools',
			},
			{
				partIndex: 1,
				text: 'Final answer',
			},
		]);
	});

	test('reads an Auto routing row as its selection reason when the router supplies one, naming Copilot Fusion when Auto is presented that way', () => {
		const reason = 'Auto selected gpt-5.4-mini to prioritize cost efficiency, alongside model fit for this task.';
		const item = upcastPartial<IChatResponseViewModel>({
			isComplete: true,
			response: upcastPartial<IResponse>({
				value: [
					{ kind: 'autoModeResolution', resolved: { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', reason } },
					{ kind: 'autoModeResolution', resolved: { id: 'gpt-5.5', name: 'GPT-5.5' } },
					{ kind: 'autoModeResolution', resolved: { id: 'gpt-5.5', name: 'GPT-5.5' }, fusion: true },
				],
			}),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true), [
			{ partIndex: 0, text: reason },
			{ partIndex: 1, text: 'Auto routed task to GPT-5.5' },
			{ partIndex: 2, text: 'Copilot Fusion routed task to GPT-5.5' },
		]);
	});

	test('reads a model router row with the effort and context size its router set, and neither when it set none', () => {
		const resolved = { id: 'opus', name: 'Claude Opus 5.5' };
		const item = upcastPartial<IChatResponseViewModel>({
			isComplete: true,
			response: upcastPartial<IResponse>({
				value: [
					{ kind: 'autoModeResolution', router: 'Daily Driver', resolved, effort: 'medium', contextSize: 1_000_000 },
					{ kind: 'autoModeResolution', router: 'Daily Driver', resolved, contextSize: 200_000 },
					{ kind: 'autoModeResolution', router: 'Daily Driver', resolved },
				],
			}),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true).map(part => part.text), [
			'Daily Driver picked Claude Opus 5.5 \u00b7 Medium effort \u00b7 1M',
			'Daily Driver picked Claude Opus 5.5 \u00b7 200K',
			'Daily Driver picked Claude Opus 5.5',
		]);
	});

	test('reads a model router row for a named route with the route\'s name', () => {
		const named = { kind: 'autoModeResolution' as const, router: 'Workday', routeName: 'bug-fix', resolved: { id: 'opus', name: 'Claude Opus 5.5' } };
		const item = upcastPartial<IChatResponseViewModel>({
			isComplete: true,
			response: upcastPartial<IResponse>({ value: [{ ...named, effort: 'medium' }, { ...named, defaulted: true }, { ...named, kept: true }, { ...named, switchedFrom: 'GPT-5.5' }, { ...named, switchedFrom: 'Claude Opus 5.5' }, { ...named, routeName: undefined, playbook: 'feature' } as IChatAutoModeResolutionPart] }),
		});

		assert.deepStrictEqual(getChatResponsePlaintextParts(item, true).map(part => part.text), [
			'Workday picked its bug-fix route on Claude Opus 5.5 \u00b7 Medium effort',
			'Workday used its first route, bug-fix, on Claude Opus 5.5',
			'Workday stayed on its bug-fix route on Claude Opus 5.5',
			// A chat that moved to the router from another model has only this line to name the route.
			'Workday switched from GPT-5.5 to its bug-fix route on Claude Opus 5.5',
			// Two named routes can run on the same model.
			'Workday moved to its bug-fix route on Claude Opus 5.5',
			// A chat saved while named routes were written as playbooks.
			'Workday picked its feature route on Claude Opus 5.5',
		]);
	});

	suite('getToolSpecificDataDescription', () => {
		test('returns empty string for undefined', () => {
			assert.strictEqual(getToolSpecificDataDescription(undefined), '');
		});

		test('returns command line for terminal data', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install',
					toolEdited: 'npm ci',
					userEdited: 'npm install --save-dev'
				},
				language: 'bash'
			};
			// Should prefer userEdited over toolEdited over original
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm install --save-dev');
		});

		test('returns tool edited command for terminal data without user edit', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install',
					toolEdited: 'npm ci'
				},
				language: 'bash'
			};
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm ci');
		});

		test('returns original command for terminal data without edits', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: {
					original: 'npm install'
				},
				language: 'bash'
			};
			assert.strictEqual(getToolSpecificDataDescription(terminalData), 'npm install');
		});

		test('returns description for subagent data', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				agentDisplayName: 'Test Agent',
				agentName: 'test-agent',
				description: 'Running analysis',
				prompt: 'Analyze the code'
			};
			const result = getToolSpecificDataDescription(subagentData);
			assert.strictEqual(result, 'Agent: Test Agent. Running analysis. Task: Analyze the code');
		});

		test('handles subagent with only description', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				description: 'Running analysis'
			};
			const result = getToolSpecificDataDescription(subagentData);
			assert.strictEqual(result, 'Running analysis');
		});

		test('returns extensions list for extensions data', () => {
			const extensionsData: IChatExtensionsContent = {
				kind: 'extensions',
				extensions: ['eslint', 'prettier', 'typescript']
			};
			const result = getToolSpecificDataDescription(extensionsData);
			assert.ok(result.includes('eslint'));
			assert.ok(result.includes('prettier'));
			assert.ok(result.includes('typescript'));
		});

		test('returns empty for empty extensions array', () => {
			const extensionsData: IChatExtensionsContent = {
				kind: 'extensions',
				extensions: []
			};
			assert.strictEqual(getToolSpecificDataDescription(extensionsData), '');
		});

		test('returns todo list description for todoList data', () => {
			const todoData: IChatTodoListContent = {
				kind: 'todoList',
				todoList: [
					{ id: '1', title: 'Task 1', status: 'in-progress' },
					{ id: '2', title: 'Task 2', status: 'completed' }
				]
			};
			const result = getToolSpecificDataDescription(todoData);
			assert.ok(result.includes('2 items'));
			assert.ok(result.includes('Task 1'));
			assert.ok(result.includes('in-progress'));
			assert.ok(result.includes('Task 2'));
			assert.ok(result.includes('completed'));
		});

		test('returns empty for empty todo list', () => {
			const todoData: IChatTodoListContent = {
				kind: 'todoList',
				todoList: []
			};
			assert.strictEqual(getToolSpecificDataDescription(todoData), '');
		});

		test('returns PR info for pullRequest data', () => {
			const prData: IChatPullRequestContent = {
				kind: 'pullRequest',
				uri: URI.file('/test'),
				command: { id: 'vscode.open', title: 'Open Pull Request', arguments: [URI.file('/test')] },
				title: 'Add new feature',
				description: 'This PR adds a great feature',
				author: 'testuser',
				linkTag: '#123'
			};
			const result = getToolSpecificDataDescription(prData);
			assert.ok(result.includes('Add new feature'));
			assert.ok(result.includes('testuser'));
		});

		test('returns raw input for input data (string)', () => {
			const inputData: IChatToolInputInvocationData = {
				kind: 'input',
				rawInput: 'some input string'
			};
			assert.strictEqual(getToolSpecificDataDescription(inputData), 'some input string');
		});

		test('returns JSON stringified for input data (object)', () => {
			const inputData: IChatToolInputInvocationData = {
				kind: 'input',
				rawInput: { key: 'value', nested: { data: 123 } }
			};
			const result = getToolSpecificDataDescription(inputData);
			assert.ok(result.includes('key'));
			assert.ok(result.includes('value'));
		});

		test('returns resources list for resources data with URIs', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					URI.file('/path/to/file1.ts'),
					URI.file('/path/to/file2.ts')
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
		});

		test('returns resources list for resources data with Locations', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					{ uri: URI.file('/path/to/file1.ts'), range: new Range(1, 1, 10, 1) },
					{ uri: URI.file('/path/to/file2.ts'), range: new Range(5, 1, 15, 1) }
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes(':1')); // Line number included for Locations
			assert.ok(result.includes('file2.ts'));
			assert.ok(result.includes(':5')); // Line number included for Locations
		});

		test('returns resources list for mixed URIs and Locations', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: [
					URI.file('/path/to/file1.ts'),
					{ uri: URI.file('/path/to/file2.ts'), range: new Range(10, 1, 20, 1) }
				]
			};
			const result = getToolSpecificDataDescription(resourcesData);
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
			assert.ok(result.includes(':10')); // Line number for Location only
		});

		test('returns empty for empty resources array', () => {
			const resourcesData: IChatToolResourcesInvocationData = {
				kind: 'resources',
				values: []
			};
			assert.strictEqual(getToolSpecificDataDescription(resourcesData), '');
		});

		test('describes configured automation results', () => {
			assert.deepStrictEqual([
				getToolSpecificDataDescription({
					kind: 'automationConfigured',
					automationId: 'automation-1',
					automationName: 'Morning review',
					operation: 'created',
				}),
				getToolSpecificDataDescription({
					kind: 'automationConfigured',
					automationId: 'automation-1',
					automationName: 'Morning review',
					operation: 'updated',
				}),
			], [
				'Created an automation: Morning review',
				'Edited an automation: Morning review',
			]);
		});

		test('describes a created session using its full title when available', () => {
			const sessionData: IChatSessionTargetData = {
				kind: 'sessionCreated',
				openLink: 'agent-host-session://local/session',
				label: 'Implement issue',
				fullTitle: 'Implement issue and validate the fix',
			};
			assert.strictEqual(getToolSpecificDataDescription(sessionData), 'Implement issue and validate the fix');
		});
	});

	suite('getResultDetailsDescription', () => {
		test('returns empty object for undefined', () => {
			assert.deepStrictEqual(getResultDetailsDescription(undefined), {});
		});

		test('returns files for URI array', () => {
			const uris = [
				URI.file('/path/to/file1.ts'),
				URI.file('/path/to/file2.ts')
			];
			const result = getResultDetailsDescription(uris);
			assert.ok(result.files);
			assert.strictEqual(result.files!.length, 2);
			assert.ok(result.files![0].includes('file1.ts'));
			assert.ok(result.files![1].includes('file2.ts'));
		});

		test('returns files for Location array', () => {
			const locations: Location[] = [
				{ uri: URI.file('/path/to/file1.ts'), range: new Range(1, 1, 10, 1) },
				{ uri: URI.file('/path/to/file2.ts'), range: new Range(5, 1, 15, 1) }
			];
			const result = getResultDetailsDescription(locations);
			assert.ok(result.files);
			assert.strictEqual(result.files!.length, 2);
		});

		test('returns input and isError for IToolResultInputOutputDetails', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: false
			};
			const result = getResultDetailsDescription(details);
			assert.strictEqual(result.input, 'create_file path=/test/file.ts');
			assert.strictEqual(result.isError, false);
		});

		test('returns isError true for errored IToolResultInputOutputDetails', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: true
			};
			const result = getResultDetailsDescription(details);
			assert.strictEqual(result.isError, true);
		});
	});

	suite('getToolInvocationA11yDescription', () => {
		test('returns invocation message when not complete', () => {
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				undefined,
				false
			);
			assert.strictEqual(result, 'Creating file');
		});

		test('returns past tense message when complete', () => {
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				undefined,
				true
			);
			assert.strictEqual(result, 'Created file');
		});

		test('includes tool-specific data description', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: { original: 'npm test' },
				language: 'bash'
			};
			const result = getToolInvocationA11yDescription(
				'Running command',
				'Ran command',
				terminalData,
				undefined,
				true
			);
			assert.ok(result.includes('Ran command'));
			assert.ok(result.includes('npm test'));
		});

		test('includes files from result details when complete', () => {
			const uris = [
				URI.file('/path/to/file1.ts'),
				URI.file('/path/to/file2.ts')
			];
			const result = getToolInvocationA11yDescription(
				'Creating files',
				'Created files',
				undefined,
				uris,
				true
			);
			assert.ok(result.includes('Created files'));
			assert.ok(result.includes('file1.ts'));
			assert.ok(result.includes('file2.ts'));
		});

		test('includes error status when result has error', () => {
			const details = {
				input: 'create_file path=/test/file.ts',
				output: [],
				isError: true
			};
			const result = getToolInvocationA11yDescription(
				'Creating file',
				'Created file',
				undefined,
				details,
				true
			);
			assert.ok(result.includes('Errored'));
		});

		test('does not show input when tool-specific data is provided', () => {
			const terminalData: IChatTerminalToolInvocationData = {
				kind: 'terminal',
				commandLine: { original: 'npm test' },
				language: 'bash'
			};
			const details = {
				input: 'some redundant input',
				output: [],
				isError: false
			};
			const result = getToolInvocationA11yDescription(
				'Running command',
				'Ran command',
				terminalData,
				details,
				true
			);
			// Should have tool-specific data but not the "Input:" label
			assert.ok(result.includes('npm test'));
			assert.ok(!result.includes('Input:'));
		});

		test('shows input when no tool-specific data', () => {
			const details = {
				input: 'apply_patch file=/test/file.ts',
				output: [],
				isError: false
			};
			const result = getToolInvocationA11yDescription(
				'Applying patch',
				'Applied patch',
				undefined,
				details,
				true
			);
			assert.ok(result.includes('Applied patch'));
			assert.ok(result.includes('Input:'));
			assert.ok(result.includes('apply_patch'));
		});

		test('handles all parts together', () => {
			const subagentData: IChatSubagentToolInvocationData = {
				kind: 'subagent',
				agentName: 'CodeReviewer',
				description: 'Reviewing code changes'
			};
			const uris = [URI.file('/src/test.ts')];
			const result = getToolInvocationA11yDescription(
				'Starting code review',
				'Completed code review',
				subagentData,
				uris,
				true
			);
			assert.ok(result.includes('Completed code review'));
			assert.ok(result.includes('CodeReviewer'));
			assert.ok(result.includes('Reviewing code changes'));
			assert.ok(result.includes('test.ts'));
		});
	});

	suite('getProvider', () => {
		test('scheduled messages expose full content and actions and restore their focused row', async () => {
			const instantiationService = store.add(new TestInstantiationService());
			let invoked = false;
			const request: IChatScheduledRequestViewModel = {
				kind: 'scheduledRequest', id: 'later', dataId: 'later:1', sessionResource: URI.parse('chat:/session'),
				isComplete: true, currentRenderedHeight: undefined, text: 'Follow up', description: 'Tomorrow at 10:00 AM',
				attachments: ['notes.txt'], actions: [toAction({ id: 'sendNow', label: 'Send Now', run: () => { invoked = true; } })],
			};
			let restored = false;
			const widget = upcastPartial<IChatWidget>({
				hasInputFocus: () => false, getFocus: () => request,
				focus: item => { restored = item === request; },
			});
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ lastFocusedWidget: widget }));
			instantiationService.stub(IStorageService, store.add(new TestStorageService()));
			const provider = store.add(instantiationService.invokeFunction(accessor => new ChatResponseAccessibleView().getProvider(accessor))!);
			assert.ok(provider instanceof AccessibleContentProvider && provider.actions);
			await provider.actions[0].run();
			provider.onClose();
			assert.deepStrictEqual({ content: provider.provideContent(), invoked, restored }, {
				content: 'Tomorrow at 10:00 AM\nFollow up\nAttachments: notes.txt', invoked: true, restored: true,
			});
		});

		test('reads the focused artifact action snapshot and restores focus to its request', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const presentation = createTestArtifactRequestPresentation();
			const request = upcastPartial<IChatRequestViewModel>({
				message: { text: 'Model-facing instructions', parts: [] },
				isSystemInitiated: true, requestSource: 'artifactIntegration', artifactRequest: presentation,
			});
			let restored = false;
			const widget = upcastPartial<IChatWidget>({
				hasInputFocus: () => false, getFocus: () => request,
				focus: item => { restored = item === request; },
			});
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ lastFocusedWidget: widget }));
			instantiationService.stub(IStorageService, store.add(new TestStorageService()));
			const provider = instantiationService.invokeFunction(accessor => new ChatResponseAccessibleView().getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			provider.onClose();
			assert.deepStrictEqual({ content: provider.provideContent(), restored }, {
				content: 'Analyse Scorecard: Experiment 42\nSearch ranking\nScorecard\nResults are ready to analyse.\nState: Completed\nSuccessful searches: +2.3%',
				restored: true,
			});
		});

		/** The lines that the Accessible View shows for a response made of the given Markdown, or of the given parts. */
		function responseLines(content: string | IResponse['value'], configurationService: TestConfigurationService, rendersNativeComponents: boolean, isFiltered = false): string[] {
			const responseItem = upcastPartial<IChatResponseViewModel>({
				response: upcastPartial<IResponse>({ value: typeof content === 'string' ? [{ kind: 'markdownContent', content: new MarkdownString(content) }] : content }),
				model: upcastPartial<IChatResponseModel>({ onDidChange: Event.None }),
				errorDetails: isFiltered ? { message: 'Filtered', responseIsFiltered: true } : undefined,
				setVote: () => { },
			});
			const instantiationService = store.add(new TestInstantiationService());
			const widget = upcastPartial<IChatWidget>({
				rendersNativeComponents,
				hasInputFocus: () => false, getFocus: () => responseItem,
			});
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ lastFocusedWidget: widget }));
			instantiationService.stub(IStorageService, store.add(new TestStorageService()));
			instantiationService.stub(IConfigurationService, configurationService);
			const provider = instantiationService.invokeFunction(accessor => new ChatResponseAccessibleView().getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			return provider.provideContent().split('\n');
		}

		test('presents a native visual as its text alternative only where it is rendered, and its markup everywhere else', async () => {
			const markdown = [
				'The incremental build is faster.',
				'',
				'```vscode-ui',
				'<Columns>',
				'  <Metric label="Full build" value="12.4 s" />',
				'  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />',
				'</Columns>',
				'<BarChart title="Build duration" unit="s"><Bar label="Full" value="12.4" /><Bar label="Incremental" value="1.8" /></BarChart>',
				'```',
				'',
				'```vscode-ui',
				'<Chart />',
				'```',
				'',
				'```ts',
				'const cached = true;',
				'```',
			].join('\n');
			const configurationService = new TestConfigurationService({ [ChatConfiguration.NativeComponentsEnabled]: true });
			const content = (rendersNativeComponents: boolean) => responseLines(markdown, configurationService, rendersNativeComponents);
			const source = [
				'The incremental build is faster.',
				'```',
				'<Columns>',
				'  <Metric label="Full build" value="12.4 s" />',
				'  <Metric label="Incremental build" value="1.8 s" delta="-85%" tone="positive" />',
				'</Columns>',
				'<BarChart title="Build duration" unit="s"><Bar label="Full" value="12.4" /><Bar label="Incremental" value="1.8" /></BarChart>',
				'```',
				'```',
				'<Chart />',
				'```',
				'```',
				'const cached = true;',
				'```',
			];
			const described = [
				'The incremental build is faster.',
				'Full build: 12.4 s',
				'Incremental build: 1.8 s (-85%, Positive)',
				'Bar chart: Build duration',
				'Full: 12.4 s',
				'Incremental: 1.8 s',
				'```',
				'<Chart />',
				'```',
				'```',
				'const cached = true;',
				'```',
			];

			const withoutRenderer = content(true);
			store.add(registerChatNativeComponentsRenderer(chatNativeComponentsRenderer));
			const rendered = content(true);
			const otherSurface = content(false);
			const filtered = responseLines(markdown, configurationService, true, true);
			await configurationService.setUserConfiguration(ChatConfiguration.NativeComponentsEnabled, false);
			const settingOff = content(true);
			await configurationService.setUserConfiguration(ChatConfiguration.NativeComponentsEnabled, true);
			await configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);
			const aiDisabled = content(true);
			assert.deepStrictEqual({ withoutRenderer, rendered, otherSurface, filtered, settingOff, aiDisabled }, { withoutRenderer: source, rendered: described, otherSurface: source, filtered: ['Filtered', ...source], settingOff: source, aiDisabled: source });
		});

		test('presents a visual inside a list item or a block quote as its text alternative too', () => {
			const markdown = [
				'- Results',
				'',
				'  ```vscode-ui',
				'  <Metric label="Passing" value="128" />',
				'  ```',
				'- Rerun with `--all`',
				'',
				'> Status',
				'>',
				'> ```vscode-ui',
				'> <Badge tone="positive">Stable</Badge>',
				'> ```',
			].join('\n');
			store.add(registerChatNativeComponentsRenderer(chatNativeComponentsRenderer));
			assert.deepStrictEqual(
				responseLines(markdown, new TestConfigurationService({ [ChatConfiguration.NativeComponentsEnabled]: true }), true),
				['Results', 'Passing: 128', 'Rerun with `--all`', 'Status', 'Stable (Positive)']);
		});

		test('presents a visual whose fence is split by a reference as the transcript joins it', () => {
			const reference = URI.file('/repo/src/parser.ts');
			const parts: IResponse['value'] = [
				{ kind: 'markdownContent', content: new MarkdownString('Changed files:\n\n```vscode-ui\n<Table>\n<Column>File</Column><Column align="end">Lines</Column>\n<Row><Cell>') },
				{ kind: 'inlineReference', inlineReference: reference },
				{ kind: 'markdownContent', content: new MarkdownString('</Cell><Cell>42</Cell></Row>\n</Table>\n```\n\nSee ') },
				{ kind: 'inlineReference', inlineReference: reference },
				{ kind: 'markdownContent', content: new MarkdownString(' for the rest.') },
			];
			const configurationService = new TestConfigurationService({ [ChatConfiguration.NativeComponentsEnabled]: true });
			const references = (lines: string[]) => lines.filter(line => line.includes('parser.ts'));
			const withoutRenderer = references(responseLines(parts, configurationService, true));
			store.add(registerChatNativeComponentsRenderer(chatNativeComponentsRenderer));
			assert.deepStrictEqual({
				rendered: responseLines(parts, configurationService, true),
				withoutRenderer,
				filtered: references(responseLines(parts, configurationService, true, true)),
			}, {
				rendered: ['Changed files:', 'Table', 'File | Lines', 'parser.ts | 42', 'See parser.ts for the rest.'],
				// Where no visual is rendered, the parts are read one by one as before.
				withoutRenderer: ['parser.ts (/repo/src/parser.ts)', 'parser.ts (/repo/src/parser.ts)'],
				filtered: ['parser.ts (/repo/src/parser.ts)', 'parser.ts (/repo/src/parser.ts)'],
			});
		});

		test('omits thinking content when disabled in storage', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());
			storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, false, StorageScope.PROFILE, StorageTarget.USER);

			const responseItem = {
				response: { value: [{ kind: 'thinking', value: 'Hidden reasoning' }, { kind: 'markdownContent', content: new MarkdownString('Response content') }] },
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const items = [responseItem];
			let focusedItem: unknown = responseItem;

			const widget = {
				hasInputFocus: () => false,
				focusResponseItem: () => { focusedItem = responseItem; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('Response content'));
			assert.ok(!content.includes('Thinking: Hidden reasoning'));
		});

		test('prefers the latest response when focus is on a queued request', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());
			const responseItem = {
				response: { value: [{ kind: 'thinking', value: 'Reasoning' }, { kind: 'markdownContent', content: new MarkdownString('Response content') }] },
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const queuedRequest = { message: 'Queued request' };
			const items = [responseItem, queuedRequest];
			let focusedItem: unknown = queuedRequest;

			const widget = {
				hasInputFocus: () => true,
				focusResponseItem: () => { focusedItem = queuedRequest; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('Response content'));
			assert.ok(content.includes('Thinking: Reasoning'));
		});

		test('includes file path for URI inline references', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());

			const inlineReferenceUri = URI.file('/path/to/index.ts');
			const responseItem = {
				response: {
					value: [
						{ kind: 'markdownContent', content: new MarkdownString('See file ') },
						{ kind: 'inlineReference', inlineReference: inlineReferenceUri, name: 'index.ts' },
						{ kind: 'markdownContent', content: new MarkdownString(' for details') }
					]
				},
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const items = [responseItem];
			let focusedItem: unknown = responseItem;

			const widget = {
				hasInputFocus: () => false,
				focusResponseItem: () => { focusedItem = responseItem; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('index.ts'));
			assert.ok(content.includes(inlineReferenceUri.path));
			assert.ok(content.includes('See file'));
			assert.ok(content.includes('for details'));
		});

		test('includes file path and line number for Location inline references', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());

			const fileLocation: Location = {
				uri: URI.file('/src/app/main.ts'),
				range: new Range(42, 1, 42, 20)
			};

			const responseItem = {
				response: {
					value: [
						{ kind: 'markdownContent', content: new MarkdownString('Error at ') },
						{ kind: 'inlineReference', inlineReference: fileLocation, name: 'main.ts' }
					]
				},
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const items = [responseItem];
			let focusedItem: unknown = responseItem;

			const widget = {
				hasInputFocus: () => false,
				focusResponseItem: () => { focusedItem = responseItem; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('main.ts'));
			assert.ok(content.includes(`${fileLocation.uri.path}:42`));
		});

		test('uses basename as name for URI inline references without explicit name', () => {
			const instantiationService = store.add(new TestInstantiationService());
			const storageService = store.add(new TestStorageService());

			const inlineReferenceUri = URI.file('/workspace/src/utils.ts');
			const responseItem = {
				response: {
					value: [
						{ kind: 'inlineReference', inlineReference: inlineReferenceUri }
					]
				},
				model: { onDidChange: Event.None },
				setVote: () => undefined
			};
			const items = [responseItem];
			let focusedItem: unknown = responseItem;

			const widget = {
				hasInputFocus: () => false,
				focusResponseItem: () => { focusedItem = responseItem; },
				getFocus: () => focusedItem,
				focus: (item: unknown) => { focusedItem = item; },
				viewModel: { getItems: () => items }
			} as unknown as IChatWidget;

			const widgetService = {
				_serviceBrand: undefined,
				lastFocusedWidget: widget,
				onDidAddWidget: Event.None,
				onDidBackgroundSession: Event.None,
				reveal: async () => true,
				revealWidget: async () => widget,
				getAllWidgets: () => [widget],
				getWidgetByInputUri: () => widget,
				openSession: async () => widget,
				getWidgetBySessionResource: () => widget
			} as unknown as IChatWidgetService;

			instantiationService.stub(IChatWidgetService, widgetService);
			instantiationService.stub(IStorageService, storageService);

			const accessibleView = new ChatResponseAccessibleView();
			const provider = instantiationService.invokeFunction(accessor => accessibleView.getProvider(accessor));
			assert.ok(provider);
			store.add(provider);
			const content = provider.provideContent();
			assert.ok(content.includes('utils.ts'));
			assert.ok(content.includes(inlineReferenceUri.path));
		});
	});
});
