/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { PluginMarketplacesWidget } from '../../../browser/aiCustomization/pluginMarketplacesWidget.js';
import { getProviderMarketplaceSourceId } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { getPluginCustomizationMarketplaceSourceId } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ICustomizationHarnessService, ICustomizationMarketplaceInfo, ICustomizationMarketplaceManagementProvider, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IPluginMarketplaceService, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginMarketplacesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('test:/session');
	const marketplace = (name: string, overrides: Partial<ICustomizationMarketplaceInfo> = {}): ICustomizationMarketplaceInfo => ({
		name, source: `owner/${name}`, isDefault: false, managed: false, available: true, ...overrides,
	});

	class UpdatingConfigurationService extends TestConfigurationService {
		readonly updates: { key: string; value: unknown }[] = [];

		override async updateValue(key: string, value: unknown): Promise<void> {
			this.updates.push({ key, value });
			await this.setUserConfiguration(key, value);
		}
	}

	async function createFixture(options: {
		provider?: Partial<ICustomizationMarketplaceManagementProvider>;
		marketplaces?: readonly ICustomizationMarketplaceInfo[];
		configuration?: Record<string, unknown>;
		allow?: boolean;
	} = {}) {
		const instantiationService = workbenchInstantiationService({}, store);
		const configuration = new UpdatingConfigurationService(options.configuration ?? {});
		const commands: { id: string; args: unknown[] }[] = [];
		const errors: string[] = [];
		const confirmations: IConfirmation[] = [];
		const state = { confirm: true, back: 0 };
		let actions: readonly IAction[] = [];
		const provider: ICustomizationMarketplaceManagementProvider | undefined = options.provider || options.marketplaces ? {
			onDidChange: Event.None,
			onDidChangeMarketplaces: Event.None,
			list: async () => options.marketplaces ?? [],
			add: async (_session, source) => marketplace(source),
			queryMarketplace: async () => ({ items: [], total: 0 }),
			refresh: async () => [],
			remove: async () => ({ removed: true }),
			...options.provider,
		} : undefined;
		const descriptor: IHarnessDescriptor = {
			id: 'test', label: 'Test', icon: { id: 'vm' }, marketplaceManagementProvider: provider,
			marketplaceSearchProvider: { query: async () => ({ items: [], total: 0 }) },
		};
		const harness = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeHarness = observableValue('harness', 'test');
			override readonly activeSessionResource = observableValue('session', session);
			override getActiveDescriptor() { return descriptor; }
			override getDescriptorForSession() { return descriptor; }
		}();
		const fetches: Parameters<IPluginMarketplaceService['fetchMarketplacePlugins']>[] = [];
		instantiationService.stub(ICustomizationHarnessService, harness);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IAgentPluginRepositoryService, new class extends mock<IAgentPluginRepositoryService>() { }());
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override isStrictMarketplacePolicyActive() { return options.allow === false; }
			override isMarketplaceTrusted() { return options.allow !== false; }
			override async fetchMarketplacePlugins(...args: Parameters<IPluginMarketplaceService['fetchMarketplacePlugins']>) {
				fetches.push(args);
				return [];
			}
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: string | Error): void { errors.push(String(error)); }
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return { confirmed: state.confirm };
			}
		}());
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
				actions = delegate.getActions!();
				store.add(toDisposable(() => delegate.onHide?.(false)));
			}
		}());
		const container = DOM.append(DOM.getActiveDocument().body, DOM.$('.ai-customization-management-editor'));
		store.add(toDisposable(() => container.remove()));
		const widget = store.add(instantiationService.createInstance(PluginMarketplacesWidget, () => { state.back++; }));
		container.appendChild(widget.element);
		widget.setVisible(true);
		widget.layout(500, 700);
		await widget.refresh();
		const menu = (index = 0) => {
			const row = widget.element.querySelectorAll('.marketplace-list-item')[index];
			assert.ok(row, 'Expected a rendered marketplace row');
			row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
			return actions;
		};
		const search = (value: string) => {
			const input = widget.element.querySelector('input')!;
			input.value = value;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		};
		return { widget, commands, errors, confirmations, state, menu, search, configuration, harness, fetches };
	}

	test('searches provider inventory using shared separator matching and keeps managed actions read-only', async () => {
		const fixture = await createFixture({
			marketplaces: [marketplace('team-plugins'), marketplace('enterprise', { managed: true }), marketplace('default', { isDefault: true }), marketplace('offline', { available: false })],
			configuration: { [ChatConfiguration.PluginMarketplaces]: ['ignored/local'] },
		});
		const menus = [0, 1, 2, 3].map(index => fixture.menu(index).filter(action => action.id !== 'vs.actions.separator').map(action => [action.id, action.enabled]));
		fixture.search('team plugins');
		assert.deepStrictEqual({
			menus,
			names: [...fixture.widget.element.querySelectorAll('.marketplace-list-item-name')].map(element => element.textContent),
			content: fixture.widget.getAccessibilityContent(),
		}, {
			menus: [
				[['browse', true], ['refresh', true], ['remove', true]],
				[['browse', true], ['refresh', true]],
				[['browse', true], ['refresh', true]],
				[['browse', false], ['refresh', false], ['remove', true]],
			],
			names: ['team-plugins'],
			content: 'Marketplaces\n\nteam-plugins. owner/team-plugins',
		});
	});

	test('browses and refreshes the selected provider marketplace and confirms dependent removal', async () => {
		const calls: unknown[] = [];
		const fixture = await createFixture({
			marketplaces: [marketplace('team-plugins')],
			provider: {
				refresh: async (resource, name) => { calls.push(['refresh', resource, name]); return []; },
				remove: async (resource, name, force) => {
					calls.push(['remove', resource, name, force]);
					return force ? { removed: true } : { removed: false, dependentPlugins: ['example'] };
				},
			},
		});
		await fixture.menu().find(action => action.id === 'browse')!.run();
		await fixture.menu().find(action => action.id === 'refresh')!.run();
		await fixture.menu().find(action => action.id === 'remove')!.run();
		assert.deepStrictEqual({
			commands: fixture.commands, calls,
			confirmation: fixture.confirmations.map(value => [value.message, value.detail]),
			errors: fixture.errors,
		}, {
			commands: [{ id: AICustomizationManagementCommands.OpenMarketplace, args: [{ section: AICustomizationManagementSection.Plugins, searchQuery: '', sourceId: getProviderMarketplaceSourceId('team-plugins') }] }],
			calls: [['refresh', session, 'team-plugins'], ['remove', session, 'team-plugins', undefined], ['remove', session, 'team-plugins', true]],
			confirmation: [['Remove marketplace \'team-plugins\' and uninstall its plugins?', 'The following plugins depend on this marketplace and will be uninstalled:\n\nexample']],
			errors: [],
		});
	});

	test('does not force-remove after cancellation and reports refresh failures', async () => {
		const removes: (boolean | undefined)[] = [];
		const fixture = await createFixture({
			marketplaces: [marketplace('team')],
			provider: {
				remove: async (_resource, _name, force) => { removes.push(force); return { removed: false, dependentPlugins: ['example'] }; },
				refresh: async () => [{ name: 'team', success: false, error: 'Offline' }],
			},
		});
		fixture.state.confirm = false;
		await fixture.menu().find(action => action.id === 'remove')!.run();
		await fixture.menu().find(action => action.id === 'refresh')!.run();
		assert.deepStrictEqual({ removes, errors: fixture.errors }, { removes: [undefined], errors: ['Offline'] });
	});

	test('keeps configuration-backed browse, refresh and removal scoped to the selected marketplace', async () => {
		const reference = parseMarketplaceReference('owner/team-plugins')!;
		const fixture = await createFixture({ configuration: { [ChatConfiguration.PluginMarketplaces]: ['owner/team-plugins', 'owner/other'] } });
		await fixture.menu().find(action => action.id === 'browse')!.run();
		await fixture.menu().find(action => action.id === 'refresh')!.run();
		await fixture.menu().find(action => action.id === 'remove')!.run();
		assert.deepStrictEqual({
			commands: fixture.commands,
			fetches: fixture.fetches.map(([, ids, options]) => ({ ids: [...ids!], refresh: options?.refresh })),
			updates: fixture.configuration.updates,
		}, {
			commands: [{ id: AICustomizationManagementCommands.OpenMarketplace, args: [{ section: AICustomizationManagementSection.Plugins, searchQuery: '', sourceId: getPluginCustomizationMarketplaceSourceId(reference) }] }],
			fetches: [{ ids: [reference.canonicalId], refresh: true }],
			updates: [{ key: ChatConfiguration.PluginMarketplaces, value: ['owner/other'] }],
		});
	});

	test('disables policy-blocked actions and preserves organization-provided marketplaces', async () => {
		const fixture = await createFixture({
			allow: false,
			configuration: { [ChatConfiguration.PluginMarketplaces]: [], [ChatConfiguration.ExtraMarketplaces]: { 'owner/enterprise': 'owner/enterprise' } },
		});
		assert.deepStrictEqual({
			actions: fixture.menu().map(action => [action.id, action.enabled]),
			content: fixture.widget.getAccessibilityContent(),
		}, {
			actions: [['browse', false], ['refresh', false], ['openFolder', true]],
			content: 'Marketplaces\n\nowner/enterprise. owner/enterprise. Managed by Organization, Disabled by Organization',
		});
	});

	test('ignores stale loads after a harness change and displays load errors with retry', async () => {
		const pending = new DeferredPromise<readonly ICustomizationMarketplaceInfo[]>();
		let list: () => Promise<readonly ICustomizationMarketplaceInfo[]> = async () => [marketplace('initial')];
		const removes: string[] = [];
		const fixture = await createFixture({
			provider: {
				list: () => list(),
				remove: async (_resource, name) => { removes.push(name); return { removed: true }; },
			},
		});
		const staleRemove = fixture.menu().find(action => action.id === 'remove')!;
		list = () => pending.p;
		const stale = fixture.widget.refresh();
		list = async () => [marketplace('current')];
		fixture.harness.activeSessionResource.set(URI.parse('test:/new-session'), undefined);
		const cleared = {
			names: [...fixture.widget.element.querySelectorAll('.marketplace-list-item-name')].map(element => element.textContent),
			message: fixture.widget.element.querySelector<HTMLElement>('.marketplaces-message')?.textContent,
		};
		await staleRemove.run();
		assert.deepStrictEqual({ cleared, removes }, {
			cleared: { names: [], message: 'Loading marketplaces...' },
			removes: [],
		});
		await fixture.widget.refresh();
		await pending.complete([marketplace('stale')]);
		await stale;
		const current = fixture.widget.getAccessibilityContent();
		list = async () => { throw new Error('Cannot list'); };
		await fixture.widget.refresh();
		const error = fixture.widget.element.querySelector<HTMLElement>('.marketplaces-message')!;
		const retry = fixture.widget.element.querySelector<HTMLElement>('.marketplaces-message + .monaco-button')!;
		fixture.search('does not match');
		const failed = { visible: error.style.display !== 'none', text: error.textContent, retryVisible: retry.style.display !== 'none' };
		fixture.search('');
		const clearedError = { visible: error.style.display !== 'none', text: error.textContent, retryVisible: retry.style.display !== 'none' };
		list = async () => [marketplace('retried')];
		await fixture.widget.refresh();
		assert.deepStrictEqual({ current, failed, clearedError, retried: fixture.widget.getAccessibilityContent(), retryHidden: retry.style.display === 'none' }, {
			current: 'Marketplaces\n\ncurrent. owner/current',
			failed: { visible: true, text: 'Failed to load marketplaces: Cannot list', retryVisible: true },
			clearedError: { visible: true, text: 'Failed to load marketplaces: Cannot list', retryVisible: true },
			retried: 'Marketplaces\n\nretried. owner/retried',
			retryHidden: true,
		});
	});

	test('filters the superseded default feed and returns to Plugins with Escape', async () => {
		const fixture = await createFixture({
			marketplaces: [marketplace('awesome-copilot', { source: 'GitHub: github/awesome-copilot' }), marketplace('team')],
			configuration: {
				[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
				[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			},
		});
		fixture.widget.focus();
		fixture.widget.element.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ content: fixture.widget.getAccessibilityContent(), back: fixture.state.back }, {
			content: 'Marketplaces\n\nteam. owner/team', back: 1,
		});
	});
});
