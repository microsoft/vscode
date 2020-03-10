/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPick, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IQuickAccessProvider } from 'vs/platform/quickinput/common/quickAccess';
import { IEditorGroupsService, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorsOrder, IEditorIdentifier, toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { prepareQuery, IPreparedQuery, ScorerCache, scoreItem, compareItemsByScore, IItemAccessor } from 'vs/base/common/fuzzyScorer';
import { Schemas } from 'vs/base/common/network';

interface IEditorQuickPickItem extends IQuickPickItem, IEditorIdentifier { }

export abstract class BaseEditorQuickAccessProvider implements IQuickAccessProvider {

	protected abstract readonly prefix: string;

	private editorQuickPickScoringAccessor = new class implements IItemAccessor<IEditorQuickPickItem> {
		getItemLabel(entry: IEditorQuickPickItem): string | undefined {
			return entry.label;
		}

		getItemDescription(entry: IEditorQuickPickItem): string | undefined {
			return entry.description;
		}

		getItemPath(entry: IEditorQuickPickItem): string | undefined {
			const resource = toResource(entry.editor, { supportSideBySide: SideBySideEditor.MASTER });
			if (resource?.scheme === Schemas.file) {
				return resource?.fsPath;
			}

			return resource?.path;
		}
	};

	constructor(
		@IEditorGroupsService protected readonly editorGroupService: IEditorGroupsService,
		@IEditorService protected readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService
	) {
	}

	provide(picker: IQuickPick<IEditorQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Add all view items & filter on type
		const scorerCache = Object.create(null);
		const updatePickerItems = () => picker.items = this.getEditorPickItems(prepareQuery(picker.value.trim().substr(this.prefix.length)), scorerCache);
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Open the picked view on accept
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item) {
				picker.hide();
				this.editorGroupService.getGroup(item.groupId)?.openEditor(item.editor);
			}
		}));

		return disposables;
	}

	private getEditorPickItems(query: IPreparedQuery, scorerCache: ScorerCache): Array<IEditorQuickPickItem | IQuickPickSeparator> {
		const filteredEditorEntries = this.doGetEditorPickItems().filter(entry => {
			if (!query.value) {
				return true;
			}

			// Score on label and description
			const itemScore = scoreItem(entry, query, true, this.editorQuickPickScoringAccessor, scorerCache);
			if (!itemScore.score) {
				return false;
			}

			// Apply highlights
			entry.highlights = { label: itemScore.labelMatch, description: itemScore.descriptionMatch };

			return true;
		});

		// Sorting
		if (query.value) {
			const groups = this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).map(group => group.id);
			filteredEditorEntries.sort((entryA, entryB) => {
				if (entryA.groupId !== entryB.groupId) {
					return groups.indexOf(entryA.groupId) - groups.indexOf(entryB.groupId); // older groups first
				}

				return compareItemsByScore(entryA, entryB, query, true, this.editorQuickPickScoringAccessor, scorerCache);
			});
		}

		// Grouping (for more than one group)
		const filteredEditorEntriesWithSeparators: Array<IEditorQuickPickItem | IQuickPickSeparator> = [];
		if (this.editorGroupService.count > 1) {
			let lastGroupId: number | undefined = undefined;
			for (const entry of filteredEditorEntries) {
				if (typeof lastGroupId !== 'number' || lastGroupId !== entry.groupId) {
					const group = this.editorGroupService.getGroup(entry.groupId);
					if (group) {
						filteredEditorEntriesWithSeparators.push({ type: 'separator', label: group.label });
					}
					lastGroupId = entry.groupId;
				}

				filteredEditorEntriesWithSeparators.push(entry);
			}
		} else {
			filteredEditorEntriesWithSeparators.push(...filteredEditorEntries);
		}

		return filteredEditorEntriesWithSeparators;
	}

	private doGetEditorPickItems(): Array<IEditorQuickPickItem> {
		return this.doGetEditors().map(({ editor, groupId }) => ({
			editor,
			groupId,
			label: editor.isDirty() && !editor.isSaving() ? `$(circle-filled) ${editor.getName()}` : editor.getName(),
			ariaLabel: localize('entryAriaLabel', "{0}, editor picker", editor.getName()),
			description: editor.getDescription(),
			iconClasses: getIconClasses(this.modelService, this.modeService, toResource(editor, { supportSideBySide: SideBySideEditor.MASTER })),
			italic: !this.editorGroupService.getGroup(groupId)?.isPinned(editor)
		}));
	}

	protected abstract doGetEditors(): IEditorIdentifier[];
}

//#region Active Editor Group Editors by Most Recently Used

export class ActiveGroupEditorsByMostRecentlyUsedQuickAccess extends BaseEditorQuickAccessProvider {

	static PREFIX = 'edt active ';

	readonly prefix = ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX;

	protected doGetEditors(): IEditorIdentifier[] {
		const group = this.editorGroupService.activeGroup;

		return group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map(editor => ({ editor, groupId: group.id }));
	}
}

//#endregion


//#region All Editors by Appearance

export class AllEditorsByAppearanceQuickAccess extends BaseEditorQuickAccessProvider {

	static PREFIX = 'edt ';

	readonly prefix = AllEditorsByAppearanceQuickAccess.PREFIX;

	protected doGetEditors(): IEditorIdentifier[] {
		const entries: IEditorIdentifier[] = [];

		for (const group of this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE)) {
			for (const editor of group.getEditors(EditorsOrder.SEQUENTIAL)) {
				entries.push({ editor, groupId: group.id });
			}
		}

		return entries;
	}
}

//#endregion


//#region All Editors by Most Recently Used

export class AllEditorsByMostRecentlyUsedQuickAccess extends BaseEditorQuickAccessProvider {

	static PREFIX = 'edt mru ';

	readonly prefix = AllEditorsByMostRecentlyUsedQuickAccess.PREFIX;

	protected doGetEditors(): IEditorIdentifier[] {
		const entries: IEditorIdentifier[] = [];

		for (const editor of this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
			entries.push(editor);
		}

		return entries;
	}
}

//#endregion
