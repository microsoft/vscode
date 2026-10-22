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
import { IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { getDefaultSessionCreationEnvironment, getEnvironmentWorkspaceProvider, getSessionCreationEnvironments, ISessionCreationEnvironment, SessionEnvironmentPicker } from '../../browser/sessionEnvironmentPicker.js';

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

	test('defaults local folders to This Computer even when Cloud resolves the recent workspace first', () => {
		const remote: ISessionCreationEnvironment = { id: 'remote', kind: 'remote', label: 'Remote', icon: Codicon.remote, providerIds: ['remote'] };
		const container: ISessionCreationEnvironment = { ...local, id: 'container:local', kind: 'container' };
		const environments = [cloud, local, remote, container];
		assert.deepStrictEqual([
			getDefaultSessionCreationEnvironment(environments, folder, 'cloud')?.id,
			getDefaultSessionCreationEnvironment(environments, undefined, undefined)?.id,
			getDefaultSessionCreationEnvironment(environments, URI.parse('vscode-agent-host://host/project'), 'remote')?.id,
			getDefaultSessionCreationEnvironment(environments, URI.parse('github:/owner/repo'), 'cloud')?.id,
			getDefaultSessionCreationEnvironment(environments, folder, LOCAL_AGENT_HOST_PROVIDER_ID, true)?.id,
			getDefaultSessionCreationEnvironment([cloud], folder, 'cloud')?.id,
		], ['local', 'local', 'remote', 'cloud', 'container:local', 'cloud']);
	});

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
		const tooltipLabels: string[] = [];
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
		instantiation.stub(IKeybindingService, new class extends MockKeybindingService {
			override appendKeybinding(label: string): string {
				tooltipLabels.push(label);
				return `${label} (Ctrl+K Ctrl+E)`;
			}
		}());
		instantiation.stub(IHoverService, NullHoverService);
		const picker = store.add(instantiation.createInstance(SessionEnvironmentPicker, constObservable([local, cloud]), selected, async environment => selected.set(environment, undefined), () => []));
		const container = dom.$('div');
		dom.append(container, dom.$('span', undefined, 'Repository'));
		store.add(picker.render(container, {
			focusCommand: { id: 'sessions.focusEnvironmentPicker', when: ContextKeyExpr.true(), enabled: constObservable(true) },
		}));
		const trigger = container.querySelector<HTMLElement>('[role="button"]')!;
		picker.showPicker();
		accept?.(1);
		await Promise.resolve();
		assert.deepStrictEqual({
			order: container.textContent,
			labels,
			selected: selected.get()?.id,
			ariaLabel: trigger.getAttribute('aria-label'),
			expanded: trigger.getAttribute('aria-expanded'),
			toolbar: !!trigger.closest('.monaco-toolbar'),
			tooltipLabels,
		}, {
			order: 'CloudRepository', labels: ['This Computer', 'Cloud'], selected: 'cloud', ariaLabel: 'Choose Environment, Cloud', expanded: 'false', toolbar: true,
			tooltipLabels: ['Choose Environment, This Computer', 'Choose Environment, Cloud'],
		});
	});
});
