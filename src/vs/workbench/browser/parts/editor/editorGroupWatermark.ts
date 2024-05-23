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
import { append, clearNode, $, h } from 'vs/base/browser/dom';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { defaultKeybindingLabelStyles } from 'vs/platform/theme/browser/defaultStyles';
import { editorForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));

interface WatermarkEntry {
	readonly text: string;
	readonly id: string;
	readonly mac?: boolean;
	readonly when?: ContextKeyExpression;
}

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
	showCommands,
	openFileNonMacOnly,
	openFolderNonMacOnly,
	openFileOrFolderMacOnly,
	openRecent,
	newUntitledFileMacOnly
];

const folderEntries = [
	showCommands,
	quickAccess,
	findInFiles,
	startDebugging,
	toggleTerminal,
	toggleFullscreen,
	showSettings
];

export class EditorGroupWatermark extends Disposable {
	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private enabled: boolean = false;
	private workbenchState: WorkbenchState;
	private keybindingLabels = new Set<KeybindingLabel>();

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const elements = h('.editor-group-watermark', [
			h('.letterpress'),
			h('.shortcuts@shortcuts'),
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts;

		this.registerListeners();

		this.workbenchState = contextService.getWorkbenchState();
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

	private render(): void {
		const enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');

		if (enabled === this.enabled) {
			return;
		}

		this.enabled = enabled;
		this.clear();

		if (!enabled) {
			return;
		}

		const box = append(this.shortcuts, $('.watermark-box'));
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

	private clear(): void {
		clearNode(this.shortcuts);
		this.transientDisposables.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
		this.keybindingLabels.forEach(label => label.dispose());
	}
}
