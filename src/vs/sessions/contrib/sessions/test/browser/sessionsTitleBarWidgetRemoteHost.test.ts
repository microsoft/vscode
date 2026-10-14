/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mockObject, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/browser/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { BlockedSessionsIndicatorModel } from '../../browser/blockedSessionsIndicatorModel.js';
import { SessionActionFeedback } from '../../browser/sessionActionFeedback.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';

suite('SessionsTitleBarWidget - Remote Host', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const remoteProvider = upcastPartial<IAgentHostSessionsProvider>({
		id: 'agenthost-remote',
		label: 'Remote machine',
		remoteAddress: 'remote.example:1234',
	});
	const localProvider = upcastPartial<IAgentHostSessionsProvider>({
		id: LOCAL_AGENT_HOST_PROVIDER_ID,
		label: 'Local',
	});

	function createSession(providerId: string, workspace?: ISessionWorkspace): IActiveSession {
		return upcastPartial<IActiveSession>({
			providerId,
			workspace: constObservable(workspace),
			activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(workspace) })),
			isQuickChat: constObservable(!workspace),
		});
	}

	function createHarness(session: IActiveSession | undefined, sessionTitle?: string, remoteHost = remoteProvider) {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const providers = new Map([remoteHost, localProvider].map(provider => [provider.id, provider]));
		const onDidChangeProviders = store.add(new Emitter<ISessionsProvidersChangeEvent>());
		const onDidChangeSessionTypes = store.add(new Emitter<void>());
		const providersService = mockObject<ISessionsProvidersService>()({
			_serviceBrand: undefined,
			onDidChangeProviders: onDidChangeProviders.event,
		});
		providersService.getProvider.callsFake((id: string) => providers.get(id));
		const hoverService = mockObject<IHoverService>()({ _serviceBrand: undefined });
		hoverService.setupDelayedHover.returns(Disposable.None);
		const feedback = store.add(new SessionActionFeedback());
		const action = new SubmenuItemAction({
			submenu: Menus.TitleBarSessionTitle,
			title: 'Show Sessions',
		}, undefined, []);
		const widget = store.add(new SessionsTitleBarWidget(
			action,
			undefined,
			feedback,
			upcastPartial<BlockedSessionsIndicatorModel>({
				onDidRequestBlink: Event.None,
				blockedSessions: constObservable([]),
				requiresInputKind: constObservable(undefined),
			}),
			upcastPartial<ISessionsManagementService>({
				onDidChangeSessions: Event.None,
				onDidChangeSessionTypes: onDidChangeSessionTypes.event,
			}),
			upcastPartial<ISessionsService>({ activeSession }),
			providersService,
			upcastPartial<ICommandService>({}),
			upcastPartial<IContextViewService>({}),
			upcastPartial<IWorkbenchLayoutService>({}),
			upcastPartial<IInstantiationService>({}),
			new MockContextKeyService(),
			upcastPartial<IQuickInputService>({}),
			hoverService,
			upcastPartial<IBrowserWorkbenchEnvironmentService>({ sessionTitle }),
		));
		const container = $('div');
		widget.render(container);
		return {
			activeSession,
			container,
			providers,
			onDidChangeProviders,
			onDidChangeSessionTypes,
			presentation: () => ({
				text: container.textContent,
				ariaLabel: container.getAttribute('aria-label'),
				hover: container.contains(hoverService.setupDelayedHover.lastCall?.args[0])
					? hoverService.setupDelayedHover.lastCall?.args[1].content
					: undefined,
			}),
		};
	}

	test('shows the remote host name for a workspace-less chat', () => {
		const harness = createHarness(createSession(remoteProvider.id));
		assert.deepStrictEqual(harness.presentation(), {
			text: 'No workspace [Remote machine]',
			ariaLabel: 'Show Sessions: No workspace [Remote machine]',
			hover: 'No workspace [Remote machine]',
		});
	});

	test('updates the host name when switching between remote and local chats', () => {
		const harness = createHarness(createSession(remoteProvider.id));
		const otherProvider = upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-other',
			label: 'Other machine',
			remoteAddress: 'other.example:1234',
		});
		harness.providers.set(otherProvider.id, otherProvider);
		harness.activeSession.set(createSession(otherProvider.id), undefined);
		const remote = harness.presentation();
		harness.activeSession.set(createSession(localProvider.id), undefined);
		const local = harness.presentation();
		harness.activeSession.set(undefined, undefined);

		assert.deepStrictEqual({ remote, local, empty: harness.presentation() }, {
			remote: {
				text: 'No workspace [Other machine]',
				ariaLabel: 'Show Sessions: No workspace [Other machine]',
				hover: 'No workspace [Other machine]',
			},
			local: {
				text: 'No workspace',
				ariaLabel: 'Show Sessions: No workspace',
				hover: 'No workspace',
			},
			empty: {
				text: '',
				ariaLabel: 'Show Sessions',
				hover: undefined,
			},
		});
	});

	test('updates the host name when a provider is replaced', () => {
		const harness = createHarness(createSession(remoteProvider.id));
		const renamedProvider = upcastPartial<IAgentHostSessionsProvider>({ ...remoteProvider, label: 'Renamed machine' });
		harness.providers.set(renamedProvider.id, renamedProvider);
		harness.onDidChangeProviders.fire({ added: [renamedProvider], removed: [remoteProvider] });

		assert.deepStrictEqual(harness.presentation(), {
			text: 'No workspace [Renamed machine]',
			ariaLabel: 'Show Sessions: No workspace [Renamed machine]',
			hover: 'No workspace [Renamed machine]',
		});
	});

	test('updates the host name when the same provider is renamed', () => {
		let label = 'Remote machine';
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			...remoteProvider,
			get label() { return label; },
		});
		const harness = createHarness(createSession(provider.id), undefined, provider);
		const before = harness.presentation();
		label = 'Renamed machine';
		harness.onDidChangeSessionTypes.fire();

		assert.deepStrictEqual({
			before,
			after: harness.presentation(),
			sameProvider: harness.providers.get(provider.id) === provider,
		}, {
			before: {
				text: 'No workspace [Remote machine]',
				ariaLabel: 'Show Sessions: No workspace [Remote machine]',
				hover: 'No workspace [Remote machine]',
			},
			after: {
				text: 'No workspace [Renamed machine]',
				ariaLabel: 'Show Sessions: No workspace [Renamed machine]',
				hover: 'No workspace [Renamed machine]',
			},
			sameProvider: true,
		});
	});

	test('preserves workspace and branch context for remote workspace sessions', () => {
		const harness = createHarness(createSession(remoteProvider.id, upcastDeepPartial<ISessionWorkspace>({
			label: 'Project [Remote machine]',
			folders: [{
				workingDirectory: URI.file('Q:\\project'),
				gitRepository: { branchName: 'main', workTreeUri: URI.file('Q:\\project') },
			}],
		})));
		assert.deepStrictEqual({
			workspace: harness.container.querySelector('.agent-sessions-titlebar-workspace')?.textContent,
			branch: harness.container.querySelector('.agent-sessions-titlebar-branch')?.textContent,
			ariaLabel: harness.container.getAttribute('aria-label'),
		}, {
			workspace: 'Project [Remote machine]',
			branch: 'main',
			ariaLabel: 'Show Sessions: Project [Remote machine], branch main',
		});
	});

	test('preserves an explicit window title for remote workspace-less chats', () => {
		const harness = createHarness(createSession(remoteProvider.id), 'Custom title');
		assert.deepStrictEqual(harness.presentation(), {
			text: 'Custom title',
			ariaLabel: 'Show Sessions: Custom title',
			hover: 'Custom title',
		});
	});
});
