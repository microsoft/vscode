/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isMacintosh, isWeb, OS } from 'vs/base/common/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as nls from 'vs/nls';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { append, clearNode, $, h } from 'vs/base/browser/dom';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { defaultKeybindingLabelStyles } from 'vs/platform/theme/browser/defaultStyles';

interface WatermarkEntry {
	text: string;
	id: string;
	mac?: boolean;
	when?: ContextKeyExpression;
}

const showCommands: WatermarkEntry = { text: nls.localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const quickAccess: WatermarkEntry = { text: nls.localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFileNonMacOnly: WatermarkEntry = { text: nls.localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile', mac: false };
const openFolderNonMacOnly: WatermarkEntry = { text: nls.localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder', mac: false };
const openFileOrFolderMacOnly: WatermarkEntry = { text: nls.localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder', mac: true };
const openRecent: WatermarkEntry = { text: nls.localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile: WatermarkEntry = { text: nls.localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const newUntitledFileMacOnly: WatermarkEntry = Object.assign({ mac: true }, newUntitledFile);
const findInFiles: WatermarkEntry = { text: nls.localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal: WatermarkEntry = { text: nls.localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
const startDebugging: WatermarkEntry = { text: nls.localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: ContextKeyExpr.equals('terminalProcessSupported', true) };
const toggleFullscreen: WatermarkEntry = { text: nls.localize({ key: 'watermark.toggleFullscreen', comment: ['toggle is a verb here'] }, "Toggle Full Screen"), id: 'workbench.action.toggleFullScreen', when: ContextKeyExpr.equals('terminalProcessSupported', true).negate() };
const showSettings: WatermarkEntry = { text: nls.localize('watermark.showSettings', "Show Settings"), id: 'workbench.action.openSettings', when: ContextKeyExpr.equals('terminalProcessSupported', true).negate() };

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
	private transientDisposables = this._register(new DisposableStore());
	private enabled: boolean = false;
	private workbenchState: WorkbenchState;

	constructor(
		container: HTMLElement,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
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
		this.lifecycleService.onDidShutdown(() => this.dispose());

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
			.filter(entry => !!CommandsRegistry.getCommand(entry.id));

		const update = () => {
			clearNode(box);
			selected.map(entry => {
				const dl = append(box, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = entry.text;
				const dd = append(dl, $('dd'));
				const keybinding = new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles });
				keybinding.set(this.keybindingService.lookupKeybinding(entry.id));
			});
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));

		/* __GDPR__
		"watermark:open" : {
			"owner": "digitarald"
		}
		*/
		this.telemetryService.publicLog('watermark:open');
	}

	private clear(): void {
		clearNode(this.shortcuts);
		this.transientDisposables.clear();
	}

	override dispose(): void {
		super.dispose();
		this.clear();
	}
}
