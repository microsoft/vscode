/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, GroupsOrder } from '../../../../services/editor/common/editorGroupsService.js';
import { GroupIdentifier } from '../../../../common/editor.js';
import { IQuickInputService, IQuickInputButton, IQuickPickItem, IQuickPickSeparator, QuickInputButtonLocation } from '../../../../../platform/quickinput/common/quickInput.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BrowserActionCategory } from '../browserViewActions.js';
import { logBrowserOpen } from '../../../../../platform/browserView/common/browserViewTelemetry.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

interface IBrowserQuickPickItem extends IQuickPickItem {
	groupId: GroupIdentifier;
	editor: BrowserEditorInput;
}

const closeButtonItem: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.close),
	tooltip: localize('browser.closeTab', "Close")
};

const closeAllButtonItem: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.closeAll),
	tooltip: localize('browser.closeAllTabs', "Close All"),
	location: QuickInputButtonLocation.Inline
};

const IP_ADDRESS_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/;
const URL_LIKE_PATTERN = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/;
const LOCALHOST_PATTERN = /^localhost:\d+(\/\S*)?$/;

/**
 * Checks if the input looks like a URL and returns the full URL with protocol,
 * or `undefined` if it doesn't look like a URL.
 */
function tryParseAsUrl(value: string): string | undefined {
	value = value.trim();
	if (!value) {
		return undefined;
	}

	// Already has a protocol
	if (/^https?:\/\//i.test(value)) {
		return value;
	}

	// localhost or IP address default to http
	if (LOCALHOST_PATTERN.test(value) || IP_ADDRESS_PATTERN.test(value)) {
		return `http://${value}`;
	}

	// foo.bar style domains default to https
	if (URL_LIKE_PATTERN.test(value)) {
		return `https://${value}`;
	}

	return undefined;
}

/**
 * Manages a quick pick that lists all open browser tabs grouped by editor group,
 * with close buttons, live updates, and an always-visible "New Integrated Browser Tab" entry.
 */
class BrowserTabQuickPick extends Disposable {

	private readonly _quickPick;
	private readonly _itemListeners = this._register(new DisposableStore());
	private _resolvedUrl: string | undefined;

	private readonly _openUrlPick: IBrowserQuickPickItem = {
		groupId: -1,
		editor: undefined!,
		label: '',
		iconClass: ThemeIcon.asClassName(Codicon.globe),
		alwaysShow: true,
	};

	private readonly _openNewTabPick: IBrowserQuickPickItem = {
		groupId: -1,
		editor: undefined!,
		label: localize('browser.openNewTab', "New Integrated Browser Tab"),
		iconClass: ThemeIcon.asClassName(Codicon.add),
		alwaysShow: true,
	};

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		this._quickPick = this._register(quickInputService.createQuickPick<IBrowserQuickPickItem>({ useSeparators: true }));
		this._quickPick.placeholder = localize('browser.quickOpenPlaceholder', "Select a browser tab or enter a URL");
		this._quickPick.matchOnDescription = true;
		this._quickPick.sortByLabel = false;
		this._quickPick.buttons = [closeAllButtonItem];

		this._register(this._quickPick.onDidChangeValue(value => {
			this._resolvedUrl = tryParseAsUrl(value);
			if (this._resolvedUrl) {
				this._openUrlPick.label = localize('browser.openUrl', "Open {0} in New Tab", this._resolvedUrl);
			}
			this._buildItems();
		}));

		this._register(this._quickPick.onDidTriggerItemButton(async ({ item }) => {
			if (!item.editor) {
				return;
			}
			const group = this._editorGroupsService.getGroup(item.groupId);
			if (group) {
				await group.closeEditor(item.editor, {
					preserveFocus: true // Don't shift focus so the quickpick doesn't close
				});
			}
		}));

		this._register(this._quickPick.onDidTriggerButton(async () => {
			for (const group of this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
				const browserEditors = group.editors.filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput);
				if (browserEditors.length > 0) {
					await group.closeEditors(browserEditors, {
						preserveFocus: true // Don't shift focus so the quickpick doesn't close
					});
				}
			}
		}));

		this._register(this._quickPick.onDidAccept(async () => {
			const [selected] = this._quickPick.selectedItems;
			if (!selected) {
				return;
			}
			if (selected === this._openNewTabPick) {
				logBrowserOpen(telemetryService, 'quickOpenWithoutUrl');
				await this._editorService.openEditor({
					resource: BrowserViewUri.forId(generateUuid()),
				});
			} else if (selected === this._openUrlPick && this._resolvedUrl) {
				logBrowserOpen(telemetryService, 'quickOpenWithUrl');
				await this._editorService.openEditor({
					resource: BrowserViewUri.forId(generateUuid()),
					options: { viewState: { url: this._resolvedUrl } },
				});
			} else {
				await this._editorService.openEditor(selected.editor, selected.groupId);
			}
		}));

		this._register(this._quickPick.onDidHide(() => this.dispose()));
	}

	show(): void {
		this._buildItems();

		// Pre-select the currently active browser editor
		const activeEditor = this._editorService.activeEditor;
		if (activeEditor instanceof BrowserEditorInput) {
			const activePick = (this._quickPick.items as readonly (IBrowserQuickPickItem | IQuickPickSeparator)[])
				.find((item): item is IBrowserQuickPickItem => item.type !== 'separator' && item.editor === activeEditor);
			if (activePick) {
				this._quickPick.activeItems = [activePick];
			}
		}

		this._quickPick.show();
	}

	private _buildItems(): void {
		this._itemListeners.clear();

		// Remember which editor was active so we can restore selection
		const activeEditor = this._quickPick.activeItems[0]?.editor;

		const picks: (IBrowserQuickPickItem | IQuickPickSeparator)[] = [];
		const groups = this._editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);

		const groupsWithBrowserEditors = groups
			.map(group => ({ group, browserEditors: group.editors.filter((e): e is BrowserEditorInput => e instanceof BrowserEditorInput) }))
			.filter(({ browserEditors }) => browserEditors.length > 0);
		const multipleGroups = groupsWithBrowserEditors.length > 1;

		// Build a map of group ID to aria label for screen readers
		const mapGroupIdToGroupAriaLabel = new Map<GroupIdentifier, string>();
		for (const { group } of groupsWithBrowserEditors) {
			mapGroupIdToGroupAriaLabel.set(group.id, group.ariaLabel);
		}

		let newActivePick: IBrowserQuickPickItem | undefined;

		for (const { group, browserEditors } of groupsWithBrowserEditors) {
			if (multipleGroups) {
				picks.push({ type: 'separator', label: group.label });
			}
			for (const editor of browserEditors) {
				const icon = editor.getIcon();
				const description = editor.getDescription();
				const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
				const pick: IBrowserQuickPickItem = {
					groupId: group.id,
					editor,
					label: editor.getName(),
					ariaLabel: multipleGroups
						? localize('browserEntryAriaLabelWithGroup', "{0}, {1}", nameAndDescription, mapGroupIdToGroupAriaLabel.get(group.id))
						: nameAndDescription,
					description,
					buttons: [closeButtonItem],
					italic: !group.isPinned(editor),
				};
				if (icon instanceof URI) {
					pick.iconPath = { dark: icon };
				} else if (icon) {
					pick.iconClass = ThemeIcon.asClassName(icon);
				}
				picks.push(pick);

				if (editor === activeEditor) {
					newActivePick = pick;
				}

				this._itemListeners.add(editor.onDidChangeLabel(() => this._buildItems()));
			}
			this._itemListeners.add(group.onDidModelChange(() => this._buildItems()));
		}

		picks.push({ type: 'separator' });
		if (this._resolvedUrl) {
			picks.push(this._openUrlPick);
		}
		picks.push(this._openNewTabPick);

		this._quickPick.keepScrollPosition = true;
		this._quickPick.items = picks;
		if (newActivePick) {
			this._quickPick.activeItems = [newActivePick];
		}
	}
}

class QuickOpenBrowserAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.browser.quickOpen',
			title: localize2('browser.quickOpenAction', "Quick Open Browser Tab..."),
			category: BrowserActionCategory,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const picker = accessor.get(IInstantiationService).createInstance(BrowserTabQuickPick);
		picker.show();
	}
}

registerAction2(QuickOpenBrowserAction);
