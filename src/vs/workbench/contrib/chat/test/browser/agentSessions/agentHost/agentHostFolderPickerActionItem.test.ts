/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuProvider } from '../../../../../../../base/browser/contextmenu.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ToolBar } from '../../../../../../../base/browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ISCMService } from '../../../../../scm/common/scm.js';
import type { IChatWidget } from '../../../../browser/chat.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostFolderPickerActionItem, FOLDER_PICKER_LIST_CLASS } from '../../../../browser/agentSessions/agentHost/agentHostFolderPickerActionItem.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../../platform/theme/test/common/testThemeService.js';
import '../../../../browser/widget/media/chat.css';

suite('AgentHostFolderPickerActionItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let root: HTMLElement;
	setup(() => {
		root = document.createElement('div');
		document.body.appendChild(root);
	});
	teardown(() => root.remove());

	test('in a narrow row, the chip keeps its name, ellipsized, and needs its width, so that its neighbors overflow rather than being clipped', () => {
		const folder = URI.file('/work/a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row');
		const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: folder, folders: [upcastPartial<IWorkspaceFolder>({ uri: folder, name: 'a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row' })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => [] as IFolderLocation[],
			getLocation: () => undefined,
			resolveLocation: async () => undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: Event.None, getFolder: () => folder, isNoWorkspace: () => false, getDefaultFolder: () => undefined }));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getResolvedConfig: () => undefined, getPreparedSessionConfig: () => undefined }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: Event.None }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({ onDidChangeCustomizations: Event.None, getClientWorkingDirectoryUris: () => [] }));
		instantiationService.stub(ISCMService, upcastPartial<ISCMService>({ getRepository: () => undefined }));
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: session }), onDidChangeViewModel: Event.None });

		// As the chat input's secondary row lays it out
		root.className = 'interactive-session';
		const row = document.createElement('div');
		row.className = 'chat-secondary-toolbar';
		root.appendChild(row);
		const lane = document.createElement('div');
		lane.className = 'chat-secondary-input-toolbar';
		row.appendChild(lane);
		const folderAction = store.add(new Action('workbench.action.chat.openAgentHostFolderPicker', 'Folder'));
		const neighbors = [store.add(new Action('copilot', 'Copilot')), store.add(new Action('permissions', 'Manual permissions'))];
		const compact = observableValue('compact', true);
		let chip: AgentHostFolderPickerActionItem | undefined;
		let availableWidth = 600;
		const contextMenuProvider: IContextMenuProvider = { showContextMenu: () => { } };
		const toolbar = store.add(new ToolBar(lane, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'all',
				minItems: 1,
				actionMinWidth: 48,
				// As the chat input budgets it, and compact neighbors at their control width
				getActionMinWidth: action => (action.id === folderAction.id ? chip?.getMinimumWidth() : undefined) ?? 22,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => action.id === folderAction.id
				? chip = instantiationService.createInstance(AgentHostFolderPickerActionItem, upcastPartial<MenuItemAction>(folderAction), widget, { compact })
				: undefined,
		}));
		toolbar.setActions([folderAction, ...neighbors]);
		toolbar.relayout();
		const label = lane.querySelector<HTMLElement>('.agent-host-folder-chip .chat-input-picker-label');
		const chipWidth = chip?.getMinimumWidth() ?? 0;
		// Room for the chip with its name, but not for its neighbors as well
		availableWidth = 200;
		toolbar.relayout();

		assert.deepStrictEqual({
			label: label?.textContent,
			ellipsized: !!label && label.scrollWidth > label.clientWidth && mainWindow.getComputedStyle(label).textOverflow === 'ellipsis',
			bounded: !!label && label.getBoundingClientRect().width <= 160,
			needsMoreThanCompact: chipWidth > 22,
			overflowed: toolbar.hasOverflow(),
		}, {
			label: 'a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row',
			ellipsized: true,
			bounded: true,
			needsMoreThanCompact: true,
			overflowed: true,
		});
	});
	/** A chat input's secondary row of `availableWidth`, with two neighbors and the folder chip last, as in the chat input. */
	function createRow(availableWidth: number, started?: { readonly workspaceless: boolean }, itemCtor: typeof AgentHostFolderPickerActionItem = AgentHostFolderPickerActionItem) {
		const primary = URI.file('/work/vscode');
		const longName = URI.file('/work/a-worktree-with-a-name-far-too-long-to-fit-in-the-chat-input-row');
		const shortName = URI.file('/work/fix');
		const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });
		let selected = shortName;
		let noWorkspace = false;
		const onDidChangeFolder = store.add(new Emitter<URI>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: primary, name: 'vscode' })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => [] as IFolderLocation[],
			getLocation: () => undefined,
			resolveLocation: async () => undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: onDidChangeFolder.event, getFolder: () => noWorkspace || started ? undefined : selected, isNoWorkspace: () => noWorkspace, getDefaultFolder: () => undefined }));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getResolvedConfig: () => undefined, getPreparedSessionConfig: () => undefined }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: Event.None }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		// A started session, such as a restored one, which works in the scratch folder the agent host created for it if it has no workspace
		const scratch = URI.file('/home/.copilot/chats/3e215af6-5a8e-4060-b25e-0d2f1c9a7b41');
		instantiationService.stub(IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({
			onDidChangeCustomizations: Event.None,
			getClientWorkingDirectoryUris: () => started ? [started.workspaceless ? scratch : selected] : [],
			isWorkspaceless: () => started?.workspaceless === true,
		}));
		instantiationService.stub(ISCMService, upcastPartial<ISCMService>({ getRepository: () => undefined }));
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: session }), onDidChangeViewModel: Event.None });

		root.className = 'interactive-session';
		const row = document.createElement('div');
		row.className = 'chat-secondary-toolbar';
		root.appendChild(row);
		const lane = document.createElement('div');
		lane.className = 'chat-secondary-input-toolbar';
		// As wide as the toolbar is told it is, so that what it lays out is what it measures
		lane.style.width = `${availableWidth}px`;
		row.appendChild(lane);
		const folderAction = store.add(new Action('workbench.action.chat.openAgentHostFolderPicker', 'Folder'));
		const neighbors = [store.add(new Action('copilot', 'Copilot')), store.add(new Action('permissions', 'Manual permissions'))];
		let chip: AgentHostFolderPickerActionItem | undefined;
		const contextMenuProvider: IContextMenuProvider = { showContextMenu: () => { } };
		const toolbar = store.add(new ToolBar(lane, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'all',
				minItems: 1,
				actionMinWidth: 48,
				getActionMinWidth: action => (action.id === folderAction.id ? chip?.getMinimumWidth() : undefined) ?? 22,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => action.id === folderAction.id
				? chip = instantiationService.createInstance(itemCtor, upcastPartial<MenuItemAction>(folderAction), widget, { compact: observableValue('compact', true) })
				: undefined,
		}));
		// Last, as in the chat input
		toolbar.setActions([...neighbors, folderAction]);
		const select = (folder: URI | 'none') => {
			noWorkspace = folder === 'none';
			selected = folder === 'none' ? selected : folder;
			onDidChangeFolder.fire(session);
			// The min width the toolbar applied for the name before, as the chip measures the new one
			let slot = chip?.element;
			while (slot && !slot.classList.contains('action-item')) {
				slot = slot.parentElement ?? undefined;
			}
			const floor = Number.parseFloat(slot?.style.minWidth ?? '') || 0;
			toolbar.relayout();
			return { minWidth: chip?.getMinimumWidth() ?? 0, overflowed: toolbar.hasOverflow(), floor };
		};
		return { select, chip: () => chip, lane, longName, shortName, themeService: instantiationService.get(IThemeService) as TestThemeService };
	}

	test('measures what it needs besides its name once while it shows the same, however often it renders or the toolbar lays it out, and again as what it shows changes', () => {
		let measurements = 0;
		class CountingItem extends AgentHostFolderPickerActionItem {
			protected override measureChrome() {
				measurements++;
				return super.measureChrome();
			}
		}
		const { select, longName, shortName } = createRow(1000, undefined, CountingItem);
		const first = select(shortName);
		const initial = measurements;
		// Renders again, as its session's state changes, and is laid out again, with the same name
		const again = Array.from({ length: 10 }, () => select(shortName));
		const unchanged = measurements - initial;
		const long = select(longName);

		assert.deepStrictEqual({
			initial: initial > 0,
			unchanged,
			sameWidth: again.every(result => result.minWidth === first.minWidth),
			remeasured: measurements - initial > 0,
			longNeedsMore: long.minWidth > first.minWidth,
		}, { initial: true, unchanged: 0, sameWidth: true, remeasured: true, longNeedsMore: true });
	});

	test('measured while hidden, such as in a hidden chat input, it measures again once shown, also with the same name', () => {
		let measurements = 0;
		class CountingItem extends AgentHostFolderPickerActionItem {
			protected override measureChrome() {
				measurements++;
				return super.measureChrome();
			}
		}
		const visible = createRow(1000).select(URI.file('/work/fix'));
		root.style.display = 'none';
		const { select, longName, shortName } = createRow(1000, undefined, CountingItem);
		select(longName);
		// Its name changes while hidden
		const hidden = select(shortName);
		root.style.display = '';
		const before = measurements;
		const shown = select(shortName);

		assert.deepStrictEqual({ remeasured: measurements > before, minWidth: shown.minWidth, hiddenMinWidth: hidden.minWidth }, { remeasured: true, minWidth: visible.minWidth, hiddenMinWidth: 0 });
	});

	test('measures again as the product icon theme changes, which can change the size of its icon under the same name', () => {
		let measurements = 0;
		class CountingItem extends AgentHostFolderPickerActionItem {
			protected override measureChrome() {
				measurements++;
				return super.measureChrome();
			}
		}
		const { select, shortName, themeService } = createRow(1000, undefined, CountingItem);
		const before = select(shortName);
		const measured = measurements;
		// The new theme's glyph is wider
		const style = root.appendChild(document.createElement('style'));
		style.textContent = '.agent-host-folder-chip .codicon { margin-right: 10px; }';
		select(shortName);
		const unchanged = measurements === measured;
		themeService._onProductIconThemeChange.fire(themeService.getProductIconTheme());
		const after = select(shortName);

		assert.deepStrictEqual({ unchanged, remeasured: measurements > measured, wider: after.minWidth - before.minWidth }, { unchanged: true, remeasured: true, wider: 10 });
	});

	test('measures again as fonts finish loading, such as its icon\'s, which it may have been measured without', () => {
		let measurements = 0;
		class CountingItem extends AgentHostFolderPickerActionItem {
			protected override measureChrome() {
				measurements++;
				return super.measureChrome();
			}
		}
		const { select, shortName } = createRow(1000, undefined, CountingItem);
		const before = select(shortName);
		const measured = measurements;
		// The icon font loaded and its glyph is wider than the fallback's
		const style = root.appendChild(document.createElement('style'));
		style.textContent = '.agent-host-folder-chip .codicon { margin-right: 10px; }';
		document.fonts.dispatchEvent(new mainWindow.Event('loadingdone'));
		const after = select(shortName);
		const remeasured = measurements;
		// Laid out again as before, it does not measure again
		select(shortName);
		select(shortName);

		assert.deepStrictEqual({ remeasured: remeasured > measured, wider: after.minWidth - before.minWidth, thenUnchanged: measurements === remeasured }, { remeasured: true, wider: 10, thenUnchanged: true });
	});

	test('last in a narrow row, it needs the width of the name it shows now: a shorter name, or No Workspace, brings it back from the overflow', () => {
		// Room for its neighbors and a chip with a short name, not a long one
		const { select, longName, shortName } = createRow(160);
		const short = select(shortName);
		const long = select(longName);
		// Changed while in the overflow
		const shortAgain = select(shortName);
		const none = select('none');

		assert.deepStrictEqual({
			short: short.overflowed,
			long: long.overflowed,
			shortAgain: shortAgain.overflowed,
			none: none.overflowed,
			shorterNeedsLess: shortAgain.minWidth < long.minWidth,
			sameAsBefore: shortAgain.minWidth === short.minWidth,
		}, { short: false, long: true, shortAgain: false, none: false, shorterNeedsLess: true, sameAsBefore: true });
	});
	test('in a wide row, its width follows its name also while it stays in the row: a shorter name needs what a fresh chip with it does', () => {
		// Room for the chip with a long name too, which the toolbar then gives a width the shorter name does not need
		const { select, longName, shortName } = createRow(1000);
		const fresh = select(shortName);
		const long = select(longName);
		const short = select(shortName);
		const none = select('none');

		assert.deepStrictEqual({
			overflowed: [fresh.overflowed, long.overflowed, short.overflowed, none.overflowed],
			longNeedsMore: long.minWidth > fresh.minWidth,
			// Measured while still held at the long name's width
			measuredWithinLongFloor: short.floor === long.minWidth,
			shortAsFresh: short.minWidth === fresh.minWidth,
			noWorkspaceLessThanLong: none.minWidth < long.minWidth,
		}, { overflowed: [false, false, false, false], longNeedsMore: true, measuredWithinLongFloor: true, shortAsFresh: true, noWorkspaceLessThanLong: true });
	});
	test('at a narrow width it really is, a long name, fresh or after a short one, needs what it does in a wide row, without overlapping its neighbors', () => {
		const wideRow = createRow(1000);
		const wide = { short: wideRow.select(wideRow.shortName).minWidth, long: wideRow.select(wideRow.longName).minWidth };
		root.textContent = '';
		const { select, lane, longName, shortName } = createRow(160);
		/** Whether the items it shows lie within it, one after another. */
		const laidOut = () => {
			const laneBounds = lane.getBoundingClientRect();
			const bounds = [...lane.getElementsByClassName('action-item')].map(item => item.getBoundingClientRect()).filter(rect => rect.width > 0);
			return bounds.every((rect, index) => rect.left >= laneBounds.left - 0.5 && rect.right <= laneBounds.right + 0.5 && (index === 0 || rect.left >= bounds[index - 1].right - 0.5));
		};
		// Narrowed by the row as it first renders, before the toolbar moves it to the overflow
		const freshLong = { ...select(longName), laidOut: laidOut() };
		const short = { ...select(shortName), laidOut: laidOut() };
		const long = { ...select(longName), laidOut: laidOut() };
		const shortAgain = { ...select(shortName), laidOut: laidOut() };

		assert.deepStrictEqual({
			minWidths: [freshLong.minWidth, short.minWidth, long.minWidth, shortAgain.minWidth],
			overflowed: [freshLong.overflowed, short.overflowed, long.overflowed, shortAgain.overflowed],
			laidOut: [freshLong.laidOut, short.laidOut, long.laidOut, shortAgain.laidOut],
		}, {
			minWidths: [wide.long, wide.short, wide.long, wide.short],
			overflowed: [true, false, true, false],
			laidOut: [true, true, true, true],
		});
	});
	test('a started or restored session without a workspace shows No Workspace, not the scratch folder it works in, and one with a folder shows the folder', () => {
		const shown = (workspaceless: boolean) => {
			root.textContent = '';
			const { chip } = createRow(1000, { workspaceless });
			const element = chip()?.element;
			const icon = element?.firstElementChild;
			return { label: element?.textContent, ariaLabel: element?.ariaLabel, noWorkspaceIcon: !!icon?.classList.contains('codicon-comment') };
		};

		assert.deepStrictEqual({ workspaceless: shown(true), inFolder: shown(false) }, {
			workspaceless: { label: 'No Workspace', ariaLabel: 'No workspace: start the session in a temporary directory', noWorkspaceIcon: true },
			inFolder: { label: 'fix', ariaLabel: 'Folder: fix', noWorkspaceIcon: false },
		});
	});
	test('its list keeps the detail of a row with a description, such as the folder with Current, inside the row, as it does a row without one', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		// As the dropdown shows the picker's choices: each by its icon, with what it does below its name
		const items: IActionListItem<unknown>[] = [
			{ kind: ActionListItemKind.Action, label: 'No Workspace', detail: 'Start without a backing workspace', group: { title: '', icon: Codicon.comment }, item: {} },
			{ kind: ActionListItemKind.Action, label: 'vscode', description: 'Current', detail: 'Works in the folder already on this computer', group: { title: '', icon: Codicon.folder }, item: {} },
			{ kind: ActionListItemKind.Action, label: 'New Worktree', detail: 'Creates a separate copy for this session', group: { title: '', icon: Codicon.worktree }, item: {} },
		];
		const widget = store.add(instantiationService.createInstance(ActionListWidget<unknown>, 'folders', false, items, { onHide: () => { }, onSelect: () => { } }, undefined, { className: FOLDER_PICKER_LIST_CLASS }));
		root.classList.add('action-widget');
		root.appendChild(widget.domNode);
		widget.layout(400, 400);
		const rows = [...widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row.action')];
		const offsets = (row: HTMLElement) => {
			const bounds = row.getBoundingClientRect();
			const detail = row.querySelector<HTMLElement>('.detail')!.getBoundingClientRect();
			return { title: row.querySelector<HTMLElement>('.title')!.getBoundingClientRect().top - bounds.top, detail: detail.top - bounds.top, inside: detail.bottom <= bounds.bottom };
		};

		assert.deepStrictEqual(offsets(rows[1]), offsets(rows[0]));
	});
});
