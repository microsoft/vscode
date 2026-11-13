/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { alert, setARIAContainer } from '../../../../../../../base/browser/ui/aria/aria.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { AccessibilityWorkbenchSettingId } from '../../../../../accessibility/browser/accessibilityConfiguration.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ACTION_ID_FOCUS_CHAT_CONFIRMATION, registerChatAccessibilityActions } from '../../../../browser/actions/chatAccessibilityActions.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatMcpAuthenticationContentPart } from '../../../../browser/widget/chatContentParts/chatMcpAuthenticationContentPart.js';
import { IChatMcpAuthenticationRequired, IChatMcpAuthenticationRequiredServer } from '../../../../common/chatService/chatService.js';
import { IChatRendererContent, IChatResponseViewModel, IChatViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';

suite('ChatMcpAuthenticationContentPart', () => {
	type McpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;

	let accessibilityActions: IDisposable;
	suiteSetup(() => accessibilityActions = registerChatAccessibilityActions());
	suiteTeardown(() => accessibilityActions.dispose());

	setup(() => {
		disposables = store.add(new DisposableStore());
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
	});

	function server(id: string, name: string, status: McpServerStatus, enabled = true, displayName?: string): McpServer {
		return new class extends mock<McpServer>() {
			override readonly id = id;
			override readonly name = name;
			override readonly displayName = displayName;
			override readonly status = status;
			override readonly enabled = enabled;
		}();
	}

	function createPart(dataServers: readonly IChatMcpAuthenticationRequiredServer[], liveServers: readonly McpServer[], authenticate = async (_serverId: string) => true, onDidAuthenticate = () => { }, onDidRemoveFocusedAction = () => { }) {
		const changed = disposables.add(new Emitter<void>());
		let currentServers = liveServers;
		const authenticated: string[] = [];
		instantiationService.stub(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = changed.event;
			override getMcpServers() { return currentServers; }
			override async authenticateMcpServer(_sessionResource: URI, serverId: string) {
				authenticated.push(serverId);
				return authenticate(serverId);
			}
		}());
		const servers = observableValue('servers', dataServers);
		const data: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers,
			isUsed: false,
		};
		const context = upcastPartial<IChatContentPartRenderContext>({
			content: [],
			contentIndex: -1,
			element: upcastPartial<IChatResponseViewModel>({ sessionResource: URI.revive(data.sessionResource) }),
		});
		const part = disposables.add(instantiationService.createInstance(ChatMcpAuthenticationContentPart, data, context, { onDidAuthenticate, onDidRemoveFocusedAction }));
		return {
			part,
			data,
			authenticated,
			servers,
			setLiveServers: (servers: readonly McpServer[]) => {
				currentServers = servers;
				changed.fire();
			},
		};
	}

	function attach(part: ChatMcpAuthenticationContentPart): void {
		document.body.appendChild(part.domNode);
		disposables.add(toDisposable(() => part.domNode.remove()));
	}

	for (const resolved of [false, true]) {
		test(`Focus Chat Confirmation ${resolved ? 'ignores a resolved' : 'reveals and toggles focus for a non-blocking'} MCP authentication prompt in an earlier response`, async () => {
			const { part, data } = createPart(
				[{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }],
				[server('mcp', 'MCP', McpServerStatus.AuthRequired)],
			);
			attach(part);
			data.isUsed = resolved;
			const input = document.createElement('button');
			document.body.appendChild(input);
			disposables.add(toDisposable(() => input.remove()));
			const response = upcastPartial<IChatResponseViewModel>({
				setVote: () => { },
				response: upcastPartial<IChatResponseViewModel['response']>({ value: [data] }),
			});
			const laterResponse = upcastPartial<IChatResponseViewModel>({
				setVote: () => { },
				response: upcastPartial<IChatResponseViewModel['response']>({ value: [] }),
			});
			const revealed: IChatResponseViewModel[] = [];
			const widget = upcastPartial<IChatWidget>({
				domNode: part.domNode,
				viewModel: upcastPartial<IChatViewModel>({
					model: upcastPartial<IChatModel>({ requestNeedsInput: observableValue('needsInput', undefined) }),
					getItems: () => [response, laterResponse],
				}),
				reveal: item => {
					assert.strictEqual(item, response);
					revealed.push(response);
				},
				focusInput: () => input.focus(),
			});
			instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getAllWidgets: () => [widget] }));
			const command = CommandsRegistry.getCommand(ACTION_ID_FOCUS_CHAT_CONFIRMATION);
			assert.ok(command);
			input.focus();
			await instantiationService.invokeFunction(command.handler);
			const focusedConfirmation = document.activeElement === part.domNode.querySelector('.chat-confirmation-widget-container');
			await instantiationService.invokeFunction(command.handler);

			assert.deepStrictEqual({
				focusedConfirmation,
				focusedInput: document.activeElement === input,
				reveals: revealed.length,
			}, {
				focusedConfirmation: !resolved,
				focusedInput: true,
				reveals: resolved ? 0 : 2,
			});
		});
	}

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		test(`${key === ' ' ? 'Space' : key} activates the confirmation button once and permits retry after unsuccessful authentication`, async () => {
			const authentication = new DeferredPromise<boolean>();
			let fallbackCount = 0;
			const { part, authenticated } = createPart(
				[{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }],
				[server('mcp', 'MCP', McpServerStatus.AuthRequired)],
				() => authentication.p,
				undefined,
				() => fallbackCount++,
			);
			attach(part);
			const button = part.domNode.querySelector<HTMLElement>('.chat-confirmation-widget2 .monaco-button');
			assert.ok(button);
			button.focus();
			const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true });
			button.dispatchEvent(event);
			button.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true }));
			const pending = {
				authenticated: [...authenticated],
				text: part.domNode.textContent,
				hasButton: !!part.domNode.querySelector('[role="button"]'),
				defaultPrevented: event.defaultPrevented,
				fallbackCount,
			};
			authentication.complete(false);
			await timeout(0);
			const retry = part.domNode.querySelector<HTMLElement>('.monaco-button');
			assert.ok(retry);
			retry.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
			await timeout(0);

			assert.deepStrictEqual({ pending, authenticated }, {
				pending: {
					authenticated: ['mcp'],
					text: 'Authenticating MCP...',
					hasButton: false,
					defaultPrevented: true,
					fallbackCount: 1,
				},
				authenticated: ['mcp', 'mcp'],
			});
		});
	}

	test('announces the dedicated authentication prompt when verbose progress updates are enabled', async () => {
		const ariaHost = document.createElement('div');
		document.body.appendChild(ariaHost);
		disposables.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		await configurationService.setUserConfiguration(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates, true);
		const { part, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack', name: 'Slack', resource: 'https://slack.example.com' },
				{ id: 'github', name: 'GitHub', resource: 'https://github.example.com' },
			],
			[server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)],
		);
		const announcement = () => [...ariaHost.querySelectorAll('.monaco-alert')].map(element => element.textContent).find(Boolean);
		const initial = announcement();
		await configurationService.setUserConfiguration(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates, false);
		setLiveServers([server('slack', 'Slack', McpServerStatus.AuthRequired)]);
		const muted = announcement();
		await configurationService.setUserConfiguration(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates, true);
		setLiveServers([server('github', 'GitHub', McpServerStatus.AuthRequired)]);

		assert.deepStrictEqual({
			initial,
			muted,
			updated: announcement(),
			visible: part.domNode.textContent?.trim(),
		}, {
			initial: 'The MCP server Azure ExP requires authentication. Use the Authenticate button to continue.',
			muted: 'The MCP server Azure ExP requires authentication. Use the Authenticate button to continue.',
			updated: 'The MCP server GitHub requires authentication. Use the Authenticate button to continue.',
			visible: 'MCP authentication requiredThe MCP server GitHub requires authentication.Authenticate',
		});
	});

	test('does not replace the authentication outcome announcement when restoring the retry button', async () => {
		const ariaHost = document.body.appendChild(document.createElement('div'));
		disposables.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		await configurationService.setUserConfiguration(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates, true);
		const { part } = createPart(
			[{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }],
			[server('mcp', 'MCP', McpServerStatus.AuthRequired)],
			async () => {
				alert('Unable to sign in to MCP.');
				return false;
			},
		);
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		await timeout(0);

		assert.deepStrictEqual({
			announcement: [...ariaHost.querySelectorAll('.monaco-alert')].map(element => element.textContent).join(''),
			retryAvailable: !!part.domNode.querySelector('[role="button"]'),
		}, { announcement: 'Unable to sign in to MCP.', retryAvailable: true });
	});

	test('updates stale server names and authentication targets from live pending servers', async () => {
		const { part, data, authenticated, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
			],
			[
				server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
				server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
				server('slack', 'Slack', McpServerStatus.Ready),
			],
		);

		const initialText = part.domNode.textContent?.trim();
		const initialAction = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(initialAction);
		setLiveServers([
			server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
			server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
			server('slack', 'Slack', McpServerStatus.Ready),
		]);
		const actionAfterNoEffectiveChange = part.domNode.querySelector<HTMLElement>('[role="button"]');
		setLiveServers([
			server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
			server('slack-gh', 'Slack GitHub', McpServerStatus.Ready),
			server('slack', 'Slack', McpServerStatus.Ready),
		]);
		const singularText = part.domNode.textContent?.trim();
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		await timeout(0);
		setLiveServers([]);

		assert.deepStrictEqual({
			initialText,
			singularText,
			initialActionIsRetained: initialAction === actionAfterNoEffectiveChange,
			text: part.domNode.textContent,
			authenticated,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		}, {
			initialText: 'MCP authentication requiredThe MCP servers Azure ExP, Slack GitHub require authentication.Authenticate',
			singularText: 'MCP authentication requiredThe MCP server Azure ExP requires authentication.Authenticate',
			initialActionIsRetained: true,
			text: '',
			authenticated: ['azure-exp'],
			hidden: true,
			isUsed: true,
		});
	});

	test('uses the presentation name without changing the authentication target', async () => {
		const runtimeServerId = 'github-copilot-connector-94d26095770df60673dd';
		const { part, authenticated } = createPart(
			[{ id: runtimeServerId, name: runtimeServerId, resource: 'https://api.github.com' }],
			[server(runtimeServerId, runtimeServerId, McpServerStatus.AuthRequired, true, 'GitHub')],
		);

		const text = part.domNode.textContent?.trim();
		part.domNode.querySelector<HTMLElement>('[role="button"]')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			text,
			authenticated,
		}, {
			text: 'MCP authentication requiredThe MCP server GitHub (Connector) requires authentication.Authenticate',
			authenticated: [runtimeServerId],
		});
	});

	test('remains unused initially and completes once when servers are populated then resolved', () => {
		let completionCount = 0;
		const { part, data, servers, setLiveServers } = createPart([], [], undefined, () => completionCount++);
		const initial = {
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		};
		servers.set([{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }], undefined);
		setLiveServers([server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)]);
		setLiveServers([]);
		setLiveServers([]);

		assert.deepStrictEqual({
			initial,
			text: part.domNode.textContent,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
			completionCount,
		}, {
			initial: { hidden: true, isUsed: false },
			text: '',
			hidden: true,
			isUsed: true,
			completionCount: 1,
		});
	});

	test('does not render a disabled server that retains an authentication-required status', () => {
		const { part, data } = createPart(
			[{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }],
			[server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired, false)],
		);

		assert.deepStrictEqual({
			hasAction: !!part.domNode.querySelector('[role="button"]'),
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		}, {
			hasAction: false,
			hidden: true,
			isUsed: false,
		});
	});

	for (const state of ['disabled', 'ready'] as const) {
		test(`skips a queued server that becomes ${state} during another authentication`, async () => {
			const { part, authenticated, setLiveServers } = createPart(
				[
					{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
					{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
				],
				[
					server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
					server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
				],
				async serverId => {
					if (serverId === 'azure-exp') {
						setLiveServers([
							server('azure-exp', 'Azure ExP', McpServerStatus.Ready),
							server('slack-gh', 'Slack GitHub', state === 'ready' ? McpServerStatus.Ready : McpServerStatus.AuthRequired, state !== 'disabled'),
						]);
					}
					return true;
				},
			);
			const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
			assert.ok(action);
			action.click();
			await timeout(0);

			assert.deepStrictEqual(authenticated, ['azure-exp']);
		});
	}

	test('preserves Authenticate focus when a remaining server still requires authentication', () => {
		const { part, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
			],
			[
				server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
				server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
			],
		);
		attach(part);
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.focus();

		setLiveServers([server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)]);

		assert.strictEqual(document.activeElement, part.domNode.querySelector('[role="button"]'));
	});

	test('moves focus to the supplied fallback when the focused Authenticate action is removed', () => {
		let fallbackCount = 0;
		const fallback = document.createElement('button');
		document.body.appendChild(fallback);
		disposables.add(toDisposable(() => fallback.remove()));
		const { part, setLiveServers } = createPart(
			[{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }],
			[server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)],
			undefined,
			undefined,
			() => {
				fallbackCount++;
				fallback.focus();
			},
		);
		attach(part);
		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.focus();

		setLiveServers([]);

		assert.deepStrictEqual({
			activeElement: document.activeElement === fallback,
			fallbackCount,
		}, {
			activeElement: true,
			fallbackCount: 1,
		});
	});

	test('does not move focus when a server update occurs while focus is outside the part', () => {
		let fallbackCount = 0;
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add(toDisposable(() => outside.remove()));
		const { part, setLiveServers } = createPart(
			[
				{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' },
				{ id: 'slack-gh', name: 'Slack GitHub', resource: 'https://slack.example.com' },
			],
			[
				server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired),
				server('slack-gh', 'Slack GitHub', McpServerStatus.AuthRequired),
			],
			undefined,
			undefined,
			() => fallbackCount++,
		);
		attach(part);
		outside.focus();

		setLiveServers([server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)]);

		assert.deepStrictEqual({
			activeElement: document.activeElement === outside,
			fallbackCount,
		}, {
			activeElement: true,
			fallbackCount: 0,
		});
	});

	test('keeps the authenticating progress message while live state changes', async () => {
		const authentication = new DeferredPromise<boolean>();
		const { part, data, setLiveServers } = createPart(
			[{ id: 'azure-exp', name: 'Azure Experimental', resource: 'https://azure.example.com' }],
			[server('azure-exp', 'Azure ExP', McpServerStatus.AuthRequired)],
			() => authentication.p,
		);

		const action = part.domNode.querySelector<HTMLElement>('[role="button"]');
		assert.ok(action);
		action.click();
		setLiveServers([]);

		const duringAuthentication = {
			text: part.domNode.textContent,
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		};
		authentication.complete(true);
		await timeout(0);

		assert.deepStrictEqual({
			duringAuthentication,
			afterAuthentication: {
				text: part.domNode.textContent,
				hidden: part.domNode.style.display === 'none',
				isUsed: data.isUsed,
			},
		}, {
			duringAuthentication: {
				text: 'Authenticating Azure ExP...',
				hidden: false,
				isUsed: false,
			},
			afterAuthentication: {
				text: '',
				hidden: true,
				isUsed: true,
			},
		});
	});

	test('hasSameContent matches only the same kind', () => {
		const { part } = createPart([], []);

		assert.deepStrictEqual(
			[
				part.hasSameContent({ kind: 'mcpAuthenticationRequired' } as IChatRendererContent, [], null!),
				part.hasSameContent({ kind: 'mcpServersStartingSlow' } as IChatRendererContent, [], null!),
			],
			[true, false],
		);
	});
});
