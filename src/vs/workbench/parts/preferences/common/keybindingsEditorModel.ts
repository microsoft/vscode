/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMatch, IFilter, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';
import { Registry } from 'vs/platform/platform';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { CommonEditorRegistry, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { EditorModel } from 'vs/workbench/common/editor';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IKeybindingService, IKeybindingItem2, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';

export interface IKeybindingItemEntry {
	id: string;
	keybindingItem: IKeybindingItem;
	commandIdMatches?: IMatch[];
	commandLabelMatches?: IMatch[];
	keybindingMatches?: IMatch[];
}

export interface IKeybindingItem extends IKeybindingItem2 {
	commandLabel: string;
}

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);

export class KeybindingsEditorModel extends EditorModel {

	private _keybindingItems: IKeybindingItem[];

	constructor(
		@IKeybindingService private keybindingsService: IKeybindingService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
	}

	public fetch(searchValue: string): IKeybindingItemEntry[] {
		searchValue = searchValue.trim();
		return searchValue ? this.fetchKeybindingItems(searchValue) :
			this._keybindingItems.map(keybindingItem => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem }));
	}

	private fetchKeybindingItems(searchValue: string): IKeybindingItemEntry[] {
		const result: IKeybindingItemEntry[] = [];
		for (const keybindingItem of this._keybindingItems) {
			let keybindingMatches: IMatch[] = keybindingItem.keybinding ? KeybindingsEditorModel.matches(searchValue, keybindingItem.keybinding.getAriaLabel(), or(matchesWords, matchesCamelCase)) : null;
			let commandIdMatches: IMatch[] = KeybindingsEditorModel.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase));
			let commandLabelMatches: IMatch[] = keybindingItem.commandLabel ? KeybindingsEditorModel.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true)) : null;
			if (keybindingMatches || commandIdMatches || commandLabelMatches) {
				result.push({
					id: KeybindingsEditorModel.getId(keybindingItem),
					commandLabelMatches,
					keybindingItem,
					keybindingMatches,
					commandIdMatches
				});
			}
		}
		return result;
	}

	public resolve(): TPromise<EditorModel> {
		return this.extensionService.onReady()
			.then(() => {
				const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
				const editorActions = CommonEditorRegistry.getEditorActions().reduce((editorActions, editorAction) => {
					editorActions[editorAction.id] = editorAction;
					return editorActions;
				}, {});
				this._keybindingItems = this.keybindingsService.getKeybindings().map(keybinding => KeybindingsEditorModel.toKeybindingEntry(keybinding, workbenchActionsRegistry, editorActions));
				const boundCommands = this._keybindingItems.reduce((boundCommands, keybinding) => {
					boundCommands[keybinding.command] = true;
					return boundCommands;
				}, {});
				const commandsMap = CommandsRegistry.getCommands();
				for (const command in commandsMap) {
					if (!boundCommands[command]) {
						this._keybindingItems.push(KeybindingsEditorModel.toKeybindingEntry({
							keybinding: null,
							command,
							when: null,
							source: KeybindingSource.Default
						}, workbenchActionsRegistry, editorActions));
					}
				}
				this._keybindingItems = this._keybindingItems.sort((a, b) => KeybindingsEditorModel.compareKeybindingData(a, b));
				return this;
			});
	}

	private static getId(keybindingItem: IKeybindingItem2): string {
		return keybindingItem.command + (keybindingItem.keybinding ? keybindingItem.keybinding.getAriaLabel() : '') + keybindingItem.source + (keybindingItem.when ? keybindingItem.when.serialize() : '');
	}

	private static compareKeybindingData(a: IKeybindingItem, b: IKeybindingItem): number {
		if (a.keybinding && !b.keybinding) {
			return -1;
		}
		if (b.keybinding && !a.keybinding) {
			return 1;
		}
		if (a.commandLabel && !b.commandLabel) {
			return -1;
		}
		if (b.commandLabel && !a.commandLabel) {
			return 1;
		}
		if (a.commandLabel && b.commandLabel) {
			if (a.commandLabel !== b.commandLabel) {
				return a.commandLabel.localeCompare(b.commandLabel);
			}
		}
		if (a.command === b.command) {
			return a.source === KeybindingSource.User ? -1 : 1;
		}
		return a.command.localeCompare(b.command);
	}

	private static toKeybindingEntry(keybinding: IKeybindingItem2, workbenchActionsRegistry: IWorkbenchActionRegistry, editorActions: {}): IKeybindingItem {
		const workbenchAction = workbenchActionsRegistry.getWorkbenchAction(keybinding.command);
		const editorAction: EditorAction = editorActions[keybinding.command];
		return <IKeybindingItem>{
			keybinding: keybinding.keybinding,
			command: keybinding.command,
			commandLabel: editorAction ? editorAction.label : workbenchAction ? workbenchAction.label : '',
			when: keybinding.when,
			source: keybinding.source,
			category: editorAction ? localize('editorCategory', "Editor") : workbenchAction ? workbenchActionsRegistry.getCategory(workbenchAction.id) ? workbenchActionsRegistry.getCategory(workbenchAction.id) : null : null
		};
	}

	private static matches(searchValue: string, wordToMatchAgainst: string, wordMatchesFilter: IFilter): IMatch[] {
		let matches = wordFilter(searchValue, wordToMatchAgainst);
		if (!matches) {
			const words = searchValue.split(' ');
			for (const word of words) {
				const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
				if (wordMatches) {
					matches = [...(matches || []), ...wordMatches];
				} else {
					matches = null;
					break;
				}
			}
		}
		if (matches) {
			matches.sort((a, b) => {
				return a.start - b.start;
			});
		}
		return matches;
	}
}