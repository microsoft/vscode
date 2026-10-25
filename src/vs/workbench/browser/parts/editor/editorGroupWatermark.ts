/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, h } from '../../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { coalesce, shuffle } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';

interface WatermarkEntry {
	readonly id: string;
	readonly text: string;
	readonly icon: ThemeIcon;
	readonly when?: {
		native?: ContextKeyExpression;
		web?: ContextKeyExpression;
	};
}

const showChatContextKey = ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupDisabledInWorkspace', false));

const openChat: WatermarkEntry = {
	text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open',
	icon: registerIcon('watermark-chat', Codicon.chatSparkle, localize('watermark.chatIcon', "Icon for opening chat in the editor watermark.")),
	when: { native: showChatContextKey, web: showChatContextKey }
};
const showCommands: WatermarkEntry = {
	text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands',
	icon: registerIcon('watermark-commands', Codicon.listSelection, localize('watermark.commandsIcon', "Icon for showing all commands in the editor watermark."))
};
const gotoFile: WatermarkEntry = {
	text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen',
	icon: registerIcon('watermark-quick-open', Codicon.goToFile, localize('watermark.quickOpenIcon', "Icon for going to a file in the editor watermark."))
};
const openFile: WatermarkEntry = {
	text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile',
	icon: registerIcon('watermark-open-file', Codicon.goToFile, localize('watermark.openFileIcon', "Icon for opening a file in the editor watermark."))
};
const openFolder: WatermarkEntry = {
	text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder',
	icon: registerIcon('watermark-open-folder', Codicon.folderOpened, localize('watermark.openFolderIcon', "Icon for opening a folder in the editor watermark."))
};
const openFileOrFolder: WatermarkEntry = {
	text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder',
	icon: registerIcon('watermark-open-file-folder', Codicon.folderOpened, localize('watermark.openFileFolderIcon', "Icon for opening a file or folder in the editor watermark."))
};
const openRecent: WatermarkEntry = {
	text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent',
	icon: registerIcon('watermark-open-recent', Codicon.history, localize('watermark.openRecentIcon', "Icon for opening a recent workspace in the editor watermark."))
};
const newUntitledFile: WatermarkEntry = {
	text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile',
	icon: registerIcon('watermark-new-file', Codicon.newFile, localize('watermark.newFileIcon', "Icon for creating a file in the editor watermark."))
};
const findInFiles: WatermarkEntry = {
	text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles',
	icon: registerIcon('watermark-find-in-files', Codicon.search, localize('watermark.findInFilesIcon', "Icon for finding in files in the editor watermark."))
};
const toggleTerminal: WatermarkEntry = {
	text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal',
	icon: registerIcon('watermark-terminal', Codicon.terminal, localize('watermark.terminalIcon', "Icon for toggling the terminal in the editor watermark.")),
	when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) }
};
const startDebugging: WatermarkEntry = {
	text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start',
	icon: registerIcon('watermark-debug', Codicon.debugStart, localize('watermark.debugIcon', "Icon for starting debugging in the editor watermark.")),
	when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) }
};
const openSettings: WatermarkEntry = {
	text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings',
	icon: registerIcon('watermark-settings', Codicon.settings, localize('watermark.settingsIcon', "Icon for opening settings in the editor watermark."))
};

const baseEntries: WatermarkEntry[] = [
	openChat,
	showCommands,
];

const emptyWindowEntries: WatermarkEntry[] = coalesce([
	...baseEntries,
	openRecent,
	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
]);

const workspaceEntries: WatermarkEntry[] = [
	...baseEntries,
];

const otherEntries: WatermarkEntry[] = [
	gotoFile,
	findInFiles,
	startDebugging,
	toggleTerminal,
	openSettings,
];

export class EditorGroupWatermark extends Disposable {

	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';
	private static readonly SETTINGS_KEY = 'workbench.tips.enabled';
	private static readonly MINIMUM_ENTRIES = 3;

	private readonly cachedWhen: { [when: string]: boolean };

	private readonly shortcuts: HTMLElement;
	private readonly toolbarContainer: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly shortcutDisposables = this._register(new DisposableStore());

	private enabled = false;
	private workbenchState: WorkbenchState;

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this.cachedWhen = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));
		this.workbenchState = this.contextService.getWorkbenchState();

		const elements = h('.editor-group-watermark-wrapper', [
			h('.editor-group-watermark-toolbar-container@toolbarContainer'),
			h('.editor-group-watermark', [
				h('.watermark-container', [
					h('.letterpress'),
					h('.shortcuts@shortcuts'),
				])
			])
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts;
		this.toolbarContainer = elements.toolbarContainer;

		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.toolbarContainer, MenuId.EditorGroupWatermarkToolbar, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			highlightToggledItems: true,
			menuOptions: { shouldForwardArgs: true }
		}));

		this.registerListeners();

		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(EditorGroupWatermark.SETTINGS_KEY) &&
				this.enabled !== this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY)
			) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState !== workbenchState) {
				this.workbenchState = workbenchState;
				this.render();
			}
		}));

		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				const entries = [...emptyWindowEntries, ...workspaceEntries, ...otherEntries];
				for (const entry of entries) {
					const when = isWeb ? entry.when?.web : entry.when?.native;
					if (when) {
						this.cachedWhen[entry.id] = this.contextKeyService.contextMatchesRules(when);
					}
				}

				this.storageService.store(EditorGroupWatermark.CACHED_WHEN, JSON.stringify(this.cachedWhen), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}));
	}

	private render(): void {
		this.enabled = this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY);

		clearNode(this.shortcuts);
		this.transientDisposables.clear();
		this.shortcutDisposables.clear();

		if (!this.enabled) {
			return;
		}

		const entries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries);
		if (entries.length < EditorGroupWatermark.MINIMUM_ENTRIES) {
			const additionalEntries = this.filterEntries(otherEntries);
			shuffle(additionalEntries);
			entries.push(...additionalEntries.slice(0, EditorGroupWatermark.MINIMUM_ENTRIES - entries.length));
		}

		const box = append(this.shortcuts, $('.watermark-box'));

		const update = () => {
			clearNode(box);
			this.shortcutDisposables.clear();

			const shortcuts = new Map<string, { entry: WatermarkEntry; keybinding: ResolvedKeybinding }>();
			for (const entry of entries) {
				const keybinding = this.keybindingService.lookupKeybinding(entry.id);
				if (keybinding) {
					shortcuts.set(entry.id, { entry, keybinding });
				}
			}

			const actionBar = this.shortcutDisposables.add(new ActionBar(box, {
				orientation: ActionsOrientation.VERTICAL,
				ariaLabel: localize('watermark.shortcuts', "Editor Shortcuts"),
				actionViewItemProvider: action => {
					const shortcut = shortcuts.get(action.id);
					return shortcut ? this.instantiationService.createInstance(WatermarkActionViewItem, action, shortcut.entry.icon, shortcut.keybinding) : undefined;
				},
			}));
			this.shortcutDisposables.add(actionBar.onDidRun(e => {
				if (e.error && !isCancellationError(e.error)) {
					this.notificationService.error(e.error);
				}
			}));

			for (const { entry } of shortcuts.values()) {
				actionBar.push(this.shortcutDisposables.add(new Action(entry.id, entry.text, undefined, true, () => this.commandService.executeCommand(entry.id))));
			}
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	private filterEntries(entries: WatermarkEntry[]): WatermarkEntry[] {
		const filteredEntries = entries
			.filter(entry => {
				if (this.cachedWhen[entry.id]) {
					return true; // cached from previous session
				}

				const contextKey = isWeb ? entry.when?.web : entry.when?.native;
				return !contextKey /* works without context */ || this.contextKeyService.contextMatchesRules(contextKey);
			})
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		return filteredEntries;
	}
}

class WatermarkActionViewItem extends BaseActionViewItem {

	constructor(
		action: IAction,
		private readonly icon: ThemeIcon,
		private readonly keybinding: ResolvedKeybinding,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		const row = append(container, $('a.action-label.watermark-entry'));
		super.render(row);
		row.setAttribute('role', 'button');
		row.setAttribute('aria-label', localize('watermark.shortcutAriaLabel', "{0} ({1})", this._action.label, this.keybinding.getAriaLabel()));

		const icon = append(row, renderIcon(this.icon));
		icon.classList.add('watermark-icon');
		icon.setAttribute('aria-hidden', 'true');
		append(row, $('span.watermark-label')).textContent = this._action.label;
		this._register(new KeybindingLabel(append(row, $('span.watermark-keybinding')), OS, defaultKeybindingLabelStyles)).set(this.keybinding);
		this._register(this.hoverService.setupDelayedHover(row, { content: this._action.label }));
	}
}
