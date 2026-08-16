/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ITabbedActionListShowOptions } from '../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { ChatSessionRoutingController, IChatSessionRoutingHost } from '../../../browser/sessionRouter/chatSessionRoutingController.js';
import { ChatRequestQueueKind, ChatSendResult, IChatService } from '../../../common/chatService/chatService.js';
import { ChatModeKind } from '../../../common/constants.js';
import { IChatSessionRoutingProvider, IChatSessionRoutingWorkspace, IChatSessionRoutingWorkspaceBrowseAction, IRoutableSession } from '../../../common/sessionRouter.js';

suite('ChatSessionRoutingController', () => {

	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('shows the selected folder and folder picker for multi-root new sessions', async () => {
		const clock = sinon.useFakeTimers();
		const vscode = folder('vscode', '/work/vscode', 0);
		const docs = folder('docs', '/work/docs', 1);
		const container = document.createElement('div');
		document.body.appendChild(container);
		let submitted = false;
		type FolderPickerItem =
			| { readonly id: string; readonly kind: 'workspace'; readonly folder: IWorkspaceFolder }
			| { readonly id: 'choose-folder'; readonly kind: 'choose' };
		let pickerItems: readonly IActionListItem<FolderPickerItem>[] | undefined;
		let pickerDelegate: IActionListDelegate<FolderPickerItem> | undefined;
		let pickerAnchor: HTMLElement | undefined;
		let pickerContainer: HTMLElement | undefined;
		let pickerOptions: IActionListOptions | undefined;
		const pickerVisibility: boolean[] = [];
		let folderDialogDefault: URI | undefined;
		const actionWidgetService = {
			show: <T,>(
				_user: string,
				_supportsPreview: boolean,
				items: readonly IActionListItem<T>[],
				delegate: IActionListDelegate<T>,
				anchor: HTMLElement,
				actionWidgetContainer: HTMLElement | undefined,
				_actionBarActions: undefined,
				_accessibilityProvider: unknown,
				listOptions: IActionListOptions,
			) => {
				pickerItems = items as readonly IActionListItem<FolderPickerItem>[];
				pickerDelegate = delegate as unknown as IActionListDelegate<FolderPickerItem>;
				pickerAnchor = anchor;
				pickerContainer = actionWidgetContainer;
				pickerOptions = listOptions;
			},
			hide: () => pickerDelegate?.onHide(),
		} as unknown as IActionWidgetService;
		const host = {
			widget: {
				inputEditor: {
					onDidChangeModelContent: Event.None,
					getValue: () => 'create a new session to update docs',
				},
				attachmentModel: {
					onDidChange: Event.None,
					attachments: [],
				},
				input: { setSubmitPending: () => { } },
				getSelectedModelRequestOptions: () => ({ userSelectedModelId: 'copilot/claude-opus-4.6' }),
				getModeRequestOptions: () => ({}),
			},
			getOwnSessionResource: () => undefined,
			getNewSessionTarget: () => AgentSessionProviders.AgentHostCopilot,
			getSelectedModelLabel: () => 'Claude Opus 4.6',
			onDidChangeActionWidgetVisibility: (visible: boolean) => pickerVisibility.push(visible),
			getActionWidgetContainer: () => container,
			getActionWidgetAnchor: (anchor: HTMLElement) => anchor,
			getActionWidgetAnchorPosition: () => AnchorPosition.BELOW,
			pickFolder: async (defaultUri: URI | undefined) => {
				folderDialogDefault = defaultUri;
				return URI.file('/outside/external-project');
			},
			placeBadge: (badge: HTMLElement) => container.appendChild(badge),
		} as unknown as IChatSessionRoutingHost;
		const workspaceContextService = {
			getWorkspace: () => ({ folders: [vscode, docs] }),
			getWorkspaceFolder: (resource: URI) => [vscode, docs].find(candidate => candidate.uri.toString() === resource.toString()),
		} as IWorkspaceContextService;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			{ sendRequest: async () => { submitted = true; return { kind: 'rejected' }; } } as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { } } as never,
			workspaceContextService,
			{ getDefaultFolder: () => undefined, setFolder: () => { } } as never,
			actionWidgetService,
			{ createInstance: () => ({ dispose: () => { } }) } as never,
		);

		await controller.handleSubmit('create a new session to update docs', undefined!);
		const label = container.querySelector<HTMLElement>('.chat-routing-badge-name');
		const model = container.querySelector<HTMLElement>('.chat-routing-badge-score');
		const changeFolder = container.querySelector<HTMLButtonElement>('.chat-routing-badge-folder-action');
		const countdown = container.querySelector<HTMLElement>('.chat-routing-badge-countdown');
		assert.deepStrictEqual({
			submitted,
			label: label?.textContent,
			model: model?.textContent,
			changeFolder: changeFolder?.textContent,
			countdown: countdown?.textContent,
			hasPopup: changeFolder?.getAttribute('aria-haspopup'),
		}, {
			submitted: false,
			label: 'New session in docs',
			model: 'Claude Opus 4.6',
			changeFolder: 'docs',
			countdown: 'sending in 5s',
			hasPopup: 'menu',
		});

		try {
			clock.tick(3_000);
			assert.strictEqual(countdown?.textContent, 'sending in 2s');
			changeFolder?.click();
			await Promise.resolve();
			await Promise.resolve();
			assert.strictEqual(countdown?.textContent, 'waiting for you');
			assert.strictEqual(changeFolder?.getAttribute('aria-expanded'), 'true');
			assert.strictEqual(pickerAnchor, changeFolder);
			assert.strictEqual(pickerContainer, container);
			assert.strictEqual(pickerOptions?.showFilter, true);
			assert.strictEqual(pickerOptions?.filterPlaceholder, 'Search folders');
			assert.strictEqual(pickerOptions?.focusFilterOnOpen, true);
			assert.strictEqual(pickerOptions?.anchorPosition, AnchorPosition.BELOW);
			assert.deepStrictEqual(pickerItems?.map(item => item.label), ['vscode', 'docs', 'Choose Folder…']);
			clock.tick(5_000);
			assert.strictEqual(countdown?.textContent, 'waiting for you');
			pickerDelegate?.onSelect(pickerItems![0].item!);
			await clock.tickAsync(0);
			assert.deepStrictEqual({
				label: label?.textContent,
				changeFolder: changeFolder?.textContent,
				expanded: changeFolder?.getAttribute('aria-expanded'),
				countdown: countdown?.textContent,
				pickerVisibility,
			}, {
				label: 'New session in vscode',
				changeFolder: 'vscode',
				expanded: 'false',
				countdown: 'sending in 2s',
				pickerVisibility: [true, false],
			});
			changeFolder?.click();
			await Promise.resolve();
			await Promise.resolve();
			const chooseFolder = pickerItems?.find(item => item.item?.kind === 'choose')?.item;
			assert.ok(chooseFolder);
			pickerDelegate?.onSelect(chooseFolder);
			await clock.tickAsync(0);
			assert.deepStrictEqual({
				label: label?.textContent,
				changeFolder: changeFolder?.textContent,
				folderDialogDefault: folderDialogDefault?.toString(),
				countdown: countdown?.textContent,
				pickerVisibility,
			}, {
				label: 'New session in external-project',
				changeFolder: 'external-project',
				folderDialogDefault: vscode.uri.toString(),
				countdown: 'sending in 2s',
				pickerVisibility: [true, false, true, false],
			});
			clock.tick(1_000);
			assert.strictEqual(countdown?.textContent, 'sending in 1s');
		} finally {
			controller.dispose();
			container.remove();
			clock.restore();
		}
	});

	test('shows the provider workspace picker with an empty workbench and dispatches the selected provider', async () => {
		const clock = sinon.useFakeTimers();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const localWorkspace: IChatSessionRoutingWorkspace = {
			uri: URI.file('/work/local'),
			providerId: 'local',
			group: 'Local',
			label: 'local',
			description: '~/work',
			icon: { id: 'folder' },
		};
		const githubWorkspace: IChatSessionRoutingWorkspace = {
			uri: URI.parse('github-remote-file://github/microsoft/vscode'),
			providerId: 'github',
			group: 'GitHub',
			label: 'microsoft/vscode',
			description: 'GitHub',
			icon: { id: 'github' },
		};
		const browseAction: IChatSessionRoutingWorkspaceBrowseAction = {
			id: 'provider:github:0',
			providerId: 'github',
			group: 'GitHub',
			label: 'Select...',
			icon: { id: 'folder-opened' },
		};
		type TestFolderPickerItem =
			| { readonly kind: 'providerWorkspace'; readonly workspace: IChatSessionRoutingWorkspace }
			| { readonly kind: 'providerBrowse'; readonly action: IChatSessionRoutingWorkspaceBrowseAction };
		let tabbedOptions: ITabbedActionListShowOptions<TestFolderPickerItem> | undefined;
		let tabbedVisible = false;
		const tabbedWidget = {
			get isVisible() { return tabbedVisible; },
			show: (options: ITabbedActionListShowOptions<TestFolderPickerItem>) => {
				tabbedOptions = options;
				tabbedVisible = true;
			},
			hide: () => {
				if (!tabbedVisible) {
					return;
				}
				tabbedVisible = false;
				tabbedOptions?.delegate.onHide();
			},
			dispose: () => { },
		};
		let input = 'create a new session to update docs';
		const pickerVisibility: boolean[] = [];
		const pickerErrors: string[] = [];
		const selectedProviders: string[] = [];
		let dispatchedTarget: { readonly folder?: URI; readonly providerId?: string } | undefined;
		const routingProvider: IChatSessionRoutingProvider = {
			getCandidateSessions: () => [],
			getNewSessionWorkspaceCatalog: () => ({
				groups: [{ id: 'Local' }, { id: 'GitHub' }, { id: 'Remote' }],
				workspaces: [localWorkspace, githubWorkspace],
				browseActions: [browseAction, {
					id: 'provider:remote:0',
					providerId: 'remote',
					group: 'Remote',
					label: 'Select...',
					icon: { id: 'remote' },
				}],
				defaultWorkspace: localWorkspace,
			}),
			selectNewSessionWorkspace: workspace => {
				selectedProviders.push(workspace.providerId);
			},
			browseNewSessionWorkspace: async () => undefined,
			resolveSessionResource: () => undefined,
			dispatchToSession: async () => ({ status: 'rejected' }),
			dispatchToNewSession: async target => {
				dispatchedTarget = target;
				return { status: 'sent', resource: URI.parse('session:/created') };
			},
			revealSession: async () => { },
		};
		const host = {
			widget: {
				inputEditor: {
					onDidChangeModelContent: Event.None,
					getValue: () => input,
					setValue: (value: string) => input = value,
				},
				attachmentModel: {
					onDidChange: Event.None,
					attachments: [],
					clear: () => { },
				},
				input: { setSubmitPending: () => { } },
				getSelectedModelRequestOptions: () => ({}),
				getModeRequestOptions: () => ({}),
			},
			getOwnSessionResource: () => undefined,
			getRoutingProvider: () => routingProvider,
			onDidChangeActionWidgetVisibility: (visible: boolean) => pickerVisibility.push(visible),
			getActionWidgetContainer: () => container,
			getActionWidgetAnchor: (anchor: HTMLElement) => anchor,
			getActionWidgetAnchorPosition: () => AnchorPosition.BELOW,
			placeBadge: (badge: HTMLElement) => container.appendChild(badge),
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { }, error: (message: string, error: Error) => pickerErrors.push(`${message}: ${error.message}`) } as never,
			{
				getWorkspace: () => ({ folders: [] }),
				getWorkspaceFolder: () => undefined,
			} as unknown as IWorkspaceContextService,
			{ getDefaultFolder: () => undefined, setFolder: () => { } } as never,
			{ hide: () => { } } as unknown as IActionWidgetService,
			{ createInstance: () => tabbedWidget } as never,
		);

		try {
			await controller.handleSubmit(input, ChatModeKind.Agent);
			const label = container.querySelector<HTMLElement>('.chat-routing-badge-name');
			const changeFolder = container.querySelector<HTMLButtonElement>('.chat-routing-badge-folder-action');
			assert.deepStrictEqual({
				label: label?.textContent,
				changeFolder: changeFolder?.textContent,
			}, {
				label: 'New session in local',
				changeFolder: 'local',
			});

			changeFolder?.click();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			assert.deepStrictEqual({
				tabs: tabbedOptions?.tabs.map(tab => tab.id),
				githubItems: tabbedOptions?.createActionList('GitHub').items.map(item => item.label),
				pickerVisibility,
				pickerErrors,
			}, {
				tabs: ['Local', 'GitHub', 'Remote'],
				githubItems: ['microsoft/vscode', '', 'Select...'],
				pickerVisibility: [true],
				pickerErrors: [],
			});

			const githubItem = tabbedOptions?.createActionList('GitHub').items
				.find(item => item.item?.kind === 'providerWorkspace')?.item;
			assert.ok(githubItem);
			tabbedOptions?.delegate.onSelect(githubItem!);
			await clock.tickAsync(0);
			assert.deepStrictEqual({
				label: label?.textContent,
				changeFolder: changeFolder?.textContent,
				selectedProviders,
				pickerVisibility,
				focused: document.activeElement === changeFolder,
			}, {
				label: 'New session in microsoft/vscode',
				changeFolder: 'microsoft/vscode',
				selectedProviders: ['github'],
				pickerVisibility: [true, false],
				focused: true,
			});

			container.querySelector<HTMLElement>('.chat-routing-badge-row')?.click();
			await Promise.resolve();
			await Promise.resolve();
			assert.deepStrictEqual({
				folder: dispatchedTarget?.folder?.toString(),
				providerId: dispatchedTarget?.providerId,
			}, {
				folder: githubWorkspace.uri.toString(),
				providerId: 'github',
			});
		} finally {
			controller.dispose();
			container.remove();
			clock.restore();
		}
	});

	test('uses provider workspace labels for mentions and the provider default', () => {
		const localWorkspace: IChatSessionRoutingWorkspace = {
			uri: URI.file('/work/local'),
			providerId: 'local',
			group: 'Local',
			label: 'local',
		};
		const githubWorkspace: IChatSessionRoutingWorkspace = {
			uri: URI.parse('github-remote-file://github/microsoft/vscode'),
			providerId: 'github',
			group: 'GitHub',
			label: 'microsoft/vscode',
		};
		const controller = new ChatSessionRoutingController(
			{} as IChatSessionRoutingHost,
			'test',
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { } } as never,
			{
				getWorkspace: () => ({ folders: [] }),
				getWorkspaceFolder: () => undefined,
			} as unknown as IWorkspaceContextService,
			{ getDefaultFolder: () => undefined } as never,
			undefined!,
			undefined!,
		);
		Reflect.set(controller, '_workspaceCatalog', {
			groups: [{ id: 'Local' }, { id: 'GitHub' }],
			workspaces: [localWorkspace, githubWorkspace],
			browseActions: [],
			defaultWorkspace: localWorkspace,
		});
		const resolveTarget = Reflect.get(controller, '_resolveNewSessionTarget') as (
			utterance: string,
			attachments: undefined,
			results: readonly [],
			candidates: readonly [],
		) => { folder?: URI; providerId?: string; label: string };

		assert.deepStrictEqual([
			resolveTarget.call(controller, 'update microsoft/vscode', undefined, [], []),
			resolveTarget.call(controller, 'start something new', undefined, [], []),
		].map(target => ({
			folder: target.folder?.toString(),
			providerId: target.providerId,
			label: target.label,
		})), [
			{
				folder: githubWorkspace.uri.toString(),
				providerId: 'github',
				label: 'New session in microsoft/vscode',
			},
			{
				folder: localWorkspace.uri.toString(),
				providerId: 'local',
				label: 'New session in local',
			},
		]);
		controller.dispose();
	});

	test('returns the stable request id for an immediately sent route', async () => {
		const resource = URI.parse('agent-host-copilotcli:/untitled-route');
		const chatService = {
			sendRequest: async (): Promise<ChatSendResult> => ({
				kind: 'sent',
				newSessionResource: URI.parse('agent-host-copilotcli:/durable-route'),
				data: {
					agent: undefined!,
					responseCreatedPromise: Promise.resolve({ requestId: 'stable-request-id' } as never),
					responseCompletePromise: Promise.resolve(),
				},
			}),
		} as unknown as IChatService;
		const controller = new ChatSessionRoutingController(
			{} as IChatSessionRoutingHost,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { } } as never,
			undefined!,
			{ setFolder: () => { } } as never,
			undefined!,
			undefined!,
		);
		const sendRequest = Reflect.get(controller, '_sendRequest') as (resource: URI, utterance: string, options: object) => Promise<{ status: string; resource?: URI; requestId?: string }>;

		const result = await sendRequest.call(controller, resource, 'Run the build', {});

		assert.deepStrictEqual({
			status: result.status,
			resource: result.resource?.toString(),
			requestId: result.requestId,
		}, {
			status: 'sent',
			resource: 'agent-host-copilotcli:/durable-route',
			requestId: 'stable-request-id',
		});
		controller.dispose();
	});

	test('dismisses routed pending input with the delivery badge', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const resource = URI.parse('agent-host-copilotcli:/dismissed-route');
		let dismissed: { resource: string; requestId: string | undefined } | undefined;
		const controller = new ChatSessionRoutingController(
			{
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
				onDidDismissRoute: (dismissedResource: URI, requestId: string | undefined) => {
					dismissed = { resource: dismissedResource.toString(), requestId };
				},
			} as unknown as IChatSessionRoutingHost,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			{ model: { getSession: () => undefined, onDidChangeSessions: Event.None } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const showDeliveryConfirmation = Reflect.get(controller, '_showDeliveryConfirmation') as (
			label: string,
			result: { status: 'sent'; resource: URI; requestId: string },
		) => void;

		showDeliveryConfirmation.call(controller, 'Session', { status: 'sent', resource, requestId: 'request-1' });
		container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')[1]?.click();

		assert.deepStrictEqual({
			dismissed,
			badgeConnected: !!container.querySelector('.chat-routing-badge'),
		}, {
			dismissed: { resource: resource.toString(), requestId: 'request-1' },
			badgeConnected: false,
		});

		controller.dispose();
		container.remove();
	});

	test('uses the provider reveal operation for delivery Open', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		let localOpenCount = 0;
		let providerOpenCount = 0;
		const controller = new ChatSessionRoutingController(
			{
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			{ openSession: () => localOpenCount++ } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const showDeliveryConfirmation = Reflect.get(controller, '_showDeliveryConfirmation') as (
			label: string,
			result: { status: 'sent'; resource: URI; reveal: () => Promise<void> },
		) => void;

		showDeliveryConfirmation.call(controller, 'Provider session', {
			status: 'sent',
			resource: URI.parse('agent-host-copilotcli:/provider-delivery'),
			reveal: async () => { providerOpenCount++; },
		});
		const actions = [...container.querySelectorAll<HTMLElement>('.chat-routing-badge-action')];
		actions[0]?.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			actions: actions.map(action => action.textContent),
			localOpenCount,
			providerOpenCount,
			badgeConnected: !!container.querySelector('.chat-routing-badge'),
		}, {
			actions: ['Open', 'Dismiss'],
			localOpenCount: 0,
			providerOpenCount: 1,
			badgeConnected: true,
		});

		controller.dispose();
		container.remove();
	});

	test('updates a provider delivery with its title and completed response', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const resource = URI.parse('session:/provider-delivery');
		const sessionsChanged = new Emitter<void>();
		let snapshot: IRoutableSession = {
			sessionId: 'provider:session',
			label: 'New session',
			status: 'working',
			lastActivity: 1,
		};
		const provider = {
			watchSession: (_resource: URI, listener: () => void) => sessionsChanged.event(listener),
			getSessionSnapshot: async () => snapshot,
		} as unknown as IChatSessionRoutingProvider;
		const controller = new ChatSessionRoutingController(
			{
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
				getRoutingProvider: () => provider,
			} as unknown as IChatSessionRoutingHost,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const showDeliveryConfirmation = Reflect.get(controller, '_showDeliveryConfirmation') as (
			label: string,
			result: { status: 'sent'; resource: URI; reveal: () => Promise<void> },
		) => void;

		showDeliveryConfirmation.call(controller, 'New session', {
			status: 'sent',
			resource,
			reveal: async () => { },
		});
		await Promise.resolve();
		assert.strictEqual(container.querySelector('.chat-routing-badge-label')?.textContent, 'In progress: New session');
		snapshot = {
			sessionId: 'provider:session',
			label: 'Update routing badge',
			status: 'idle',
			lastActivity: 2,
			lastResponse: 'Done. I created [megan.md](file:///megan.md).',
		};
		sessionsChanged.fire();
		await Promise.resolve();

		assert.deepStrictEqual({
			label: container.querySelector('.chat-routing-badge-label')?.textContent,
			link: container.querySelector('.chat-routing-badge-response-preview a')?.textContent,
		}, {
			label: 'Completed update routing badge:Done. I created megan.md.',
			link: 'megan.md',
		});
		const clearCompletedDeliveries = Reflect.get(controller, '_clearCompletedDeliveryConfirmations') as () => void;
		clearCompletedDeliveries.call(controller);
		assert.strictEqual(container.querySelector('.chat-routing-badge'), null);

		controller.dispose();
		sessionsChanged.dispose();
		container.remove();
	});

	test('keeps unresolved delivery rows when another request starts', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const controller = new ChatSessionRoutingController(
			{
				placeBadge: (badge: HTMLElement) => container.appendChild(badge),
			} as unknown as IChatSessionRoutingHost,
			'test',
			{ getSession: () => undefined } as unknown as IChatService,
			{ model: { getSession: () => undefined, onDidChangeSessions: Event.None } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const showDeliveryConfirmation = Reflect.get(controller, '_showDeliveryConfirmation') as (
			label: string,
			result: { status: 'sent'; resource: URI },
		) => void;

		showDeliveryConfirmation.call(controller, 'First session', { status: 'sent', resource: URI.parse('test:/first') });
		showDeliveryConfirmation.call(controller, 'Second session', { status: 'sent', resource: URI.parse('test:/second') });

		assert.deepStrictEqual(
			[...container.querySelectorAll('.chat-routing-badge-label')].map(element => element.textContent),
			['Sent to First session', 'Sent to Second session']
		);

		controller.dispose();
		container.remove();
	});

	test('keeps an existing session reference until a queued route completes', async () => {
		const resource = URI.parse('agent-host-copilotcli:/existing-route');
		let resolveQueued!: (result: ChatSendResult) => void;
		const queued = new Promise<ChatSendResult>(resolve => resolveQueued = resolve);
		let disposed = false;
		let sentOptions: { userSelectedModelId?: string; agentIdSilent?: string; queue?: ChatRequestQueueKind } | undefined;
		const chatService = {
			acquireOrLoadSession: async () => ({
				object: { sessionResource: resource },
				dispose: () => disposed = true,
			}),
			sendRequest: async (_resource: URI, _message: string, options: typeof sentOptions): Promise<ChatSendResult> => {
				sentOptions = options;
				return { kind: 'queued', requestId: 'queued-request', deferred: queued };
			},
		} as unknown as IChatService;
		const host = {
			widget: {
				inputEditor: { getValue: () => 'different draft', setValue: () => { } },
				attachmentModel: { attachments: [], clear: () => { } },
			},
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			chatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const dispatch = Reflect.get(controller, '_dispatchToSession') as (
			sessionId: string,
			input: string,
			attachmentIds: readonly string[],
			utterance: string,
			options: object,
			token: CancellationToken,
			notifyRoute: boolean,
		) => Promise<{ completion?: Promise<unknown> }>;

		const result = await dispatch.call(controller, resource.toString(), 'run', [], 'run', { userSelectedModelId: 'picked-model' }, CancellationToken.None, false);

		assert.strictEqual(disposed, false);
		assert.strictEqual(sentOptions?.userSelectedModelId, undefined);
		assert.strictEqual(sentOptions?.agentIdSilent, AgentSessionProviders.AgentHostCopilot);
		assert.strictEqual(sentOptions?.queue, ChatRequestQueueKind.Queued);
		resolveQueued({
			kind: 'sent',
			data: {
				agent: undefined!,
				responseCreatedPromise: Promise.resolve({ requestId: 'queued-request' } as never),
				responseCompletePromise: Promise.resolve(),
			},
		});
		await result.completion;
		assert.strictEqual(disposed, true);
		controller.dispose();
	});

	test('dispatches new sessions through the routing provider hook', async () => {
		const resource = URI.parse('agent-host-copilotcli:/new-route');
		const folder = URI.file('/workspace');
		let dispatched: { folder: URI | undefined; providerId: string | undefined; message: string; modelId: string | undefined } | undefined;
		let resolvedRequestId: string | undefined;
		let localCreateCount = 0;
		const routingProvider: IChatSessionRoutingProvider = {
			getCandidateSessions: () => [],
			resolveSessionResource: () => undefined,
			dispatchToSession: async () => ({ status: 'rejected' }),
			dispatchToNewSession: async (target, message, options) => {
				dispatched = { folder: target.folder, providerId: target.providerId, message, modelId: options.userSelectedModelId };
				return { status: 'sent', resource };
			},
			revealSession: async () => { },
		};
		const controller = new ChatSessionRoutingController(
			{
				widget: {
					inputEditor: { getValue: () => 'different draft', setValue: () => { } },
					attachmentModel: { attachments: [], clear: () => { } },
				},
				getRoutingProvider: () => routingProvider,
				onDidResolveRoute: (_resource: URI | undefined, _kind: 'existing_session' | 'new_session' | undefined, _voice: boolean | undefined, requestId: string | undefined) => {
					resolvedRequestId = requestId;
				},
			} as unknown as IChatSessionRoutingHost,
			'test',
			{
				startNewLocalSession: () => { localCreateCount++; return undefined; },
				getSession: () => ({ lastRequest: { id: 'durable-provider-request' } }),
			} as unknown as IChatService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { } } as never,
			undefined!,
			{ setFolder: () => { } } as never,
			undefined!,
			undefined!,
		);
		const dispatch = Reflect.get(controller, '_dispatchToNewSession') as (
			input: string,
			attachmentIds: readonly string[],
			utterance: string,
			options: object,
			token: CancellationToken,
			notifyRoute: boolean,
			target: { folder: URI; providerId: string },
		) => Promise<{ status: string; resource?: URI; reveal?: () => Promise<void> }>;

		const result = await dispatch.call(controller, 'run', [], 'run', { userSelectedModelId: 'model' }, CancellationToken.None, true, { folder, providerId: 'provider' });

		assert.deepStrictEqual({
			dispatched,
			localCreateCount,
			resolvedRequestId,
			result: { status: result.status, resource: result.resource?.toString(), hasReveal: !!result.reveal },
		}, {
			dispatched: { folder, providerId: 'provider', message: 'run', modelId: 'model' },
			localCreateCount: 0,
			resolvedRequestId: 'durable-provider-request',
			result: { status: 'sent', resource: resource.toString(), hasReveal: true },
		});
		controller.dispose();
	});

	test('uses provider candidates instead of the renderer-local catalog', async () => {
		let localResolveCount = 0;
		const routingProvider: IChatSessionRoutingProvider = {
			getCandidateSessions: () => [
				{ sessionId: 'provider:b', label: 'B' },
				{ sessionId: 'provider:a', label: 'A' },
				{ sessionId: 'provider:a', label: 'Duplicate A' },
			],
			resolveSessionResource: () => undefined,
			dispatchToSession: async () => ({ status: 'rejected' }),
			dispatchToNewSession: async () => ({ status: 'rejected' }),
			revealSession: async () => { },
		};
		const controller = new ChatSessionRoutingController(
			{
				getOwnSessionResource: () => undefined,
				getRoutingProvider: () => routingProvider,
			} as unknown as IChatSessionRoutingHost,
			'test',
			undefined!,
			{
				model: {
					resolve: async () => { localResolveCount++; },
					sessions: [],
				},
			} as never,
			{ getChatSessionContribution: () => ({ isReadOnly: false }) } as never,
			undefined!,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const collect = Reflect.get(controller, '_collectCandidateSessions') as (token: CancellationToken) => Promise<readonly { sessionId: string }[]>;

		const candidates = await collect.call(controller, CancellationToken.None);

		assert.deepStrictEqual(candidates.map(candidate => candidate.sessionId), [
			'provider:a',
			'provider:b',
		]);
		assert.strictEqual(localResolveCount, 0);
		controller.dispose();
	});

	test('dispatches provider candidates without using renderer-local chat services', async () => {
		const providerResource = URI.parse('agent-host-copilotcli:/provider');
		const providerCandidate = { sessionId: 'provider:session', label: 'Provider' };
		let input = 'Run tests';
		let clearedAttachments = false;
		let localAcquireCount = 0;
		let providerRevealCount = 0;
		let dispatched: { candidateId: string; message: string; modelId: string | undefined } | undefined;
		const callbacks: string[] = [];
		const routingProvider: IChatSessionRoutingProvider = {
			getCandidateSessions: () => [providerCandidate],
			resolveSessionResource: candidateId => candidateId === providerCandidate.sessionId ? providerResource : undefined,
			dispatchToSession: async (candidateId, message, options) => {
				dispatched = { candidateId, message, modelId: options.userSelectedModelId };
				return { status: 'sent', resource: providerResource, requestId: 'request-1' };
			},
			dispatchToNewSession: async () => ({ status: 'rejected' }),
			revealSession: async () => { providerRevealCount++; },
		};
		const host = {
			widget: {
				inputEditor: {
					getValue: () => input,
					setValue: (value: string) => input = value,
				},
				attachmentModel: {
					attachments: [],
					clear: () => clearedAttachments = true,
				},
			},
			getOwnSessionResource: () => undefined,
			getRoutingProvider: () => routingProvider,
			onWillDispatchRoute: () => callbacks.push('will'),
			onDidResolveRoute: () => callbacks.push('resolved'),
		} as unknown as IChatSessionRoutingHost;
		const controller = new ChatSessionRoutingController(
			host,
			'test',
			{
				acquireOrLoadSession: async () => {
					localAcquireCount++;
					return undefined;
				},
			} as unknown as IChatService,
			{ model: { resolve: async () => { }, sessions: [] } } as never,
			undefined!,
			undefined!,
			undefined!,
			{ warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const collect = Reflect.get(controller, '_collectCandidateSessions') as (token: CancellationToken) => Promise<unknown>;
		await collect.call(controller, CancellationToken.None);
		const dispatch = Reflect.get(controller, '_dispatchToSession') as (
			sessionId: string,
			input: string,
			attachmentIds: readonly string[],
			utterance: string,
			options: object,
			token: CancellationToken,
			notifyRoute: boolean,
		) => Promise<{ status: string; resource?: URI; reveal?: () => Promise<void> }>;

		const result = await dispatch.call(controller, providerCandidate.sessionId, input, [], 'Run tests', { userSelectedModelId: 'model' }, CancellationToken.None, true);
		await result.reveal?.();

		assert.deepStrictEqual({
			dispatched,
			localAcquireCount,
			providerRevealCount,
			callbacks,
			input,
			clearedAttachments,
			result: { status: result.status, resource: result.resource?.toString() },
		}, {
			dispatched: {
				candidateId: providerCandidate.sessionId,
				message: 'Run tests',
				modelId: 'model',
			},
			localAcquireCount: 0,
			providerRevealCount: 1,
			callbacks: ['will', 'resolved'],
			input: '',
			clearedAttachments: true,
			result: { status: 'sent', resource: providerResource.toString() },
		});
		controller.dispose();
	});

	test('does not send another provider session metadata to the Copilot router', async () => {
		const session = (providerType: AgentSessionProviders, path: string) => ({
			resource: URI.from({ scheme: providerType, path }),
			providerType,
			label: path,
			status: undefined,
			isArchived: () => false,
		});
		const agentSessionsService = {
			model: {
				resolve: async () => { },
				sessions: [
					session(AgentSessionProviders.AgentHostCopilot, '/copilot'),
					session(AgentSessionProviders.AgentHostClaude, '/claude'),
				],
			},
		};
		const controller = new ChatSessionRoutingController(
			{ getOwnSessionResource: () => undefined } as IChatSessionRoutingHost,
			'test',
			undefined!,
			agentSessionsService as never,
			{ getChatSessionContribution: () => ({ isReadOnly: false }) } as never,
			undefined!,
			undefined!,
			{ info: () => { }, warn: () => { } } as never,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
		);
		const collect = Reflect.get(controller, '_collectCandidateSessions') as (token: CancellationToken) => Promise<readonly { sessionId: string }[]>;

		const candidates = await collect.call(controller, CancellationToken.None);

		assert.deepStrictEqual(candidates.map(candidate => candidate.sessionId), ['agent-host-copilotcli:/copilot']);
		controller.dispose();
	});
});

function folder(name: string, path: string, index: number): IWorkspaceFolder {
	const uri = URI.file(path);
	return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
}
