/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAICustomizationItemsModel } from '../../../browser/aiCustomization/aiCustomizationItemsModel.js';
import { ChatCustomizationsActionViewItem, ChatCustomizationsHover } from '../../../browser/aiCustomization/chatCustomizationsHover.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { McpCommandIds } from '../../../../mcp/common/mcpCommandIds.js';
import { AgentHostMcpServer } from '../../../browser/aiCustomization/mcpServerCount.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CustomizationMigrationState } from '../../../browser/aiCustomization/customizationMigrationState.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { CustomizationMigrationType, ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ChatCustomizationsTelemetry } from '../../../browser/aiCustomization/chatCustomizationsTelemetry.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryData, ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IOpenerService, OpenOptions } from '../../../../../../platform/opener/common/opener.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';

suite('Chat customizations hover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionResource = URI.parse('agent-host-copilotcli:/session');

	function createHover(hiddenSections: string[] = [], loaded: Promise<void> = Promise.resolve(), widgets: readonly IChatWidget[] = [], hasWorkspace = true, attention: { servers?: readonly AgentHostMcpServer[]; migration?: ICustomizationMigrationHint; isSessionsWindow?: boolean } = {}) {
		const observed: string[] = [];
		const scoped: string[] = [];
		const events: { name: string; data?: ITelemetryData }[] = [];
		const opened: { link: URI | string; options?: OpenOptions }[] = [];
		const projectLabel = observableValue<string | undefined>(store, hasWorkspace ? 'Project' : undefined);
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatCustomizationsLocation]: 'chatInput' });
		const telemetryService = new class extends NullTelemetryServiceShape {
			override publicLog2(name?: string, data?: ITelemetryData): void {
				if (name) {
					events.push({ name, data });
				}
			}
		}();
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly isSessionsWindow = attention.isSessionsWindow ?? false;
		}());
		const openerService = new class extends mock<IOpenerService>() {
			override async open(link: URI | string, options?: OpenOptions): Promise<boolean> {
				opened.push({ link, options });
				return true;
			}
		}();
		let scopeDisposed = false;
		const hover = new ChatCustomizationsHover(
			new class extends mock<IAICustomizationItemsModel>() {
				override whenSectionLoaded(section: AICustomizationManagementSection) {
					observed.push(section);
					return loaded;
				}
				override getPluginCount() { return constObservable(4); }
				override getCount(section: AICustomizationManagementSection) { return constObservable(section === AICustomizationManagementSection.Skills ? 12 : section === AICustomizationManagementSection.Hooks ? 2 : 3); }
				override createSessionModel(resource: URI) {
					scoped.push(resource.toString());
					return {
						model: new class extends mock<IAICustomizationItemsModel>() {
							override whenSectionLoaded() { return Promise.resolve(); }
							override getPluginCount() { return constObservable(2); }
							override getCount() { return constObservable(1); }
						},
						dispose: () => { scopeDisposed = true; },
					};
				}
			},
			new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = constObservable(sessionResource);
				override getActiveDescriptor() { return upcastPartial<IHarnessDescriptor>({ label: 'Copilot', hiddenSections }); }
				override getDescriptorForSession() { return upcastPartial<IHarnessDescriptor>({ label: 'Claude', hiddenSections }); }
			},
			new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly activeProjectLabel = projectLabel;
				override readonly activeProjectRoot = constObservable(hasWorkspace ? URI.file('/workspace') : undefined);
			},
			new class extends mock<IMcpService>() {
				override readonly servers = constObservable([]);
			},
			new class extends mock<IAgentHostCustomizationService>() {
				override getClientWorkingDirectoryUris() { return [URI.file('/other-project')]; }
				override getMcpServers() {
					return attention.servers ?? [upcastPartial<AgentHostMcpServer>({
						id: 'session/server', name: 'Server', enabled: true, status: McpServerStatus.Ready,
					})];
				}
			},
			new class extends mock<IChatWidgetService>() {
				override getAllWidgets() { return widgets; }
			},
			new class extends mock<ICustomizationMigrationService>() {
				override async computeMigrationHint() { return attention.migration; }
			},
			store.add(new InMemoryStorageService()),
			instantiationService,
			openerService,
		);
		return { hover, observed, scoped, events, opened, projectLabel, configurationService, instantiationService, scopeDisposed: () => scopeDisposed };
	}

	test('unfocused widget counts and deep links use that widget without retargeting the active model', async () => {
		const resource = URI.parse('agent-host-claude:/other-session');
		const widget = upcastPartial<IChatWidget>({
			input: upcastPartial<IChatWidget['input']>({ pendingDelegationTarget: undefined }),
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: resource }),
		});
		const { hover, observed, scoped, scopeDisposed } = createHover([], Promise.resolve(), [widget]);
		const content = (await hover.getContent(CancellationToken.None, { widget }))!;
		const rendered = store.add(renderMarkdown(content)).element;
		const links = Array.from(rendered.querySelectorAll<HTMLAnchorElement>('a'), link =>
			JSON.parse(decodeURIComponent(link.dataset.href!.split('?')[1]))[0],
		).filter(target => typeof target === 'object');
		assert.deepStrictEqual({
			observed, scoped, disposed: scopeDisposed(),
			context: rendered.querySelector('p:nth-of-type(2)')?.textContent?.replace(/\u00a0/g, ' '),
			counts: [...rendered.querySelectorAll('tbody tr')].map(row => row.querySelector('td:last-child')?.textContent?.trim()),
			targets: links.map(target => target.sessionResource),
		}, {
			observed: [], scoped: [resource.toString()], disposed: true,
			context: 'Claude \u00b7 other-project',
			counts: ['2', '1', '1', '1', '1'],
			targets: Array(6).fill(resource.toJSON()),
		});
	});

	test('shows compact harness and workspace context as plain text, or only the harness without a workspace', async () => {
		const summaries = [];
		for (const label of ['Project', '<b>Project</b> [Open](command:untrusted)', undefined]) {
			const { hover, projectLabel } = createHover([], Promise.resolve(), [], label !== undefined);
			projectLabel.set(label, undefined);
			const content = (await hover.getContent(CancellationToken.None))!;
			const rendered = store.add(renderMarkdown(content)).element;
			const context = rendered.querySelector('p:nth-of-type(2)');
			summaries.push({
				title: rendered.querySelector('strong')?.textContent,
				context: context?.textContent?.replace(/\u00a0/g, ' '),
				nestedMarkup: context?.querySelectorAll('b, a').length,
				order: [...rendered.children].map(element => element.tagName),
			});
		}
		assert.deepStrictEqual(summaries, [
			{ title: 'Session Customizations', context: 'Copilot \u00b7 Project', nestedMarkup: 0, order: ['P', 'P', 'TABLE', 'HR', 'P'] },
			{ title: 'Session Customizations', context: 'Copilot \u00b7 <b>Project</b> [Open](command:untrusted)', nestedMarkup: 0, order: ['P', 'P', 'TABLE', 'HR', 'P'] },
			{ title: 'Session Customizations', context: 'Copilot', nestedMarkup: 0, order: ['P', 'P', 'TABLE', 'HR', 'P'] },
		]);
	});

	test('new entry points retain migration and section badge indicators and accessible hints', () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const migrations = observableValue(store, false);
		const sectionBadge = observableValue<string | undefined>(store, undefined);
		instantiationService.stubInstance(CustomizationMigrationState, new class extends mock<CustomizationMigrationState>() {
			override readonly available = migrations;
			override dispose() { }
		});
		const action = instantiationService.createInstance(MenuItemAction, {
			id: 'test.customizations', title: 'Customizations', icon: Codicon.extensions,
		}, undefined, undefined, undefined, undefined);
		const item = store.add(instantiationService.createInstance(ChatCustomizationsActionViewItem, action, undefined, createHover().hover, 'chatInput', undefined, false, sectionBadge));
		const container = mainWindow.document.createElement('li');
		item.render(container);
		const read = () => ({ badge: container.classList.contains('migration-available'), label: container.querySelector('.action-label')?.getAttribute('aria-label') });
		const initial = read();
		migrations.set(true, undefined);
		const migration = read();
		migrations.set(false, undefined);
		sectionBadge.set('Some skills need review.', undefined);
		assert.deepStrictEqual({ initial, migration, sectionBadge: read() }, {
			initial: { badge: false, label: 'Customizations' },
			migration: { badge: true, label: 'Customizations (Migrations Available)' },
			sectionBadge: { badge: true, label: 'Customizations, Some skills need review.' },
		});
	});

	test('waits for discovery and links every count to its session-scoped page', async () => {
		const loaded = new DeferredPromise<void>();
		const { hover, observed } = createHover([], loaded.p);
		let settled = false;
		const pending = hover.getContent(CancellationToken.None).then(value => {
			settled = true;
			return value;
		});
		await Promise.resolve();
		const beforeDiscovery = settled;
		await loaded.complete();
		const content = (await pending)!;
		const rendered = store.add(renderMarkdown(content)).element;
		const links = Array.from(rendered.querySelectorAll<HTMLAnchorElement>('a'), link => {
			const [command, argumentsString] = link.dataset.href!.slice('command:'.length).split('?');
			return { command, arguments: JSON.parse(decodeURIComponent(argumentsString)) };
		});
		assert.deepStrictEqual({
			beforeDiscovery,
			observed,
			rows: [...rendered.querySelectorAll('tbody tr')].map(row => ({
				label: row.querySelector('a')?.textContent?.trim(),
				count: row.querySelector('td:last-child')?.textContent?.trim(),
				detail: row.querySelector('em')?.textContent?.replace(/\u00a0/g, ' '),
				hasIcon: !!row.querySelector('a .codicon'),
			})),
			links,
		}, {
			beforeDiscovery: false,
			observed: ['plugins', 'skills', 'instructions', 'hooks'],
			rows: [
				{ label: 'Plugins', count: '4', detail: undefined, hasIcon: true },
				{ label: 'MCP Servers', count: '1', detail: undefined, hasIcon: true },
				{ label: 'Skills', count: '12', detail: undefined, hasIcon: true },
				{ label: 'Instructions', count: '3', detail: undefined, hasIcon: true },
				{ label: 'Hooks', count: '2', detail: undefined, hasIcon: true },
			],
			links: [
				...['plugins', 'mcpServers', 'skills', 'instructions', 'hooks'].map(section => ({
					command: AICustomizationManagementCommands.OpenEditor,
					arguments: [{ section, sessionResource: sessionResource.toJSON() }],
				})),
				{ command: AICustomizationManagementCommands.OpenEditor, arguments: [{ showDiscover: true, sessionResource: sessionResource.toJSON() }] },
				{ command: 'workbench.action.openSettings', arguments: ['chat.customizations.location'] },
			],
		});
	});

	test('does not request counts until the managed hover is opened', async () => {
		const { hover, observed } = createHover();
		const content = hover.getManagedContent();
		const beforeOpening = [...observed];
		assert.ok(typeof content.markdown === 'function');
		await content.markdown(CancellationToken.None);
		assert.deepStrictEqual({ beforeOpening, afterOpening: observed }, {
			beforeOpening: [],
			afterOpening: ['plugins', 'skills', 'instructions', 'hooks'],
		});
	});

	test('logs visibility only after showing and deduplicates loading and resolved content', async () => {
		const loaded = new DeferredPromise<void>();
		const { hover, events } = createHover([], loaded.p);
		const options = hover.getHoverOptions('chatInput');
		const content = hover.getManagedContent();
		assert.ok(typeof content.markdown === 'function');
		const firstToken = store.add(new CancellationTokenSource());
		const first = content.markdown(firstToken.token);
		const beforeShown = [...events];
		options.onDidShow?.();
		await loaded.complete();
		await first;
		options.onDidShow?.();
		firstToken.cancel();
		const secondToken = store.add(new CancellationTokenSource());
		await content.markdown(secondToken.token);
		options.onDidShow?.();
		const dismissedToken = store.add(new CancellationTokenSource());
		await content.markdown(dismissedToken.token);
		dismissedToken.cancel();
		options.onDidShow?.();
		assert.deepStrictEqual({ beforeShown, events }, {
			beforeShown: [],
			events: Array(2).fill({
				name: 'chatCustomizationEntryPoint.interaction',
				data: { action: 'hoverShown', location: 'chatInput', configuredLocation: 'chatInput', windowKind: 'editor', target: 'none' },
			}),
		});
	});

	test('records one button activation for mouse and keyboard without counting other toolbar actions', async () => {
		const { hover, events, instantiationService } = createHover();
		const action = instantiationService.createInstance(MenuItemAction, {
			id: 'test.customizations', title: 'Customizations',
		}, undefined, undefined, undefined, undefined);
		const other = instantiationService.createInstance(MenuItemAction, {
			id: 'test.other', title: 'Other',
		}, undefined, undefined, undefined, undefined);
		const container = mainWindow.document.createElement('div');
		const actionBar = store.add(new ActionBar(container, {
			actionViewItemProvider: candidate => candidate === action
				? instantiationService.createInstance(ChatCustomizationsActionViewItem, action, undefined, hover, 'chatInput', constObservable(false), false, undefined)
				: undefined,
		}));
		actionBar.push([action, other]);
		container.querySelector<HTMLElement>('.action-label')!.click();
		await actionBar.run(other);
		actionBar.focus(0);
		actionBar.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		actionBar.domNode.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual(events, Array(2).fill({
			name: 'chatCustomizationEntryPoint.interaction',
			data: { action: 'buttonClicked', location: 'chatInput', configuredLocation: 'chatInput', windowKind: 'editor', target: 'none' },
		}));
	});

	test('logs bounded hover action categories and preserves command trust and opener routing', async () => {
		const { hover, events, opened } = createHover([], Promise.resolve(), [], true, {
			isSessionsWindow: true,
			servers: [upcastPartial<AgentHostMcpServer>({ id: 'secret-id', name: 'Private Server', enabled: true, status: McpServerStatus.AuthRequired })],
			migration: { migrationFlowId: 'private-flow', message: '', counts: [{ type: CustomizationMigrationType.UserData, count: 1 }] },
		});
		const content = (await hover.getContent(CancellationToken.None))!;
		const options = hover.getHoverOptions('sessionsHeader');
		const rendered = store.add(renderMarkdown(content, { actionHandler: link => options.linkHandler?.(link) })).element;
		const links = [...rendered.querySelectorAll<HTMLAnchorElement>('a')];
		for (const link of links) {
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		}
		const beforeUnknownLink = events.length;
		options.linkHandler?.('command:notTrusted?private-data');
		assert.deepStrictEqual({
			events,
			knownLinks: opened.slice(0, -1).map(entry => entry.link),
			openerOptions: opened.at(-1)?.options,
			unknownLinkLogged: events.length !== beforeUnknownLink,
		}, {
			events: ['plugins', 'mcpServers', 'skills', 'instructions', 'hooks', 'migrations', 'mcpServers', 'mcpAuthentication', 'browseAdditional', 'locationSetting'].map(target => ({
				name: 'chatCustomizationEntryPoint.interaction',
				data: { action: 'hoverInteracted', location: 'sessionsHeader', configuredLocation: 'chatInput', windowKind: 'agents', target },
			})),
			knownLinks: links.map(link => link.dataset.href),
			openerOptions: {
				fromUserGesture: true, allowContributedOpeners: true,
				allowCommands: [AICustomizationManagementCommands.OpenEditor, McpCommandIds.AuthenticateAgentHostServer, 'workbench.action.openSettings'],
				skipValidation: undefined,
			},
			unknownLinkLogged: false,
		});
	});

	test('observes location updates without logging initialization, unchanged values, or experiment defaults', async () => {
		const { configurationService, instantiationService, events } = createHover();
		const telemetry = instantiationService.createInstance(ChatCustomizationsTelemetry);
		const observer = store.add(telemetry.observeLocationChanges());
		const update = async (value: string, source: ConfigurationTarget, key: string = ChatConfiguration.ChatCustomizationsLocation) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source, affectedKeys: new Set([key]), change: { keys: [key], overrides: [] },
				affectsConfiguration: candidate => candidate === key,
			});
		};
		await update('chatInput', ConfigurationTarget.USER);
		await update('sidebar', ConfigurationTarget.DEFAULT);
		await update('chatToolbar', ConfigurationTarget.USER);
		await update('auto', ConfigurationTarget.APPLICATION);
		await update('private-value', ConfigurationTarget.USER);
		await update('another-private-value', ConfigurationTarget.USER);
		await update('private-other', ConfigurationTarget.USER, 'unrelated.setting');
		observer.dispose();
		await update('chatInput', ConfigurationTarget.USER);
		assert.deepStrictEqual(events, [
			{ previousLocation: 'sidebar', location: 'chatToolbar', windowKind: 'editor' },
			{ previousLocation: 'chatToolbar', location: 'auto', windowKind: 'editor' },
			{ previousLocation: 'auto', location: 'unknown', windowKind: 'editor' },
		].map(data => ({ name: 'chatCustomizationEntryPoint.locationChanged', data })));
	});

	test('category and footer links remain keyboard operable in the compact layout', async () => {
		const { hover } = createHover();
		const content = (await hover.getContent(CancellationToken.None))!;
		const opened: string[] = [];
		const rendered = store.add(renderMarkdown(content, { actionHandler: href => opened.push(href) })).element;
		const links = [...rendered.querySelectorAll('a')];
		for (const link of links) {
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		}
		assert.deepStrictEqual({
			headers: [...rendered.querySelectorAll('th')].map(header => header.textContent),
			footerLinks: [...rendered.querySelectorAll('hr + p a')].map(link => link.textContent?.trim().replace(/\u00a0/g, ' ')),
			gearTooltip: links.at(-1)?.getAttribute('title'),
			opened: opened.map(href => href.split('?')[0]),
		}, {
			headers: ['Type', 'Available'],
			footerLinks: ['Browse Additional', 'Change Button Location...'],
			gearTooltip: 'Change Button Location...',
			opened: [
				...Array(6).fill(`command:${AICustomizationManagementCommands.OpenEditor}`),
				'command:workbench.action.openSettings',
			],
		});
	});

	test('does not fetch or advertise sections hidden by the harness', async () => {
		const { hover, observed } = createHover(['plugins', 'mcpServers', 'skills', 'hooks']);
		const content = (await hover.getContent(CancellationToken.None))!;
		assert.deepStrictEqual({
			observed,
			hasPlugins: content.value.includes('Plugins'),
			hasMcp: content.value.includes('MCP Servers'),
			hasSkills: content.value.includes('Skills'),
			hasInstructions: content.value.includes('Instructions') && content.value.includes('| 3 |'),
		}, { observed: ['instructions'], hasPlugins: false, hasMcp: false, hasSkills: false, hasInstructions: true });
	});

	test('puts actionable migration and authentication details below the inventory and above the footer', async () => {
		const servers = ['GitHub', 'Figma', 'Third', 'Fourth'].map(name => upcastPartial<AgentHostMcpServer>({
			id: `session/${name}`, name, enabled: true, status: McpServerStatus.AuthRequired,
		}));
		const migration: ICustomizationMigrationHint = {
			migrationFlowId: 'flow',
			message: 'Migrations available',
			counts: [{ type: CustomizationMigrationType.UserData, count: 2 }, { type: CustomizationMigrationType.PromptFiles, count: 1 }],
		};
		const { hover } = createHover([], Promise.resolve(), [], true, { servers, migration });
		const content = (await hover.getContent(CancellationToken.None))!;
		const rendered = store.add(renderMarkdown(content)).element;
		const attentionLinks = [...rendered.querySelectorAll('ul a')];
		const targets = attentionLinks.map(link => JSON.parse(decodeURIComponent(link.getAttribute('data-href')!.split('?')[1])));
		assert.deepStrictEqual({
			order: [...rendered.children].map(element => element.tagName),
			attentionHeading: [...rendered.querySelectorAll('strong')].at(-1)?.textContent,
			entries: attentionLinks.map(link => link.textContent?.trim().replace(/\u00a0/g, ' ')),
			targets,
			inventoryDetails: rendered.querySelectorAll('td em').length,
		}, {
			order: ['P', 'P', 'TABLE', 'P', 'UL', 'HR', 'P'],
			attentionHeading: 'Needs attention',
			entries: ['3 customizations need migration', '4 MCP servers require sign-in', 'GitHub', 'Figma'],
			targets: [
				[{ migration: true, sessionResource: sessionResource.toJSON(), migrationHint: migration }],
				[{ section: AICustomizationManagementSection.McpServers, sessionResource: sessionResource.toJSON() }],
				[sessionResource.toJSON(), 'session/GitHub'],
				[sessionResource.toJSON(), 'session/Figma'],
			],
			inventoryDetails: 0,
		});
	});

	test('omits attention when nothing needs action and does not advertise hidden MCP authentication', async () => {
		const states = [];
		for (const hidden of [[], [AICustomizationManagementSection.McpServers]]) {
			const { hover } = createHover(hidden, Promise.resolve(), [], true, hidden.length ? {
				servers: [upcastPartial<AgentHostMcpServer>({ id: 'auth', name: 'Hidden', enabled: true, status: McpServerStatus.AuthRequired })],
			} : {});
			const content = (await hover.getContent(CancellationToken.None))!;
			const rendered = store.add(renderMarkdown(content)).element;
			states.push({ attention: rendered.querySelectorAll('ul').length, hasFooter: !!rendered.querySelector('hr + p') });
		}
		assert.deepStrictEqual(states, [{ attention: 0, hasFooter: true }, { attention: 0, hasFooter: true }]);
	});

	test('formats a single authentication request without interpreting server names as markup', async () => {
		const name = '<b>GitHub</b> [Sign In](command:untrusted)';
		const { hover } = createHover([], Promise.resolve(), [], true, {
			servers: [upcastPartial<AgentHostMcpServer>({ id: 'auth', name, enabled: true, status: McpServerStatus.AuthRequired })],
		});
		const content = (await hover.getContent(CancellationToken.None))!;
		const rendered = store.add(renderMarkdown(content)).element;
		assert.deepStrictEqual({
			text: rendered.querySelector('li')?.textContent?.replace(/\u00a0/g, ' ').trim(),
			serverName: rendered.querySelector('li em a')?.textContent?.replace(/\u00a0/g, ' '),
			links: rendered.querySelectorAll('li a').length,
			nestedMarkup: rendered.querySelectorAll('li b').length,
		}, { text: `1 MCP server requires sign-in ${name}`, serverName: name, links: 2, nestedMarkup: 0 });
	});

	test('server-name links support keyboard sign-in for the originating, unfocused session', async () => {
		const resource = URI.parse('agent-host-copilotcli://remote-host/other-session');
		const serverId = 'plugin/server?&"]';
		const { hover } = createHover([], Promise.resolve(), [], true, {
			servers: [upcastPartial<AgentHostMcpServer>({
				id: serverId, name: 'internal-name', displayName: 'GitHub', enabled: true, status: McpServerStatus.AuthRequired,
			})],
		});
		const content = (await hover.getContent(CancellationToken.None, { sessionResource: resource }))!;
		const opened: string[] = [];
		const rendered = store.add(renderMarkdown(content, { actionHandler: href => opened.push(href) })).element;
		const link = rendered.querySelector<HTMLAnchorElement>('li em a')!;
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			label: link.textContent?.replace(/\u00a0/g, ' '),
			tooltip: link.title,
			commands: opened.map(href => href.split('?')[0]),
			arguments: opened.map(href => JSON.parse(decodeURIComponent(href.split('?')[1]))),
			trusted: typeof content.isTrusted === 'object' && content.isTrusted.enabledCommands?.includes(McpCommandIds.AuthenticateAgentHostServer),
		}, {
			label: 'GitHub (Connector)',
			tooltip: 'Sign In to GitHub (Connector)',
			commands: [`command:${McpCommandIds.AuthenticateAgentHostServer}`],
			arguments: [[resource.toJSON(), serverId]],
			trusted: true,
		});
	});

	test('does not publish a dismissed hover after discovery finishes', async () => {
		const loaded = new DeferredPromise<void>();
		const token = store.add(new CancellationTokenSource());
		const { hover } = createHover([], loaded.p);
		const pending = hover.getContent(token.token);
		token.cancel();
		await loaded.complete();
		assert.strictEqual(await pending, undefined);
	});
});
