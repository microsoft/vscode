/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';

interface WatermarkEntry {
	readonly id: string;
	readonly text: string;
	readonly when?: {
		native?: ContextKeyExpression;
		web?: ContextKeyExpression;
	};
}

const showChatContextKey = ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupDisabled', false));

const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showChatContextKey, web: showChatContextKey } };

const emptyWindowEntries: WatermarkEntry[] = coalesce([
	openChat,
	showCommands,
	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
	openRecent,
	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
]);

const workspaceEntries: WatermarkEntry[] = [
	openChat,
	showCommands,
];

export class EditorGroupWatermark extends Disposable {

	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';

	private readonly cachedWhen: { [when: string]: boolean };

	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly keybindingLabels = this._register(new DisposableStore());

	private enabled = false;
	private workbenchState: WorkbenchState;

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.cachedWhen = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));
		this.workbenchState = this.contextService.getWorkbenchState();

		const elements = h('.editor-group-watermark', [
			h('.watermark-container', [
				h('.letterpress'),
				h('.shortcuts@shortcuts'),
			])
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts;

		this.registerListeners();

		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration('workbench.tips.enabled') &&
				this.enabled !== this.configurationService.getValue<boolean>('workbench.tips.enabled')
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
				const entries = [...emptyWindowEntries, ...workspaceEntries];
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
		this.enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');

		clearNode(this.shortcuts);
		this.transientDisposables.clear();

		if (!this.enabled) {
			return;
		}

		const entries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries);

		const box = append(this.shortcuts, $('.watermark-box'));

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

	private filterEntries(entries: WatermarkEntry[]): WatermarkEntry[] {
		const filteredEntries = entries
			.filter(entry => (isWeb && !entry.when?.web) || (!isWeb && !entry.when?.native) || this.cachedWhen[entry.id])
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		return filteredEntries;
	}
}
