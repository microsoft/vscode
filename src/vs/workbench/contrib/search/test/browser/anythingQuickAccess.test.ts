/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { OpenerService } from '../../../../../editor/browser/services/openerService.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ViewColumn } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IQuickInputService, IQuickPickSeparator, NO_KEY_MODS } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IQuickChatService } from '../../../chat/browser/chat.js';
import { IExternalUriOpenerService, ILinkHandler } from '../../../externalUriOpener/common/externalUriOpenerService.js';
import { AnythingQuickAccessProvider, IAnythingQuickPickItem } from '../../browser/anythingQuickAccess.js';
import { IAnythingQuickAccessProviderRunOptions } from '../../common/search.js';

suite('AnythingQuickAccess - links', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let provider: TestAnythingQuickAccessProvider;
	let opened: { resource: URI | string; options?: OpenOptions }[];
	let notifications: NotificationMessage[];
	let activeGroup: IEditorGroup;
	let activatedGroups: number[];
	let handled: boolean;
	let openError: Error | undefined;
	let sourceGroup: IEditorGroup;
	let otherGroup: IEditorGroup;
	let allowActiveGroupAccess: boolean;
	let linkHandlers: ILinkHandler[];

	class TestAnythingQuickAccessProvider extends AnythingQuickAccessProvider {
		getPicks(filter: string, options?: IAnythingQuickAccessProviderRunOptions) {
			return this._getPicks(filter, store.add(new DisposableStore()), CancellationToken.None, options);
		}
	}

	class EmptyAnythingQuickAccessProvider extends AnythingQuickAccessProvider {
		protected override _getPicks(): IAnythingQuickPickItem[] {
			return [];
		}
	}

	setup(() => {
		opened = [];
		notifications = [];
		activatedGroups = [];
		handled = true;
		openError = undefined;
		allowActiveGroupAccess = true;
		linkHandlers = [];
		sourceGroup = new class extends mock<IEditorGroup>() { override readonly id = 1; };
		otherGroup = new class extends mock<IEditorGroup>() { override readonly id = 2; };
		activeGroup = sourceGroup;
		instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IEditorGroupsService, {
			get activeGroup() {
				assert.ok(allowActiveGroupAccess, 'This picker must not access the active editor group');
				return activeGroup;
			},
			getGroup: id => id === sourceGroup.id ? sourceGroup : otherGroup,
			activateGroup: group => {
				const id = typeof group === 'number' ? group : group.id;
				activatedGroups.push(id);
				activeGroup = id === sourceGroup.id ? sourceGroup : otherGroup;
				return activeGroup;
			}
		});
		instantiationService.stub(IExternalUriOpenerService, {
			getLinkHandlers: async () => linkHandlers,
		});
		instantiationService.stub(IOpenerService, {
			open: async (resource, options) => {
				opened.push({ resource, options });
				if (openError) {
					throw openError;
				}
				return handled;
			}
		});
		instantiationService.stub(INotificationService, {
			warn: message => { notifications.push(...Array.isArray(message) ? message : [message]); },
			error: message => { notifications.push(...Array.isArray(message) ? message : [message]); }
		});
		instantiationService.stub(ISearchService, {
			fileSearch: async () => ({ results: [], messages: [] }),
			clearCache: async () => { }
		});
		instantiationService.stub(IQuickChatService, {});
		instantiationService.stub(IOutlineService, {});
		instantiationService.stub(IOutlineModelService, {});
		configurationService = new TestConfigurationService({
			workbench: { editor: { enablePreview: true, enablePreviewFromQuickOpen: true, openSideBySideDirection: 'right' } },
			search: {}
		});
		instantiationService.stub(IConfigurationService, configurationService);
		provider = store.add(instantiationService.createInstance(TestAnythingQuickAccessProvider));
	});

	// Side opening uses the Alt modifier, labeled per platform
	const openToSideTooltip = `Open to the Side (${OS === OperatingSystem.Macintosh ? '⌥Enter' : 'Alt+Enter'})`;

	async function getLinkPicks(filter: string): Promise<(IAnythingQuickPickItem | IQuickPickSeparator)[]> {
		return getLinkPicksWith(filter);
	}

	async function getLinkPicksWith(filter: string, options?: IAnythingQuickAccessProviderRunOptions): Promise<(IAnythingQuickPickItem | IQuickPickSeparator)[]> {
		const picks = await provider.getPicks(filter, options);
		assert.ok(Array.isArray(picks));
		return picks;
	}

	async function getLinkPick(filter: string): Promise<IAnythingQuickPickItem> {
		const picks = await getLinkPicks(filter);
		assert.strictEqual(picks.length, 1);
		assert.ok(picks[0].type !== 'separator');
		return picks[0];
	}

	function linkHandler(id: string, isDefault: boolean, calls: unknown[]): ILinkHandler {
		return {
			id,
			label: `Label ${id}`,
			isDefault,
			open: async options => {
				calls.push({ open: id, options });
				return true;
			},
		};
	}

	test('lists the link handlers with the default first and opens the picked one', async () => {
		const calls: unknown[] = [];
		linkHandlers = [linkHandler('preview', true, calls), linkHandler('browser', false, calls)];
		const picks = await getLinkPicks('https://example.com/a?q=a%26b');
		const [, defaultPick, otherPick] = picks as IAnythingQuickPickItem[];
		await defaultPick.accept?.(NO_KEY_MODS, { inBackground: false });
		await otherPick.accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		const sideAction = await otherPick.trigger?.(0, NO_KEY_MODS);
		const openOptions = (openToSide: boolean) => ({ fromUserGesture: true, openToSide, editorOptions: { preserveFocus: false, pinned: false } });

		assert.deepStrictEqual({
			picks: picks.map(pick => pick.type === 'separator' ? { separator: pick.label } : { label: pick.label, description: pick.description, buttons: pick.buttons?.map(button => button.tooltip) }),
			opened,
			calls,
			activatedGroups,
			sideAction,
			filtered: (await getLinkPicksWith('https://example.com/a?q=a%26b', { filter: pick => !!pick.label?.includes('browser') })).map(pick => pick.label),
		}, {
			picks: [
				{ separator: 'open link' },
				{ label: '$(link-external) Label preview', description: 'Default', buttons: [openToSideTooltip] },
				{ label: '$(link-external) Label browser', description: undefined, buttons: [openToSideTooltip] },
			],
			opened: [],
			calls: [
				{ open: 'preview', options: openOptions(false) },
				{ open: 'browser', options: openOptions(true) },
				{ open: 'browser', options: openOptions(true) },
			],
			activatedGroups: [1, 1],
			sideAction: TriggerAction.CLOSE_PICKER,
			filtered: ['$(link-external) Label browser'],
		});
	});

	for (const link of [
		'https://github.com/microsoft/vscode/pull/123?view=files#diff-123',
		'https://example.com:8443/path#L12,3-L14,5',
		'https://user@example.com/path',
		'file:///workspace/file.ts#L12',
		'vscode://publisher.extension/open?id=123',
		'custom-editor://session/123'
	]) {
		test(`opens through shared handlers without changing the link: ${link}`, async () => {
			const pick = await getLinkPick(link);
			await pick.accept?.(NO_KEY_MODS, { inBackground: false });
			assert.deepStrictEqual(opened, [{
				resource: link,
				options: {
					fromUserGesture: true,
					allowContributedOpeners: true,
					openToSide: false,
					editorOptions: { preserveFocus: false, pinned: false }
				}
			}]);
		});
	}

	test('Alt+Enter opens beside the originating group even after the active group changes', async () => {
		const pick = await getLinkPick('https://example.com');
		activeGroup = otherGroup;
		await pick.accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual({
			activatedGroups,
			options: opened[0].options,
			button: pick.buttons?.[0].tooltip
		}, {
			activatedGroups: [1],
			options: {
				fromUserGesture: true,
				allowContributedOpeners: true,
				openToSide: true,
				editorOptions: { preserveFocus: false, pinned: false }
			},
			button: openToSideTooltip
		});
	});

	test('side button uses shared handlers and closes the picker', async () => {
		const pick = await getLinkPick('https://example.com');
		const action = await pick.trigger?.(0, NO_KEY_MODS);
		assert.deepStrictEqual({ action, side: opened[0].options?.openToSide }, {
			action: TriggerAction.CLOSE_PICKER,
			side: true
		});
	});

	test('side button follows the configured side-by-side direction', async () => {
		await configurationService.setUserConfiguration('workbench', {
			editor: { enablePreview: true, enablePreviewFromQuickOpen: true, openSideBySideDirection: 'down' }
		});
		provider = store.add(instantiationService.createInstance(TestAnythingQuickAccessProvider));
		const pick = await getLinkPick('https://example.com');
		assert.strictEqual(pick.buttons?.[0].tooltip, openToSideTooltip.replace('Side', 'Bottom'));
	});

	test('renders the link icon inline rather than applying icon font classes to the row', async () => {
		const pick = await getLinkPick('https://example.com');
		assert.deepStrictEqual({ label: pick.label, iconClasses: pick.iconClasses }, {
			label: '$(link-external) Open Link',
			iconClasses: undefined
		});
	});

	test('side-opening intent reaches a contributed external URI handler', async () => {
		const openerService = store.add(new OpenerService(instantiationService.get(ICodeEditorService), NullCommandService));
		const targets: { href: string; sourceUri: string; viewColumn: ViewColumn | undefined }[] = [];
		store.add(openerService.registerExternalOpener({
			openExternal: async (href, context) => {
				targets.push({ href, sourceUri: context.sourceUri.toString(), viewColumn: context.viewColumn });
				return true;
			}
		}));
		instantiationService.stub(IOpenerService, openerService);
		provider = store.add(instantiationService.createInstance(TestAnythingQuickAccessProvider));
		const link = 'https://github.com/microsoft/vscode/pull/123?view=files#diff-123';
		await (await getLinkPick(link)).accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual(targets, [{
			href: link,
			sourceUri: URI.parse(link).toString(),
			viewColumn: ViewColumn.Beside
		}]);
	});

	test('respects preview configuration and the existing Ctrl/Cmd side-opening gesture', async () => {
		await configurationService.setUserConfiguration('workbench', {
			editor: { enablePreview: false, enablePreviewFromQuickOpen: true, openSideBySideDirection: 'right' }
		});
		await (await getLinkPick('https://example.com')).accept?.({ ...NO_KEY_MODS, ctrlCmd: true }, { inBackground: false });
		assert.deepStrictEqual(opened[0].options, {
			fromUserGesture: true,
			allowContributedOpeners: true,
			openToSide: true,
			editorOptions: { preserveFocus: false, pinned: true }
		});
	});

	test('background acceptance preserves focus and pins the editor', async () => {
		await (await getLinkPick('https://example.com')).accept?.(NO_KEY_MODS, { inBackground: true });
		assert.deepStrictEqual(opened[0].options?.editorOptions, { preserveFocus: true, pinned: true });
	});

	for (const filter of ['readme.md', 'src/file.ts:12:3', 'file.ts@symbol', 'C:/src/file.ts', 'C:\\src\\file.ts', '>command', '@symbol', ':12', 'example.com']) {
		test(`preserves file queries and Quick Access prefixes: ${filter}`, () => {
			const picks = provider.getPicks(filter);
			assert.ok(!Array.isArray(picks));
		});
	}

	for (const link of ['https://', 'https:///path', 'https://[invalid', 'https://example.com/not a link', 'command://run', 'javascript://run', 'data://payload', `${Schemas.internal}://target`]) {
		test(`reports an invalid or disallowed link without an open action: ${link}`, async () => {
			const pick = await getLinkPick(link);
			assert.deepStrictEqual({ label: pick.label, accept: pick.accept, trigger: pick.trigger }, {
				label: 'Invalid Link',
				accept: undefined,
				trigger: undefined
			});
		});
	}

	test('respects caller filtering', async () => {
		assert.deepStrictEqual(await provider.getPicks('https://example.com', { filter: () => false }), []);
	});

	test('file-only and delegated pickers do not offer link actions', async () => {
		const filesOnly = await provider.getPicks('https://example.com', { filesOnly: true });
		const delegated = provider.getPicks('https://example.com', {
			fileSearchDelegate: { search: async () => ({ results: [], messages: [] }) }
		});
		assert.deepStrictEqual({ filesOnly, delegatedIsFileSearch: !Array.isArray(delegated) }, {
			filesOnly: [],
			delegatedIsFileSearch: true
		});
	});

	for (const [before, after] of [
		['readme.md', 'readme.md:12'],
		['readme.md:12', 'readme.md'],
		['readme.md', 'readme.md']
	]) {
		for (const link of ['https://example.com', 'https://']) {
			test(`refreshes file picks after ${before} -> ${link} -> ${after}`, async () => {
				provider.getPicks(before);
				await getLinkPick(link);
				const picks = provider.getPicks(after);
				assert.notStrictEqual(picks, null);
				assert.ok(!Array.isArray(picks), 'Returning to a file query must replace the link pick');
				assert.strictEqual(provider.getPicks('readme.md:13'), null, 'Range-only changes should still preserve file picks');
			});
		}
	}

	test('refreshes file picks after a link was filtered out', async () => {
		provider.getPicks('readme.md');
		assert.deepStrictEqual(await provider.getPicks('https://example.com', { filter: () => false }), []);
		assert.notStrictEqual(provider.getPicks('readme.md:12'), null);
	});

	for (const options of [
		{ filesOnly: true },
		{ fileSearchDelegate: { search: async () => ({ results: [], messages: [] }) } },
		{ handleAccept: () => { } }
	] satisfies IAnythingQuickAccessProviderRunOptions[]) {
		test(`does not require an active editor group for a specialized picker: ${Object.keys(options)[0]}`, () => {
			const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
			const provider = store.add(instantiationService.createInstance(EmptyAnythingQuickAccessProvider));
			allowActiveGroupAccess = false;
			store.add(provider.provide(picker, CancellationToken.None, options));
		});
	}

	test('does not require an active editor group for quick navigation', () => {
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
		const provider = store.add(instantiationService.createInstance(EmptyAnythingQuickAccessProvider));
		picker.quickNavigate = { keybindings: [] };
		allowActiveGroupAccess = false;
		store.add(provider.provide(picker, CancellationToken.None));
	});

	test('reports unhandled links', async () => {
		handled = false;
		await (await getLinkPick('unsupported://target')).accept?.(NO_KEY_MODS, { inBackground: false });
		assert.deepStrictEqual(notifications, ['The link could not be opened. It may be unsupported or opening it was canceled.']);
	});

	test('reports opener errors', async () => {
		openError = new Error('Failed to open link');
		await (await getLinkPick('https://example.com')).accept?.(NO_KEY_MODS, { inBackground: false });
		assert.deepStrictEqual(notifications, [openError]);
	});

	test('captures the source group when the picker is provided, not when the link is typed', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const picker = store.add(instantiationService.get(IQuickInputService).createQuickPick<IAnythingQuickPickItem>({ useSeparators: true }));
		picker.value = 'https://example.com';
		store.add(provider.provide(picker, CancellationToken.None));
		activeGroup = otherGroup;
		const pick = await getLinkPick('https://example.com/another');
		await pick.accept?.({ ...NO_KEY_MODS, alt: true }, { inBackground: false });
		assert.deepStrictEqual(activatedGroups, [1]);
	});
});
