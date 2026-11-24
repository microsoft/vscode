/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/parts/media/titlebarpart.css';
import '../../../workbench/browser/media/style.css';
import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Action } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { agentHostAuthority, toAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { remoteAgentHostSessionTypeId } from '../../../platform/agentHost/common/agentHostSessionType.js';
import { IAgentHostConnectionsService } from '../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { ISSHAgentHostConnection, ISSHRemoteAgentHostService } from '../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService } from '../../../platform/agentHost/common/tunnelAgentHost.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { getIconRegistry } from '../../../platform/theme/common/iconRegistry.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IConfigurationChangeEvent } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING } from '../../../platform/chat/common/chatSettings.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IsAuxiliaryWindowContext, LayoutModeContext } from '../../../workbench/common/contextkeys.js';
import { OpenInVSCodeAction } from '../../browser/actions/vscodeActions.js';
import { OpenInVSCodeTitleBarWidget } from '../../browser/widget/openInVSCodeWidget.js';
import { AgentsWindowMenus } from '../../browser/agentsWindowMenus.js';
import { IAgentHostSessionsProvider } from '../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsProvider } from '../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { IChat, ISessionWorkspace } from '../../../workbench/services/sessions/common/session.js';
import { ITestSessionsService, ITestSessionWithChat, stubSessionHostsFromSessionsService } from '../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('Web Open in Editor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [connection, expected] of [
		[
			{ type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloudsandbox:environment', environmentId: 'environment' },
			{ authority: '', path: '', query: 'windowId=_blank' },
		],
		[
			{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host' },
			{ authority: 'vscode-remote', path: '/ssh-remote+host/c:/Users/test/project', query: 'windowId=_blank&session=test%3A%2Fsession' },
		],
	] satisfies [IRemoteAgentHostEntry['connection'], { authority: string; path: string; query: string }][]) {
		test(`routes ${connection.type} without opening remote paths locally`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			const calls: { authority: string; path: string; query: string; openExternal: boolean | undefined }[] = [];
			const folder = toAgentHostUri(URI.from({ scheme: 'file', path: '/c:/Users/test/project' }), agentHostAuthority(connection.address));
			const workspace = upcastPartial<ISessionWorkspace>({ folders: [{ workingDirectory: folder, root: folder, name: 'project', description: undefined }] });
			const session = upcastPartial<ITestSessionWithChat>({
				resource: URI.from({ scheme: 'test', path: '/session' }),
				providerId: 'test',
				activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(workspace) })),
			});
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: connection.address });
			instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({ activeSession: constObservable(session) }));
			stubSessionHostsFromSessionsService(instantiationService);
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
				getProvider: <T extends ISessionsProvider>() => provider as T,
			}));
			instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({
				getEntryByAddress: () => ({ name: 'Remote host', connection }),
			}));
			instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ resolveSessionResourceIdentity: () => undefined }));
			instantiationService.stub(IRemoteAgentHostLocationPreferenceService, upcastPartial<IRemoteAgentHostLocationPreferenceService>({ getPreference: () => undefined }));
			instantiationService.stub(ISSHRemoteAgentHostService, upcastPartial<ISSHRemoteAgentHostService>({ connections: [] }));
			instantiationService.stub(ITunnelAgentHostService, upcastPartial<ITunnelAgentHostService>({ getSelectedServerType: () => undefined }));
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IProductService, upcastPartial<IProductService>({ urlProtocol: 'vscode-test' }));
			instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, options?: { openExternal?: boolean }): Promise<boolean> {
					const uri = typeof resource === 'string' ? URI.parse(resource) : resource;
					calls.push({ authority: uri.authority, path: uri.path, query: uri.query, openExternal: options?.openExternal });
					return true;
				}
			}());

			await instantiationService.invokeFunction(accessor => new OpenInVSCodeAction().run(accessor));

			assert.deepStrictEqual(calls, [{ ...expected, openExternal: true }]);

			calls.length = 0;
			const clickedChat = upcastPartial<IChat>({
				resource: URI.parse('test:/nested-chat'),
				workspace: constObservable(workspace),
			});
			await instantiationService.invokeFunction(accessor => new OpenInVSCodeAction().run(accessor, { session, chat: clickedChat }));

			assert.deepStrictEqual(calls, [{
				...expected,
				query: connection.type === RemoteAgentHostEntryType.SSH ? 'windowId=_blank&session=test%3A%2Fnested-chat' : expected.query,
				openExternal: true,
			}]);
		});
	}

	for (const [connection, serverType, preference] of [
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'standalone', undefined],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', undefined],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', 'editor'],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', 'dedicated'],
		[{ type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' }, undefined, undefined],
		[{ type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:host', hostPath: '/source/project' }, undefined, undefined],
	] satisfies [IRemoteAgentHostEntry['connection'], ISSHAgentHostConnection['serverType'], RemoteAgentHostLocationPreference | undefined][]) {
		test(`hands off ${connection.type} sessions when the editor follows the selected host (${serverType ?? 'standalone'}, ${preference ?? 'no preference'})`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			const entry = { name: 'Remote host', connection };
			const address = getEntryAddress(entry);
			const authority = agentHostAuthority(address);
			const folder = toAgentHostUri(URI.file('/project'), authority);
			const resource = URI.from({ scheme: remoteAgentHostSessionTypeId(authority, 'copilotcli'), path: '/session', fragment: 'chat' });
			const chat = upcastPartial<IChat>({
				resource,
				workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [{ workingDirectory: folder, root: folder, name: 'project', description: undefined }] })),
			});
			const session = upcastPartial<ITestSessionWithChat>({ resource, providerId: 'test', activeChat: constObservable(chat) });
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: address });
			const sessions: (string | null)[] = [];
			const notifications: string[] = [];
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: <T extends ISessionsProvider>() => provider as T }));
			instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({ getEntryByAddress: () => entry }));
			instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResourceIdentity: () => ({ connectionAuthority: authority, backendSession: URI.parse('copilotcli:/session') }),
			}));
			instantiationService.stub(IRemoteAgentHostLocationPreferenceService, upcastPartial<IRemoteAgentHostLocationPreferenceService>({ getPreference: key => key === address ? preference : undefined }));
			instantiationService.stub(ISSHRemoteAgentHostService, upcastPartial<ISSHRemoteAgentHostService>({
				connections: [upcastPartial<ISSHAgentHostConnection>({ localAddress: address, serverType })],
			}));
			instantiationService.stub(ITunnelAgentHostService, upcastPartial<ITunnelAgentHostService>({ getSelectedServerType: () => undefined }));
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: message => { notifications.push(String(message)); } }));
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IProductService, upcastPartial<IProductService>({ urlProtocol: 'vscode-test' }));
			instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
				open: async resource => {
					sessions.push(new URLSearchParams((typeof resource === 'string' ? URI.parse(resource) : resource).query).get('session'));
					return true;
				},
			}));

			await instantiationService.invokeFunction(accessor => new OpenInVSCodeAction().run(accessor, { session, chat }));

			const sharesAgentHost = serverType !== 'editor' || preference === 'editor';
			assert.deepStrictEqual({ sessions, notifications }, {
				sessions: [sharesAgentHost ? 'agent-host-copilotcli:/session#chat' : null],
				notifications: !sharesAgentHost ? ['The session\'s folder was opened in a new editor window, but the session can\'t be opened there. This window is connected to a different agent host on the remote machine than the one its editor windows use.'] : [],
			});
		});
	}
});

suite('Open in Editor in Agents windows', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function attach(container: HTMLElement): HTMLElement {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = 'position: fixed; top: 0; left: 0';
		store.add(toDisposable(() => root.remove()));
		append(root, container);
		return root;
	}

	async function waitForObservation(element: HTMLElement): Promise<boolean> {
		await Promise.resolve();
		return new Promise(resolve => {
			const observer = new mainWindow.IntersectionObserver(entries => {
				observer.disconnect();
				resolve(entries[0].isIntersecting);
			});
			observer.observe(element);
		});
	}

	test('uses the editor icon for the product quality', () => {
		const keybindings = upcastPartial<IKeybindingService>({ appendKeybinding: label => `${label} (shortcut)` });
		const configuration = new TestConfigurationService({ [AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const results = ['stable', 'insider', 'exploration', undefined].map(quality => {
			const action = store.add(new Action('test', 'Open in Editor'));
			const widget = store.add(new OpenInVSCodeTitleBarWidget(action, undefined, 'test', upcastPartial<IProductService>({ quality }), NullHoverService, keybindings, configuration, NullTelemetryService));
			const container = document.createElement('div');
			widget.render(container);
			const icon = container.querySelector('.open-in-vscode-titlebar-widget-icon');
			return {
				icon: icon?.className,
				hidden: icon?.getAttribute('aria-hidden'),
				label: container.getAttribute('aria-label'),
			};
		});
		assert.deepStrictEqual({
			results,
			stableDefault: getIconRegistry().getIcon('open-in-vscode')?.defaults,
			insidersDefault: getIconRegistry().getIcon('open-in-vscode-insiders')?.defaults,
		}, {
			results: [
				{ icon: 'open-in-vscode-titlebar-widget-icon codicon codicon-open-in-vscode', hidden: 'true', label: 'Open in VS Code Editor Window (shortcut)' },
				{ icon: 'open-in-vscode-titlebar-widget-icon codicon codicon-open-in-vscode-insiders', hidden: 'true', label: 'Open in VS Code Editor Window (shortcut)' },
				{ icon: 'open-in-vscode-titlebar-widget-icon codicon codicon-open-in-vscode', hidden: 'true', label: 'Open in VS Code Editor Window (shortcut)' },
				{ icon: 'open-in-vscode-titlebar-widget-icon codicon codicon-open-in-vscode', hidden: 'true', label: 'Open in VS Code Editor Window (shortcut)' },
			],
			stableDefault: Codicon.vscode,
			insidersDefault: Codicon.vscodeInsiders,
		});
	});

	for (const useCodicons of [false, true]) {
		test(`uses the ${useCodicons ? 'codicon' : 'branded'} editor icon in the ${useCodicons ? 'treatment' : 'control'} arm and logs its trigger`, async () => {
			const setting = AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING;
			const configuration = new class extends TestConfigurationService {
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return key === setting ? { ...inspected, userValue: undefined, userLocalValue: undefined } : inspected;
				}
			}({ [setting]: useCodicons });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const telemetry = new TestExperimentTriggerTelemetryService();
			const keybindings = upcastPartial<IKeybindingService>({ appendKeybinding: label => `${label} (shortcut)` });
			const action = store.add(new Action('test', 'Open in Editor'));
			const widget = store.add(new OpenInVSCodeTitleBarWidget(action, undefined, 'test', upcastPartial<IProductService>({ quality: 'stable' }), NullHoverService, keybindings, configuration, telemetry));
			const container = document.createElement('div');
			widget.render(container);
			const icon = container.querySelector<HTMLElement>('.open-in-vscode-titlebar-widget-icon')!;
			icon.style.cssText = 'width: 16px; height: 16px';
			const triggered = Event.toPromise(telemetry.onDidTrigger);
			const root = attach(container);
			root.style.display = 'none';
			assert.strictEqual(await waitForObservation(container), false);
			assert.strictEqual(telemetry.triggers.length, 0);
			root.style.display = '';
			// Revealing an unpainted element does not schedule an intersection update in headless WebKit.
			await Promise.all([triggered, waitForObservation(container)]);
			assert.deepStrictEqual({
				hasCodicon: icon?.classList.contains('codicon'),
				triggerLogged: telemetry.triggers.includes(`config.${setting}`),
			}, { hasCodicon: useCodicons, triggerLogged: true });

			await configuration.setUserConfiguration(setting, !useCodicons);
			configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === setting;
				}
			}());
			assert.strictEqual(icon?.classList.contains('codicon'), !useCodicons);
		});

		test(`logs the editor icon trigger when a user resets to the ${useCodicons ? 'codicon' : 'branded'} default`, async () => {
			const setting = AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING;
			const configuration = new class extends TestConfigurationService {
				usingDefault = false;
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return key === setting && this.usingDefault ? { ...inspected, userValue: undefined, userLocalValue: undefined } : inspected;
				}
			}({ [setting]: !useCodicons });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const telemetry = new TestExperimentTriggerTelemetryService();
			const keybindings = upcastPartial<IKeybindingService>({ appendKeybinding: label => label });
			const action = store.add(new Action('test', 'Open in Editor'));
			const widget = store.add(new OpenInVSCodeTitleBarWidget(action, undefined, 'test', upcastPartial<IProductService>({ quality: 'stable' }), NullHoverService, keybindings, configuration, telemetry));
			const change = new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === setting;
				}
			}();
			configuration.usingDefault = true;
			configuration.onDidChangeConfigurationEmitter.fire(change);
			configuration.usingDefault = false;
			const container = document.createElement('div');
			widget.render(container);
			container.querySelector<HTMLElement>('.open-in-vscode-titlebar-widget-icon')!.style.cssText = 'width: 16px; height: 16px';
			attach(container);
			assert.strictEqual(await waitForObservation(container), true);
			const beforeReset = [...telemetry.triggers];

			await configuration.setUserConfiguration(setting, useCodicons);
			configuration.usingDefault = true;
			const triggered = Event.toPromise(telemetry.onDidTrigger);
			configuration.onDidChangeConfigurationEmitter.fire(change);
			configuration.onDidChangeConfigurationEmitter.fire(change);
			await triggered;
			assert.deepStrictEqual({
				beforeReset,
				hasCodicon: container.querySelector('.open-in-vscode-titlebar-widget-icon')?.classList.contains('codicon'),
				triggers: telemetry.triggers,
			}, { beforeReset: [], hasCodicon: useCodicons, triggers: [`config.${setting}`] });
		});
	}

	test('editor icon uses the title bar foreground in active and inactive windows', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		root.style.cssText = '--vscode-titleBar-activeForeground: #ffffff; --vscode-titleBar-inactiveForeground: #aabbcc; --vscode-icon-foreground: #000000';
		store.add(toDisposable(() => root.remove()));
		const titlebar = append(root, $('.part.titlebar'));
		const titlebarContainer = append(titlebar, $('.sessions-titlebar-container'));
		const center = append(titlebarContainer, $('.titlebar-center'));
		const actions = append(center, $('.titlebar-actions-container'));
		const actionBar = append(actions, $('.monaco-action-bar'));
		const container = append(actionBar, $('li.action-item'));
		const configuration = new TestConfigurationService({ [AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const action = store.add(new Action('test', 'Open in Editor'));
		const keybindings = upcastPartial<IKeybindingService>({ appendKeybinding: label => label });
		const widget = store.add(new OpenInVSCodeTitleBarWidget(action, undefined, 'test', upcastPartial<IProductService>({ quality: 'stable' }), NullHoverService, keybindings, configuration, NullTelemetryService));
		widget.render(container);
		const icon = container.querySelector<HTMLElement>('.open-in-vscode-titlebar-widget-icon')!;
		const colors = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => {
			root.classList.add(theme);
			const active = mainWindow.getComputedStyle(icon).color;
			container.classList.add('disabled');
			const disabled = mainWindow.getComputedStyle(icon).color;
			container.classList.remove('disabled');
			titlebar.classList.add('inactive');
			const inactive = mainWindow.getComputedStyle(icon).color;
			titlebar.classList.remove('inactive');
			root.classList.remove(theme);
			return { active, disabled, inactive };
		});
		const expected = { active: 'rgb(255, 255, 255)', disabled: 'rgb(255, 255, 255)', inactive: 'rgb(170, 187, 204)' };
		assert.deepStrictEqual(colors, [expected, expected, expected, expected]);
	});

	test('shows in the main window and in chat windows, as the main window always showed it, and not in editor windows', () => {
		const menus = new OpenInVSCodeAction().desc.menu;
		const when = (Array.isArray(menus) ? menus : [menus]).find(menu => menu?.id === AgentsWindowMenus.TitleBarCenterRight)?.when;
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const shows = (auxiliary: boolean, layoutMode: string | undefined) => {
			const scoped = store.add(contextKeyService.createScoped(document.createElement('div')));
			IsAuxiliaryWindowContext.bindTo(scoped).set(auxiliary);
			LayoutModeContext.bindTo(scoped).set(layoutMode);
			return scoped.contextMatchesRules(when);
		};

		assert.deepStrictEqual({ main: shows(false, undefined), chatWindow: shows(true, 'sideBySide'), editorWindow: shows(true, undefined) }, { main: true, chatWindow: true, editorWindow: false });
	});
});
