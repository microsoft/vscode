/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promiseWithResolvers } from 'vs/base/common/async';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { localize, localize2 } from 'vs/nls';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { Action2, IMenuService, MenuId, registerAction2, IMenu, MenuRegistry, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const builtInSource = localize('Built-In', "Built-In");
const category: ILocalizedString = localize2('Create', 'Create');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.showNewFileEntries',
			title: localize2('welcome.newFile', 'New File...'),
			category,
			f1: true,
			keybinding: {
				primary: KeyMod.Alt + KeyMod.CtrlCmd + KeyMod.WinCtrl + KeyCode.KeyN,
				weight: KeybindingWeight.WorkbenchContrib,
			},
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_new',
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<boolean> {
		return assertIsDefined(NewFileTemplatesManager.Instance).run();
	}
});

type NewFileItem = { commandID: string; title: string; from: string; group: string; commandArgs?: any };
class NewFileTemplatesManager extends Disposable {
	static Instance: NewFileTemplatesManager | undefined;

	private menu: IMenu;

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService,
	) {
		super();

		NewFileTemplatesManager.Instance = this;

		this._register({ dispose() { if (NewFileTemplatesManager.Instance === this) { NewFileTemplatesManager.Instance = undefined; } } });

		this.menu = menuService.createMenu(MenuId.NewFile, contextKeyService);
	}

	private allEntries(): NewFileItem[] {
		const items: NewFileItem[] = [];
		for (const [groupName, group] of this.menu.getActions({ renderShortTitle: true })) {
			for (const action of group) {
				if (action instanceof MenuItemAction) {
					items.push({ commandID: action.item.id, from: action.item.source?.title ?? builtInSource, title: action.label, group: groupName });
				}
			}
		}
		return items;
	}

	async run(): Promise<boolean> {
		const entries = this.allEntries();
		if (entries.length === 0) {
			throw Error('Unexpected empty new items list');
		}
		else if (entries.length === 1) {
			this.commandService.executeCommand(entries[0].commandID);
			return true;
		}
		else {
			return this.selectNewEntry(entries);
		}
	}

	private async selectNewEntry(entries: NewFileItem[]): Promise<boolean> {
		const { promise: resultPromise, resolve: resolveResult } = promiseWithResolvers<boolean>();

		const disposables = new DisposableStore();
		const qp = this.quickInputService.createQuickPick({ useSeparators: true });
		qp.title = localize('newFileTitle', "New File...");
		qp.placeholder = localize('newFilePlaceholder', "Select File Type or Enter File Name...");
		qp.sortByLabel = false;
		qp.matchOnDetail = true;
		qp.matchOnDescription = true;

		const sortCategories = (a: NewFileItem, b: NewFileItem): number => {
			const categoryPriority: Record<string, number> = { 'file': 1, 'notebook': 2 };
			if (categoryPriority[a.group] && categoryPriority[b.group]) {
				if (categoryPriority[a.group] !== categoryPriority[b.group]) {
					return categoryPriority[b.group] - categoryPriority[a.group];
				}
			}
			else if (categoryPriority[a.group]) { return 1; }
			else if (categoryPriority[b.group]) { return -1; }

			if (a.from === builtInSource) { return 1; }
			if (b.from === builtInSource) { return -1; }

			return a.from.localeCompare(b.from);
		};

		const displayCategory: Record<string, string> = {
			'file': localize('file', "File"),
			'notebook': localize('notebook', "Notebook"),
		};

		const refreshQp = (entries: NewFileItem[]) => {
			const items: (((IQuickPickItem & NewFileItem) | IQuickPickSeparator))[] = [];
			let lastSeparator: string | undefined;
			entries
				.sort((a, b) => -sortCategories(a, b))
				.forEach((entry) => {
					const command = entry.commandID;
					const keybinding = this.keybindingService.lookupKeybinding(command || '', this.contextKeyService);
					if (lastSeparator !== entry.group) {
						items.push({
							type: 'separator',
							label: displayCategory[entry.group] ?? entry.group
						});
						lastSeparator = entry.group;
					}
					items.push({
						...entry,
						label: entry.title,
						type: 'item',
						keybinding,
						buttons: command ? [
							{
								iconClass: 'codicon codicon-gear',
								tooltip: localize('change keybinding', "Configure Keybinding")
							}
						] : [],
						detail: '',
						description: entry.from,
					});
				});
			qp.items = items;
		};
		refreshQp(entries);

		disposables.add(this.menu.onDidChange(() => refreshQp(this.allEntries())));

		disposables.add(qp.onDidChangeValue((val: string) => {
			if (val === '') {
				refreshQp(entries);
				return;
			}
			const currentTextEntry: NewFileItem = {
				commandID: 'workbench.action.files.newFile',
				commandArgs: { languageId: undefined, viewType: undefined, fileName: val },
				title: localize('miNewFileWithName', "Create New File ({0})", val),
				group: 'file',
				from: builtInSource,
			};
			refreshQp([currentTextEntry, ...entries]);
		}));

		disposables.add(qp.onDidAccept(async e => {
			const selected = qp.selectedItems[0] as (IQuickPickItem & NewFileItem);
			resolveResult(!!selected);

			qp.hide();
			if (selected) { await this.commandService.executeCommand(selected.commandID, selected.commandArgs); }
		}));

		disposables.add(qp.onDidHide(() => {
			qp.dispose();
			disposables.dispose();
			resolveResult(false);
		}));

		disposables.add(qp.onDidTriggerItemButton(e => {
			qp.hide();
			this.commandService.executeCommand('workbench.action.openGlobalKeybindings', (e.item as (IQuickPickItem & NewFileItem)).commandID);
			resolveResult(false);
		}));

		qp.show();

		return resultPromise;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(NewFileTemplatesManager, LifecyclePhase.Restored);

MenuRegistry.appendMenuItem(MenuId.NewFile, {
	group: 'file',
	command: {
		id: 'workbench.action.files.newUntitledFile',
		title: localize('miNewFile2', "Text File")
	},
	order: 1
});
