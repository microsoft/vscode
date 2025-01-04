/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isMacintosh, isWeb, OS } from 'vs/base/common/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { append, clearNode, $, h, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { defaultKeybindingLabelStyles } from 'vs/platform/theme/browser/defaultStyles';
import { editorForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { isRecentFolder, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWindowOpenable } from 'vs/platform/window/common/window';
import { ILabelService, Verbosity } from 'vs/platform/label/common/label';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { splitRecentLabel } from 'vs/base/common/labels';

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));
import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { append, clearNode, $, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { coalesce, shuffle } from '../../../../base/common/arrays.js';

interface WatermarkEntry {
	readonly id: string;
	readonly text: string;
	readonly id: string;
	readonly mac?: boolean;
	readonly when?: ContextKeyExpression;
}

const openPearAIChat: WatermarkEntry = { text: localize('watermark.openPearAIChat', "Open Chat"), id: 'pearai.focusContinueInput', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const openPearAIChat: WatermarkEntry = { text: localize('watermark.openPearAIChat', "Open Chat"), id: 'pearai.focusContinueInput', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const bigChat: WatermarkEntry = { text: localize('watermark.pearAIBigChat', "Big Chat"), id: 'pearai.resizeAuxiliaryBarWidth', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const prevChat: WatermarkEntry = { text: localize('watermark.pearAIPrevChat', "Previous Chat"), id: 'pearai.loadRecentChat', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const gotoFile: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const openSettings: WatermarkEntry = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };
const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: ContextKeyExpr.equals('chatSetupInstalled', true), web: ContextKeyExpr.equals('chatSetupInstalled', true) } };
const openCopilotEdits: WatermarkEntry = { text: localize('watermark.openCopilotEdits', "Open Copilot Edits"), id: 'workbench.action.chat.openEditSession', when: { native: ContextKeyExpr.equals('chatSetupInstalled', true), web: ContextKeyExpr.equals('chatSetupInstalled', true) } };

const emptyWindowEntries: WatermarkEntry[] = coalesce([
	openPearAIChat,
	bigChat,
	prevChat,
	showCommands,
	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
	openRecent,
	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
	openChat
]);

const randomEmptyWindowEntries: WatermarkEntry[] = [
	/* Nothing yet */
];

const workspaceEntries: WatermarkEntry[] = [
	openPearAIChat,
	bigChat,
	prevChat,
	showCommands,
	gotoFile,
	openChat
];

const randomWorkspaceEntries: WatermarkEntry[] = [
	findInFiles,
	startDebugging,
	toggleTerminal,
	openSettings,
	openCopilotEdits
];

export class EditorGroupWatermark extends Disposable {

	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';

	private readonly cachedWhen: { [when: string]: boolean } = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));

	private readonly watermark: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly keybindingLabels = this._register(new DisposableStore());

	private enabled = false;
	private workbenchState = this.contextService.getWorkbenchState();

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();
		this.workbenchState = contextService.getWorkbenchState();
		const hasWorkspace = this.workbenchState !== WorkbenchState.EMPTY;

		const elements = h('.editor-group-watermark-' + (hasWorkspace ? 'workspace' : 'no-workspace'));

		append(container, elements.root);
		this.watermark = elements.root;
		this.registerListeners();

		this.workbenchState = contextService.getWorkbenchState();
		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.tips.enabled') && this.enabled !== this.configurationService.getValue<boolean>('workbench.tips.enabled')) {
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
				const entries = [...emptyWindowEntries, ...randomEmptyWindowEntries, ...workspaceEntries, ...randomWorkspaceEntries];
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

	private async render(): Promise<void> {
		// Wait for the all extensions to be activated
		await this.extensionService.activateByEvent('onStartupFinished');
		// TODO: @Himanshu-Singh-Chauhan - this should be set from inside the extension, test it later, if it works, remove this
		this.contextKeyService.createKey('pearAIExtensionLoaded', true); // Set a context key when the PearAI extension is loaded

		this.enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');

		clearNode(this.shortcuts);
		this.transientDisposables.clear();

		if (!this.enabled) {
			return;
		}

		const fixedEntries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries, false /* not shuffled */);
		const randomEntries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? randomWorkspaceEntries : randomEmptyWindowEntries, true /* shuffled */).slice(0, Math.max(0, 5 - fixedEntries.length));
		const entries = [...fixedEntries, ...randomEntries];

		const hasWorkspace = this.workbenchState !== WorkbenchState.EMPTY;

		if (!hasWorkspace) {
			this.renderNoWorkspaceWatermark();
			return;
		}

		append(this.watermark, $('.letterpress'));
		const shortcuts = append(this.watermark, $('.shortcuts'));
		const box = append(shortcuts, $('.watermark-box'));

		const update = () => {
			clearNode(box);
			this.keybindingLabels.clear();

			for (const entry of entries) {
				const keys = this.keybindingService.lookupKeybinding(entry.id);
				if (!keys) {
					continue;
				}

				const dl = append(box, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = entry.text;

				const dd = append(dl, $('dd'));

				const label = this.keybindingLabels.add(new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles }));
				label.set(keys);
			}
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	private async renderNoWorkspaceWatermark(): Promise<void> {
		// close the sidebar on new window open
		this.commandService.executeCommand('workbench.action.closeAuxiliaryBar');
		const container = append(this.watermark, $('.editor-group-watermark-no-workspace'));

		// button container
		const buttonContainer = append(container, $('.button-container'));
		const openFolderButton = append(buttonContainer, $('button.open-folder-button'));
		// folder icon and text in separate spans
		append(openFolderButton, $('span.codicon.codicon-folder-opened'));
		append(openFolderButton, $('span.text', {}, localize('watermark.openFolder', "Open Folder")));
		// click handler for Open Folder button
		this._register(addDisposableListener(openFolderButton, EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand('workbench.action.files.openFolder');
		}));

		// New File text button
		const newFileItem = append(container, $('.new-file-item'));
		newFileItem.textContent = localize('watermark.newFile', "New File");
		newFileItem.style.cursor = 'pointer';

		const newFileKeybinding = this.keybindingService.lookupKeybinding('workbench.action.files.newUntitledFile')?.getLabel();
		newFileItem.title = newFileKeybinding ?
			localize('watermark.newFileWithKeybinding', "New File ({0})", newFileKeybinding) :
			localize('watermark.newFile', "New File");

		this._register(addDisposableListener(newFileItem, EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand('workbench.action.files.newUntitledFile');
		}));

		// recent folders and workspaces list
		const recentList = append(container, $('.recent-list'));

		const recentlyOpened = await this.workspacesService.getRecentlyOpened();
		const recents = recentlyOpened.workspaces
			.filter(recent => !this.contextService.isCurrentWorkspace(
				isRecentFolder(recent) ? recent.folderUri : recent.workspace.configPath
			))
			.slice(0, 6);

		if (recents.length === 0) {
			const noRecentsElement = append(recentList, $('.recent-item'));
			noRecentsElement.textContent = localize('watermark.noRecents', "No Recent Folders");
			return;
		}

		recents.forEach(recent => {
			const itemElement = append(recentList, $('.recent-item'));

			let fullPath: string;
			let windowOpenable: IWindowOpenable;

			if (isRecentFolder(recent)) {
				windowOpenable = { folderUri: recent.folderUri };
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: Verbosity.LONG });
			} else {
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
				windowOpenable = { workspaceUri: recent.workspace.configPath };
			}

			const { name, parentPath } = splitRecentLabel(fullPath);

			itemElement.textContent = name;
			if (parentPath) {
				append(itemElement, $('span.spacer'));
				const pathSpan = append(itemElement, $('span.path'));
				pathSpan.textContent = parentPath;
			}

			itemElement.title = fullPath;
			itemElement.style.cursor = 'pointer';

			this._register(addDisposableListener(itemElement, EventType.CLICK, async (e: MouseEvent) => {
				try {
					e.preventDefault();
					e.stopPropagation();
					await this.hostService.openWindow([windowOpenable], {
						forceNewWindow: e.ctrlKey || e.metaKey,
						remoteAuthority: recent.remoteAuthority ?? null
					});
				} catch (error) {
					console.error('Failed to open recent item:', error);
				}
			}));
		});

		// "More..." item
		const moreItem = append(recentList, $('.more-item'));
		moreItem.textContent = localize('watermark.more', "More...");
		moreItem.title = localize('watermark.showMoreRecents', "Show All Recent Folders");
		moreItem.style.cursor = 'pointer';
		this._register(addDisposableListener(moreItem, EventType.CLICK, (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.commandService.executeCommand('workbench.action.openRecent');
		}));
	}

	private filterEntries(entries: WatermarkEntry[], shuffleEntries: boolean): WatermarkEntry[] {
		const filteredEntries = entries
			.filter(entry => (isWeb && !entry.when?.web) || (!isWeb && !entry.when?.native) || this.cachedWhen[entry.id])
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		if (shuffleEntries) {
			shuffle(filteredEntries);
		}

		return filteredEntries;
	}
}

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));
