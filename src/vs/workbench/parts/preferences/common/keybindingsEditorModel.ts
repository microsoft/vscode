/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct } from 'vs/base/common/arrays';
import { language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { IMatch, IFilter, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';
import { Registry } from 'vs/platform/platform';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { CommonEditorRegistry, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { EditorModel } from 'vs/workbench/common/editor';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';

export const KEYBINDING_ENTRY_TEMPLATE_ID = 'keybinding.entry.template';
export const KEYBINDING_HEADER_TEMPLATE_ID = 'keybinding.header.template';

export interface IListEntry {
	id: string;
	templateId: string;
}

export interface IKeybindingItemEntry extends IListEntry {
	keybindingItem: IKeybindingItem;
	commandIdMatches?: IMatch[];
	commandLabelMatches?: IMatch[];
	commandDefaultLabelMatches?: IMatch[];
	sourceMatches?: IMatch[];
	whenMatches?: IMatch[];
	keybindingMatches?: IMatch[];
}

export interface IKeybindingItem {
	keybinding: ResolvedKeybinding;
	keybindingItem: ResolvedKeybindingItem;
	commandLabel: string;
	commandDefaultLabel: string;
	command: string;
	source: string;
	when: string;
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
			this._keybindingItems.map(keybindingItem => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
	}

	private fetchKeybindingItems(searchValue: string): IKeybindingItemEntry[] {
		const result: IKeybindingItemEntry[] = [];
		for (const keybindingItem of this._keybindingItems) {
			let keybindingMatches = new KeybindingMatches(keybindingItem, searchValue);
			if (keybindingMatches.commandIdMatches
				|| keybindingMatches.commandLabelMatches
				|| keybindingMatches.commandDefaultLabelMatches
				|| keybindingMatches.sourceMatches
				|| keybindingMatches.whenMatches
				|| keybindingMatches.keybindingMatches) {
				result.push({
					id: KeybindingsEditorModel.getId(keybindingItem),
					templateId: KEYBINDING_ENTRY_TEMPLATE_ID,
					commandLabelMatches: keybindingMatches.commandLabelMatches,
					commandDefaultLabelMatches: keybindingMatches.commandDefaultLabelMatches,
					keybindingItem,
					keybindingMatches: keybindingMatches.keybindingMatches,
					commandIdMatches: keybindingMatches.commandIdMatches,
					sourceMatches: keybindingMatches.sourceMatches,
					whenMatches: keybindingMatches.whenMatches
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

				this._keybindingItems = [];
				const boundCommands: Map<string, boolean> = new Map<string, boolean>();
				for (const keybinding of this.keybindingsService.getKeybindings()) {
					if (keybinding.command) { // Skip keybindings without commands
						this._keybindingItems.push(KeybindingsEditorModel.toKeybindingEntry(keybinding.command, keybinding, workbenchActionsRegistry, editorActions));
						boundCommands.set(keybinding.command, true);
					}
				}

				for (const command of KeybindingResolver.getAllUnboundCommands(boundCommands)) {
					this._keybindingItems.push(KeybindingsEditorModel.toKeybindingEntry(command, null, workbenchActionsRegistry, editorActions));
				}
				this._keybindingItems = this._keybindingItems.sort((a, b) => KeybindingsEditorModel.compareKeybindingData(a, b));
				return this;
			});
	}

	private static getId(keybindingItem: IKeybindingItem): string {
		return keybindingItem.command + (keybindingItem.keybinding ? keybindingItem.keybinding.getAriaLabel() : '') + keybindingItem.source + keybindingItem.when;
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
			return a.keybindingItem.isDefault ? 1 : -1;
		}
		return a.command.localeCompare(b.command);
	}

	private static toKeybindingEntry(command: string, keybindingItem: ResolvedKeybindingItem, workbenchActionsRegistry: IWorkbenchActionRegistry, editorActions: {}): IKeybindingItem {
		const workbenchAction = workbenchActionsRegistry.getWorkbenchAction(command);
		const editorAction: EditorAction = editorActions[command];
		const commandDefaultLabel = workbenchAction && language !== LANGUAGE_DEFAULT ? workbenchActionsRegistry.getAlias(workbenchAction.id) : null;
		keybindingItem = keybindingItem ? keybindingItem : new ResolvedKeybindingItem(null, command, null, null, true);
		return <IKeybindingItem>{
			keybinding: keybindingItem.resolvedKeybinding,
			keybindingItem,
			command,
			commandLabel: editorAction ? editorAction.label : workbenchAction ? workbenchAction.label : '',
			commandDefaultLabel,
			when: keybindingItem.when ? keybindingItem.when.serialize() : '',
			source: keybindingItem.isDefault ? localize('default', "Default") : localize('user', "User")
		};
	}
}

class KeybindingMatches {
	public readonly commandIdMatches: IMatch[] = null;
	public readonly commandLabelMatches: IMatch[] = null;
	public readonly commandDefaultLabelMatches: IMatch[] = null;
	public readonly sourceMatches: IMatch[] = null;
	public readonly whenMatches: IMatch[] = null;
	public readonly keybindingMatches: IMatch[] = null;

	constructor(keybindingItem: IKeybindingItem, searchValue: string) {
		this.commandIdMatches = this.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase));
		this.commandLabelMatches = keybindingItem.commandLabel ? this.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true)) : null;
		this.commandDefaultLabelMatches = keybindingItem.commandDefaultLabel ? this.matches(searchValue, keybindingItem.commandDefaultLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandDefaultLabel, true)) : null;
		this.sourceMatches = this.matches(searchValue, keybindingItem.source, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.source, true));
		this.whenMatches = keybindingItem.when ? this.matches(searchValue, keybindingItem.when, or(matchesWords, matchesCamelCase)) : null;
		this.keybindingMatches = keybindingItem.keybinding ? this.keyMatches(searchValue, keybindingItem.keybinding.getAriaLabel(), or(matchesWords, matchesCamelCase)) : null;
	}

	private matches(searchValue: string, wordToMatchAgainst: string, wordMatchesFilter: IFilter): IMatch[] {
		let matches = wordFilter(searchValue, wordToMatchAgainst);
		if (!matches) {
			matches = this.matchesWords(searchValue.split(' '), wordToMatchAgainst, wordMatchesFilter);
		}
		if (matches) {
			matches = this.filterAndSort(matches);
		}
		return matches;
	}

	private keyMatches(searchValue: string, wordToMatchAgainst: string, wordMatchesFilter: IFilter): IMatch[] {
		let matches = this.matches(searchValue, wordToMatchAgainst, wordMatchesFilter);
		if (!matches) {
			matches = this.matchesWords(searchValue.split('+'), wordToMatchAgainst, wordMatchesFilter);
			if (matches) {
				matches = this.filterAndSort(matches);
			}
		}
		return matches;
	}

	private matchesWords(words: string[], wordToMatchAgainst: string, wordMatchesFilter: IFilter): IMatch[] {
		let matches = [];
		for (const word of words) {
			const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
			if (wordMatches) {
				matches = [...(matches || []), ...wordMatches];
			} else {
				matches = null;
				break;
			}
		}
		return matches;
	}

	private filterAndSort(matches: IMatch[]): IMatch[] {
		return distinct(matches, (a => a.start + '.' + a.end)).filter(match => !matches.some(m => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);;
	}
}