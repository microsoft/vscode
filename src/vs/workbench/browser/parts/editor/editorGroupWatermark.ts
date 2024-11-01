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

interface WatermarkEntry {
	readonly text: string;
	readonly id: string;
	readonly mac?: boolean;
	readonly when?: ContextKeyExpression;
}

const openPearAIChat: WatermarkEntry = { text: localize('watermark.openPearAIChat', "Open Chat"), id: 'pearai.focusContinueInput', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const bigChat: WatermarkEntry = { text: localize('watermark.pearAIBigChat', "Big Chat"), id: 'pearai.resizeAuxiliaryBarWidth', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const prevChat: WatermarkEntry = { text: localize('watermark.pearAIPrevChat', "Previous Chat"), id: 'pearai.loadRecentChat', when: ContextKeyExpr.has('pearAIExtensionLoaded') };
const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const quickAccess: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFileNonMacOnly: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile', mac: false };
const openFolderNonMacOnly: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder', mac: false };
const openFileOrFolderMacOnly: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder', mac: true };
const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFileMacOnly: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile', mac: true };
const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
const toggleFullscreen: WatermarkEntry = { text: localize({ key: 'watermark.toggleFullscreen', comment: ['toggle is a verb here'] }, "Toggle Full Screen"), id: 'workbench.action.toggleFullScreen' };
const showSettings: WatermarkEntry = { text: localize('watermark.showSettings', "Show Settings"), id: 'workbench.action.openSettings' };

const noFolderEntries = [
	openPearAIChat,
	bigChat,
	prevChat,
	showCommands,
	openFileNonMacOnly,
	openFolderNonMacOnly,
	openFileOrFolderMacOnly,
	openRecent,
	newUntitledFileMacOnly
];

const folderEntries = [
	openPearAIChat,
	bigChat,
	prevChat,
	showCommands,
	quickAccess,
	findInFiles,
	startDebugging,
	toggleTerminal,
	toggleFullscreen,
	showSettings
];

export class EditorGroupWatermark extends Disposable {
	private readonly watermark: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private enabled: boolean = false;
	private workbenchState: WorkbenchState;
	private keybindingLabels = new Set<KeybindingLabel>();

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.tips.enabled')) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState === workbenchState) {
				return;
			}

			this.workbenchState = workbenchState;
			this.render();
		}));

		const allEntriesWhenClauses = [...noFolderEntries, ...folderEntries].filter(entry => entry.when !== undefined).map(entry => entry.when!);
		const allKeys = new Set<string>();
		allEntriesWhenClauses.forEach(when => when.keys().forEach(key => allKeys.add(key)));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(allKeys)) {
				this.render();
			}
		}));
	}

	private async render(): Promise<void> {
		// Wait for the all extensions to be activated
		await this.extensionService.activateByEvent('onStartupFinished');
		// TODO: @Himanshu-Singh-Chauhan - this should be set from inside the extension, test it later, if it works, remove this
		this.contextKeyService.createKey('pearAIExtensionLoaded', true); // Set a context key when the PearAI extension is loaded

		const enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');

		if (enabled === this.enabled) {
			return;
		}

		this.enabled = enabled;
		this.clear();

		if (!enabled) {
			return;
		}

		const hasWorkspace = this.workbenchState !== WorkbenchState.EMPTY;

		if (!hasWorkspace) {
			this.renderNoWorkspaceWatermark();
			return;
		}

		append(this.watermark, $('.letterpress'));
		const shortcuts = append(this.watermark, $('.shortcuts'));
		const box = append(shortcuts, $('.watermark-box'));
		const folder = this.workbenchState !== WorkbenchState.EMPTY;
		const selected = (folder ? folderEntries : noFolderEntries)
			.filter(entry => !('when' in entry) || this.contextKeyService.contextMatchesRules(entry.when))
			.filter(entry => !('mac' in entry) || entry.mac === (isMacintosh && !isWeb))
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		const update = () => {
			clearNode(box);
			this.keybindingLabels.forEach(label => label.dispose());
			this.keybindingLabels.clear();

			for (const entry of selected) {
				const keys = this.keybindingService.lookupKeybinding(entry.id);
				if (!keys) {
					continue;
				}
				const dl = append(box, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = entry.text;
				const dd = append(dl, $('dd'));
				const label = new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				label.set(keys);
				this.keybindingLabels.add(label);
			}
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	private async renderNoWorkspaceWatermark(): Promise<void> {
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

	private clear(): void {
		clearNode(this.watermark);
		this.transientDisposables.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
		this.keybindingLabels.forEach(label => label.dispose());
	}
}
