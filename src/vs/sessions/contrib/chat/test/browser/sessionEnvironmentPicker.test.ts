/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { getEnvironmentWorkspaceProvider, getSessionCreationEnvironments, ISessionCreationEnvironment, SessionEnvironmentPicker } from '../../browser/sessionEnvironmentPicker.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../common/sessionCommands.js';

suite('SessionEnvironmentPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/project');
	const workspace = upcastPartial<ISessionWorkspace>({ uri: folder });
	const local: ISessionCreationEnvironment = { id: 'local', kind: 'local', label: 'This Computer', icon: Codicon.deviceDesktop, providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID] };
	const cloud: ISessionCreationEnvironment = { id: 'cloud', kind: 'cloud', label: 'Cloud', icon: Codicon.cloud, providerIds: ['cloud'] };

	function provider(id: string, environment: string, options: Partial<ISessionsProvider> = {}): ISessionsProvider {
		return upcastPartial<ISessionsProvider>({
			id, environment: { id: environment, label: environment }, label: id, icon: Codicon.remote,
			resolveWorkspace: () => workspace,
			getSessionTypes: () => [],
			...options,
		});
	}

	test('groups logical local and cloud destinations and excludes hidden hosts and internal backends', () => {
		const providers = [
			provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local'),
			provider('another-local', 'local'),
			provider('cloud', 'cloud'),
			upcastPartial<IAgentHostSessionsProvider>({
				...provider('agenthost-remote-visible', 'remote'),
				connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
			}),
			upcastPartial<IAgentHostSessionsProvider>({
				...provider('agenthost-remote-hidden', 'remote'),
				connectionStatus: constObservable(RemoteAgentHostConnectionStatus.disconnected),
				isVisibleInEnvironmentPicker: constObservable(false),
			}),
			provider('agenthost-remote-backend', 'cloud', { supportsWorkspaceSelection: false }),
		];
		assert.deepStrictEqual(getSessionCreationEnvironments(providers).map(({ id, kind, providerIds, description }) => ({ id, kind, providerIds, description })), [
			{ id: 'local', kind: 'local', providerIds: [LOCAL_AGENT_HOST_PROVIDER_ID, 'another-local'], description: undefined },
			{ id: 'cloud', kind: 'cloud', providerIds: ['cloud'], description: undefined },
			{ id: 'agenthost-remote-visible', kind: 'remote', providerIds: ['agenthost-remote-visible'], description: 'Connected' },
		]);
	});

	test('Cloud requires a supported session type, not merely a resolvable local folder', () => {
		const localProvider = provider(LOCAL_AGENT_HOST_PROVIDER_ID, 'local');
		const cloudProvider = provider('cloud', 'cloud');
		const supportedCloud = provider('cloud', 'cloud', {
			getSessionTypes: () => [{ id: 'cloud-agent', label: 'Cloud', icon: Codicon.cloud, authRequirement: SessionTypeAuthRequirement.GitHub }],
		});
		assert.deepStrictEqual([
			getEnvironmentWorkspaceProvider(local, [localProvider, cloudProvider], folder)?.id,
			getEnvironmentWorkspaceProvider(cloud, [localProvider, cloudProvider], folder)?.id,
			getEnvironmentWorkspaceProvider(cloud, [localProvider, supportedCloud], folder)?.id,
		], [LOCAL_AGENT_HOST_PROVIDER_ID, undefined, 'cloud']);
	});

	test('an explicitly selected host never resolves through another host or a hidden provider', () => {
		const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['agenthost-remote-selected'] };
		const selected = upcastPartial<IAgentHostSessionsProvider>({
			...provider('agenthost-remote-selected', 'remote'),
			isVisibleInEnvironmentPicker: constObservable(false),
		});
		assert.strictEqual(getEnvironmentWorkspaceProvider(remote, [selected, provider('agenthost-remote-other', 'remote')], folder), undefined);
	});

	test('renders before repository controls, updates its accessible name, and selects through the action widget', async () => {
		const instantiation = store.add(new TestInstantiationService());
		let hide: (() => void) | undefined;
		let accept: ((index: number) => void) | undefined;
		let labels: (string | undefined)[] = [];
		const selected = observableValue<ISessionCreationEnvironment | undefined>('environment', local);
		instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			hide: () => hide?.(),
			show: <T>(_user: string, _preview: boolean, items: IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
				labels = items.map(item => item.label);
				hide = () => delegate.onHide();
				accept = index => delegate.onSelect(items[index].item!);
			},
		}));
		instantiation.stub(IMenuService, { getMenuActions: () => [] });
		instantiation.stub(IContextKeyService, new MockContextKeyService());
		instantiation.stub(IHoverService, NullHoverService);
		instantiation.stub(ICommandService, {});
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: false });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local, cloud]), selected, async environment => selected.set(environment, undefined), () => []));
		const container = dom.$('div');
		dom.append(container, dom.$('span', undefined, 'Repository'));
		store.add(picker.render(container));
		const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		accept?.(1);
		await Promise.resolve();
		assert.deepStrictEqual({
			order: container.textContent,
			labels,
			selected: selected.get()?.id,
			ariaLabel: trigger.getAttribute('aria-label'),
			expanded: trigger.getAttribute('aria-expanded'),
		}, {
			order: 'CloudRepository', labels: ['This Computer', 'Cloud'], selected: 'cloud', ariaLabel: 'Choose Environment, Cloud', expanded: 'false',
		});
	});

	for (const remotesEnabled of [false, true]) {
		test(`appends Manage after connection actions and opens Remotes without selecting an environment (enabled: ${remotesEnabled})`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: remotesEnabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiation.stub(IConfigurationService, configuration);
			instantiation.stub(IContextKeyService, new MockContextKeyService());
			instantiation.stub(IHoverService, NullHoverService);
			const calls: string[] = [];
			instantiation.stub(ICommandService, {
				executeCommand: async (id, ...args) => {
					calls.push(`command:${id}:${args.join(',')}`);
					return undefined;
				},
			});
			const connectionAction = instantiation.createInstance(MenuItemAction, { id: 'test.connect', title: 'Connect via SSH...', icon: Codicon.remote }, undefined, undefined, undefined, undefined);
			instantiation.stub(IMenuService, { getMenuActions: () => [['navigation', [connectionAction]]] });
			let accept: ((index: number) => void) | undefined;
			let hide: (() => void) | undefined;
			let menu: { label: string | undefined; separator: boolean }[] = [];
			instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
				isVisible: false,
				hide: () => { calls.push('hide'); hide?.(); },
				show: <T>(_user: string, _preview: boolean, items: IActionListItem<T>[], delegate: IActionListDelegate<T>) => {
					menu = items.map(item => ({ label: item.label, separator: item.kind === ActionListItemKind.Separator }));
					hide = () => delegate.onHide();
					accept = index => delegate.onSelect(items[index].item!);
				},
			}));
			const selected = observableValue<ISessionCreationEnvironment | undefined>(store, local);
			const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local]), selected, async environment => {
				calls.push(`select:${environment.id}`);
				selected.set(environment, undefined);
			}, () => []));
			const container = dom.$('div');
			store.add(picker.render(container));
			const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
			trigger.click();
			if (remotesEnabled) {
				accept!(menu.length - 1);
				await Promise.resolve();
			}
			assert.deepStrictEqual({
				menu, calls, selected: selected.get()?.id, expanded: trigger.getAttribute('aria-expanded'),
			}, {
				menu: [
					{ label: 'This Computer', separator: false },
					{ label: '', separator: true },
					{ label: 'Connect via SSH...', separator: false },
					...(remotesEnabled ? [{ label: '', separator: true }, { label: 'Manage...', separator: false }] : []),
				],
				calls: remotesEnabled ? ['hide', `command:${OPEN_REMOTES_EDITOR_COMMAND_ID}:`] : [],
				selected: 'local', expanded: remotesEnabled ? 'false' : 'true',
			});
		});
	}
});
