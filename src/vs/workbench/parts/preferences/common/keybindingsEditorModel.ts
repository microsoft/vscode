/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { distinct } from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import { OperatingSystem, language, LANGUAGE_DEFAULT } from 'vs/base/common/platform';
import { IMatch, IFilter, or, matchesContiguousSubString, matchesPrefix, matchesCamelCase, matchesWords } from 'vs/base/common/filters';
import { Registry } from 'vs/platform/registry/common/platform';
import { ResolvedKeybinding, ResolvedKeybindingPart } from 'vs/base/common/keyCodes';
import { AriaLabelProvider, UserSettingsLabelProvider, UILabelProvider, ModifierLabels as ModLabels } from 'vs/base/common/keybindingLabels';
import { CommonEditorRegistry, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { MenuRegistry, ILocalizedString, SyncActionDescriptor, ICommandAction } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { EditorModel } from 'vs/workbench/common/editor';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';

export const KEYBINDING_ENTRY_TEMPLATE_ID = 'keybinding.entry.template';
export const KEYBINDING_HEADER_TEMPLATE_ID = 'keybinding.header.template';

export interface KeybindingMatch {
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
	keyCode?: boolean;
}

export interface KeybindingMatches {
	firstPart: KeybindingMatch;
	chordPart: KeybindingMatch;
}

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
	keybindingMatches?: KeybindingMatches;
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

interface ModifierLabels {
	ui: ModLabels;
	aria: ModLabels;
	user: ModLabels;
}

const wordFilter = or(matchesPrefix, matchesWords, matchesContiguousSubString);

export class KeybindingsEditorModel extends EditorModel {

	private _keybindingItems: IKeybindingItem[];
	private _keybindingItemsSortedByPrecedence: IKeybindingItem[];
	private modifierLabels: ModifierLabels;

	constructor(
		private os: OperatingSystem,
		@IKeybindingService private keybindingsService: IKeybindingService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
		this.modifierLabels = {
			ui: UILabelProvider.modifierLabels[os],
			aria: AriaLabelProvider.modifierLabels[os],
			user: UserSettingsLabelProvider.modifierLabels[os]
		};
	}

	public fetch(searchValue: string, sortByPrecedence: boolean = false): IKeybindingItemEntry[] {
		searchValue = searchValue.trim();
		const quoteAtFirstChar = searchValue.charAt(0) === '"';
		const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
		if (quoteAtFirstChar) {
			searchValue = searchValue.substring(1);
		}
		if (quoteAtLastChar) {
			searchValue = searchValue.substring(0, searchValue.length - 1);
		}
		searchValue = searchValue.trim();
		return this.fetchKeybindingItems(sortByPrecedence ? this._keybindingItemsSortedByPrecedence : this._keybindingItems, searchValue, quoteAtFirstChar && quoteAtLastChar);
	}

	private fetchKeybindingItems(keybindingItems: IKeybindingItem[], searchValue: string, completeMatch: boolean): IKeybindingItemEntry[] {
		if (!searchValue) {
			return keybindingItems.map(keybindingItem => ({ id: KeybindingsEditorModel.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
		}

		const result: IKeybindingItemEntry[] = [];
		const words = searchValue.split(' ');
		const keybindingWords = this.splitKeybindingWords(words);
		for (const keybindingItem of keybindingItems) {
			let keybindingMatches = new KeybindingItemMatches(this.modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch);
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

	private splitKeybindingWords(wordsSeparatedBySpaces: string[]): string[] {
		const result = [];
		for (const word of wordsSeparatedBySpaces) {
			result.push(...word.split('+'));
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

				this._keybindingItemsSortedByPrecedence = [];
				const boundCommands: Map<string, boolean> = new Map<string, boolean>();
				for (const keybinding of this.keybindingsService.getKeybindings()) {
					if (keybinding.command) { // Skip keybindings without commands
						this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(keybinding.command, keybinding, workbenchActionsRegistry, editorActions));
						boundCommands.set(keybinding.command, true);
					}
				}

				const commandsWithDefaultKeybindings = this.keybindingsService.getDefaultKeybindings().map(keybinding => keybinding.command);
				for (const command of KeybindingResolver.getAllUnboundCommands(boundCommands)) {
					const keybindingItem = new ResolvedKeybindingItem(null, command, null, null, commandsWithDefaultKeybindings.indexOf(command) === -1);
					this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel.toKeybindingEntry(command, keybindingItem, workbenchActionsRegistry, editorActions));
				}
				this._keybindingItems = this._keybindingItemsSortedByPrecedence.slice(0).sort((a, b) => KeybindingsEditorModel.compareKeybindingData(a, b));
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
		const menuCommand = MenuRegistry.getCommand(command);
		const editorAction: EditorAction = editorActions[command];
		return <IKeybindingItem>{
			keybinding: keybindingItem.resolvedKeybinding,
			keybindingItem,
			command,
			commandLabel: KeybindingsEditorModel.getCommandLabel(workbenchAction, menuCommand, editorAction),
			commandDefaultLabel: KeybindingsEditorModel.getCommandDefaultLabel(workbenchAction, menuCommand, workbenchActionsRegistry),
			when: keybindingItem.when ? keybindingItem.when.serialize() : '',
			source: keybindingItem.isDefault ? localize('default', "Default") : localize('user', "User")
		};
	}

	private static getCommandDefaultLabel(workbenchAction: SyncActionDescriptor, menuCommand: ICommandAction, workbenchActionsRegistry: IWorkbenchActionRegistry): string {
		if (language !== LANGUAGE_DEFAULT) {
			if (workbenchAction) {
				return workbenchActionsRegistry.getAlias(workbenchAction.id);
			}

			if (menuCommand && menuCommand.title && (<ILocalizedString>menuCommand.title).original) {
				return (<ILocalizedString>menuCommand.title).original;
			}
		}
		return null;
	}

	private static getCommandLabel(workbenchAction: SyncActionDescriptor, menuCommand: ICommandAction, editorAction: EditorAction): string {
		if (workbenchAction) {
			return workbenchAction.label;
		}

		if (menuCommand) {
			return typeof menuCommand.title === 'string' ? menuCommand.title : menuCommand.title.value;
		}

		if (editorAction) {
			return editorAction.label;
		}

		return '';
	}
}

class KeybindingItemMatches {

	public readonly commandIdMatches: IMatch[] = null;
	public readonly commandLabelMatches: IMatch[] = null;
	public readonly commandDefaultLabelMatches: IMatch[] = null;
	public readonly sourceMatches: IMatch[] = null;
	public readonly whenMatches: IMatch[] = null;
	public readonly keybindingMatches: KeybindingMatches = null;

	constructor(private modifierLabels: ModifierLabels, keybindingItem: IKeybindingItem, private searchValue: string, private words: string[], private keybindingWords: string[], private completeMatch: boolean) {
		this.commandIdMatches = this.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase), words);
		this.commandLabelMatches = keybindingItem.commandLabel ? this.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
		this.commandDefaultLabelMatches = keybindingItem.commandDefaultLabel ? this.matches(searchValue, keybindingItem.commandDefaultLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandDefaultLabel, true), words) : null;
		this.sourceMatches = this.matches(searchValue, keybindingItem.source, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.source, true), words);
		this.whenMatches = keybindingItem.when ? this.matches(searchValue, keybindingItem.when, or(matchesWords, matchesCamelCase), words) : null;
		this.keybindingMatches = keybindingItem.keybinding ? this.matchesKeybinding(keybindingItem.keybinding, searchValue, keybindingWords) : null;
	}

	private matches(searchValue: string, wordToMatchAgainst: string, wordMatchesFilter: IFilter, words: string[]): IMatch[] {
		let matches = wordFilter(searchValue, wordToMatchAgainst);
		if (!matches) {
			matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
		}
		if (matches) {
			matches = this.filterAndSort(matches);
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
		return distinct(matches, (a => a.start + '.' + a.end)).filter(match => !matches.some(m => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
	}

	private matchesKeybinding(keybinding: ResolvedKeybinding, searchValue: string, words: string[]): KeybindingMatches {
		const [firstPart, chordPart] = keybinding.getParts();

		if (strings.compareIgnoreCase(searchValue, keybinding.getAriaLabel()) === 0 || strings.compareIgnoreCase(searchValue, keybinding.getLabel()) === 0) {
			return {
				firstPart: this.createCompleteMatch(firstPart),
				chordPart: this.createCompleteMatch(chordPart)
			};
		}

		let firstPartMatch: KeybindingMatch = {};
		let chordPartMatch: KeybindingMatch = {};

		const matchedWords = [];
		let firstPartMatchedWords = [];
		let chordPartMatchedWords = [];
		let matchFirstPart = true;
		for (let index = 0; index < words.length; index++) {
			const word = words[index];
			let firstPartMatched = false;
			let chordPartMatched = false;

			matchFirstPart = matchFirstPart && !firstPartMatch.keyCode;
			let matchChordPart = !chordPartMatch.keyCode;

			if (matchFirstPart) {
				firstPartMatched = this.matchPart(firstPart, firstPartMatch, word);
				if (firstPartMatch.keyCode) {
					for (const cordPartMatchedWordIndex of chordPartMatchedWords) {
						if (firstPartMatchedWords.indexOf(cordPartMatchedWordIndex) === -1) {
							matchedWords.splice(matchedWords.indexOf(cordPartMatchedWordIndex), 1);
						}
					}
					chordPartMatch = {};
					chordPartMatchedWords = [];
					matchChordPart = false;
				}
			}

			if (matchChordPart) {
				chordPartMatched = this.matchPart(chordPart, chordPartMatch, word);
			}

			if (firstPartMatched) {
				firstPartMatchedWords.push(index);
			}
			if (chordPartMatched) {
				chordPartMatchedWords.push(index);
			}
			if (firstPartMatched || chordPartMatched) {
				matchedWords.push(index);
			}

			matchFirstPart = matchFirstPart && this.isModifier(word);
		}
		if (matchedWords.length !== words.length) {
			return null;
		}
		if (this.completeMatch && (!this.isCompleteMatch(firstPart, firstPartMatch) || !this.isCompleteMatch(chordPart, chordPartMatch))) {
			return null;
		}
		return this.hasAnyMatch(firstPartMatch) || this.hasAnyMatch(chordPartMatch) ? { firstPart: firstPartMatch, chordPart: chordPartMatch } : null;
	}

	private matchPart(part: ResolvedKeybindingPart, match: KeybindingMatch, word: string): boolean {
		let matched = false;
		if (this.matchesMetaModifier(part, word)) {
			matched = true;
			match.metaKey = true;
		}
		if (this.matchesCtrlModifier(part, word)) {
			matched = true;
			match.ctrlKey = true;
		}
		if (this.matchesShiftModifier(part, word)) {
			matched = true;
			match.shiftKey = true;
		}
		if (this.matchesAltModifier(part, word)) {
			matched = true;
			match.altKey = true;
		}
		if (this.matchesKeyCode(part, word)) {
			match.keyCode = true;
			matched = true;
		}
		return matched;
	}

	private matchesKeyCode(keybinding: ResolvedKeybindingPart, word: string): boolean {
		if (!keybinding) {
			return false;
		}
		const ariaLabel = keybinding.keyAriaLabel;
		if (this.completeMatch || ariaLabel.length === 1 || word.length === 1) {
			if (strings.compareIgnoreCase(ariaLabel, word) === 0) {
				return true;
			}
		} else {
			if (matchesContiguousSubString(word, ariaLabel)) {
				return true;
			}
		}
		return false;
	}

	private matchesMetaModifier(keybinding: ResolvedKeybindingPart, word: string): boolean {
		if (!keybinding) {
			return false;
		}
		if (!keybinding.metaKey) {
			return false;
		}
		return this.wordMatchesMetaModifier(word);
	}

	private wordMatchesMetaModifier(word: string): boolean {
		if (matchesPrefix(this.modifierLabels.ui.metaKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.aria.metaKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.user.metaKey, word)) {
			return true;
		}
		if (matchesPrefix(localize('meta', "meta"), word)) {
			return true;
		}
		return false;
	}

	private matchesCtrlModifier(keybinding: ResolvedKeybindingPart, word: string): boolean {
		if (!keybinding) {
			return false;
		}
		if (!keybinding.ctrlKey) {
			return false;
		}
		return this.wordMatchesCtrlModifier(word);
	}

	private wordMatchesCtrlModifier(word: string): boolean {
		if (matchesPrefix(this.modifierLabels.ui.ctrlKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.aria.ctrlKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.user.ctrlKey, word)) {
			return true;
		}
		return false;
	}

	private matchesShiftModifier(keybinding: ResolvedKeybindingPart, word: string): boolean {
		if (!keybinding) {
			return false;
		}
		if (!keybinding.shiftKey) {
			return false;
		}
		return this.wordMatchesShiftModifier(word);
	}

	private wordMatchesShiftModifier(word: string): boolean {
		if (matchesPrefix(this.modifierLabels.ui.shiftKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.aria.shiftKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.user.shiftKey, word)) {
			return true;
		}
		return false;
	}

	private matchesAltModifier(keybinding: ResolvedKeybindingPart, word: string): boolean {
		if (!keybinding) {
			return false;
		}
		if (!keybinding.altKey) {
			return false;
		}
		return this.wordMatchesAltModifier(word);
	}

	private wordMatchesAltModifier(word: string): boolean {
		if (matchesPrefix(this.modifierLabels.ui.altKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.aria.altKey, word)) {
			return true;
		}
		if (matchesPrefix(this.modifierLabels.user.altKey, word)) {
			return true;
		}
		if (matchesPrefix(localize('option', "option"), word)) {
			return true;
		}
		return false;
	}

	private hasAnyMatch(keybindingMatch: KeybindingMatch): boolean {
		return keybindingMatch.altKey ||
			keybindingMatch.ctrlKey ||
			keybindingMatch.metaKey ||
			keybindingMatch.shiftKey ||
			keybindingMatch.keyCode;
	}

	private isCompleteMatch(part: ResolvedKeybindingPart, match: KeybindingMatch): boolean {
		if (!part) {
			return true;
		}
		if (!match.keyCode) {
			return false;
		}
		if (part.metaKey && !match.metaKey) {
			return false;
		}
		if (part.altKey && !match.altKey) {
			return false;
		}
		if (part.ctrlKey && !match.ctrlKey) {
			return false;
		}
		if (part.shiftKey && !match.shiftKey) {
			return false;
		}
		return true;
	}

	private createCompleteMatch(part: ResolvedKeybindingPart): KeybindingMatch {
		let match: KeybindingMatch = {};
		if (part) {
			match.keyCode = true;
			if (part.metaKey) {
				match.metaKey = true;
			}
			if (part.altKey) {
				match.altKey = true;
			}
			if (part.ctrlKey) {
				match.ctrlKey = true;
			}
			if (part.shiftKey) {
				match.shiftKey = true;
			}
		}
		return match;
	}

	private isModifier(word: string): boolean {
		if (this.wordMatchesAltModifier(word)) {
			return true;
		}
		if (this.wordMatchesCtrlModifier(word)) {
			return true;
		}
		if (this.wordMatchesMetaModifier(word)) {
			return true;
		}
		if (this.wordMatchesShiftModifier(word)) {
			return true;
		}
		return false;
	}
}