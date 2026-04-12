/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var KeybindingsEditorModel_1;
import { localize } from '../../../../nls.js';
import { distinct, coalesce } from '../../../../base/common/arrays.js';
import * as strings from '../../../../base/common/strings.js';
import { Language } from '../../../../base/common/platform.js';
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString, matchesContiguousSubString } from '../../../../base/common/filters.js';
import { AriaLabelProvider, UserSettingsLabelProvider, UILabelProvider } from '../../../../base/common/keybindingLabels.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { getAllUnboundCommands } from '../../keybinding/browser/unboundCommands.js';
import { isEmptyObject, isString } from '../../../../base/common/types.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ExtensionIdentifier, ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
export const KEYBINDING_ENTRY_TEMPLATE_ID = 'keybinding.entry.template';
const SOURCE_SYSTEM = localize('default', "System");
const SOURCE_EXTENSION = localize('extension', "Extension");
const SOURCE_USER = localize('user', "User");
export function createKeybindingCommandQuery(commandId, when) {
    const whenPart = when ? ` +when:${when}` : '';
    return `@command:${commandId}${whenPart}`;
}
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const COMMAND_REGEX = /@command:\s*([^\+]+)/i;
const WHEN_REGEX = /\+when:\s*(.+)/i;
const SOURCE_REGEX = /@source:\s*(user|default|system|extension)/i;
const EXTENSION_REGEX = /@ext:\s*((".+")|([^\s]+))/i;
const KEYBINDING_REGEX = /@keybinding:\s*((\".+\")|(\S+))/i;
let KeybindingsEditorModel = KeybindingsEditorModel_1 = class KeybindingsEditorModel extends EditorModel {
    constructor(os, keybindingsService, extensionService) {
        super();
        this.keybindingsService = keybindingsService;
        this.extensionService = extensionService;
        this._keybindingItems = [];
        this._keybindingItemsSortedByPrecedence = [];
        this.modifierLabels = {
            ui: UILabelProvider.modifierLabels[os],
            aria: AriaLabelProvider.modifierLabels[os],
            user: UserSettingsLabelProvider.modifierLabels[os]
        };
    }
    fetch(searchValue, sortByPrecedence = false) {
        let keybindingItems = sortByPrecedence ? this._keybindingItemsSortedByPrecedence : this._keybindingItems;
        // @command:COMMAND_ID
        const commandIdMatches = COMMAND_REGEX.exec(searchValue);
        if (commandIdMatches && commandIdMatches[1]) {
            const command = commandIdMatches[1].trim();
            let filteredKeybindingItems = keybindingItems.filter(k => k.command === command);
            // +when:WHEN_EXPRESSION
            if (filteredKeybindingItems.length) {
                const whenMatches = WHEN_REGEX.exec(searchValue);
                if (whenMatches && whenMatches[1]) {
                    const whenValue = whenMatches[1].trim();
                    filteredKeybindingItems = this.filterByWhen(filteredKeybindingItems, command, whenValue);
                }
            }
            return filteredKeybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel_1.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
        }
        // @source:SOURCE
        if (SOURCE_REGEX.test(searchValue)) {
            keybindingItems = this.filterBySource(keybindingItems, searchValue);
            searchValue = searchValue.replace(SOURCE_REGEX, '');
        }
        else {
            // @ext:EXTENSION_ID
            const extensionMatches = EXTENSION_REGEX.exec(searchValue);
            if (extensionMatches && (extensionMatches[2] || extensionMatches[3])) {
                const extensionId = extensionMatches[2] ? extensionMatches[2].substring(1, extensionMatches[2].length - 1) : extensionMatches[3];
                keybindingItems = this.filterByExtension(keybindingItems, extensionId);
                searchValue = searchValue.replace(EXTENSION_REGEX, '');
            }
            else {
                // @keybinding:KEYBINDING
                const keybindingMatches = KEYBINDING_REGEX.exec(searchValue);
                if (keybindingMatches && (keybindingMatches[2] || keybindingMatches[3])) {
                    searchValue = keybindingMatches[2] || `"${keybindingMatches[3]}"`;
                }
            }
        }
        searchValue = searchValue.trim();
        if (!searchValue) {
            return keybindingItems.map((keybindingItem) => ({ id: KeybindingsEditorModel_1.getId(keybindingItem), keybindingItem, templateId: KEYBINDING_ENTRY_TEMPLATE_ID }));
        }
        return this.filterByText(keybindingItems, searchValue);
    }
    filterBySource(keybindingItems, searchValue) {
        if (/@source:\s*default/i.test(searchValue) || /@source:\s*system/i.test(searchValue)) {
            return keybindingItems.filter(k => k.source === SOURCE_SYSTEM);
        }
        if (/@source:\s*user/i.test(searchValue)) {
            return keybindingItems.filter(k => k.source === SOURCE_USER);
        }
        if (/@source:\s*extension/i.test(searchValue)) {
            return keybindingItems.filter(k => !isString(k.source) || k.source === SOURCE_EXTENSION);
        }
        return keybindingItems;
    }
    filterByExtension(keybindingItems, extension) {
        extension = extension.toLowerCase().trim();
        return keybindingItems.filter(k => !isString(k.source) && (ExtensionIdentifier.equals(k.source.identifier, extension) || k.source.displayName?.toLowerCase() === extension.toLowerCase()));
    }
    filterByText(keybindingItems, searchValue) {
        const quoteAtFirstChar = searchValue.charAt(0) === '"';
        const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
        const completeMatch = quoteAtFirstChar && quoteAtLastChar;
        if (quoteAtFirstChar) {
            searchValue = searchValue.substring(1);
        }
        if (quoteAtLastChar) {
            searchValue = searchValue.substring(0, searchValue.length - 1);
        }
        searchValue = searchValue.trim();
        const result = [];
        const words = searchValue.split(' ');
        const keybindingWords = this.splitKeybindingWords(words);
        for (const keybindingItem of keybindingItems) {
            const keybindingMatches = new KeybindingItemMatches(this.modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch);
            if (keybindingMatches.commandIdMatches
                || keybindingMatches.commandLabelMatches
                || keybindingMatches.commandDefaultLabelMatches
                || keybindingMatches.sourceMatches
                || keybindingMatches.whenMatches
                || keybindingMatches.keybindingMatches
                || keybindingMatches.extensionIdMatches
                || keybindingMatches.extensionLabelMatches) {
                result.push({
                    id: KeybindingsEditorModel_1.getId(keybindingItem),
                    templateId: KEYBINDING_ENTRY_TEMPLATE_ID,
                    commandLabelMatches: keybindingMatches.commandLabelMatches || undefined,
                    commandDefaultLabelMatches: keybindingMatches.commandDefaultLabelMatches || undefined,
                    keybindingItem,
                    keybindingMatches: keybindingMatches.keybindingMatches || undefined,
                    commandIdMatches: keybindingMatches.commandIdMatches || undefined,
                    sourceMatches: keybindingMatches.sourceMatches || undefined,
                    whenMatches: keybindingMatches.whenMatches || undefined,
                    extensionIdMatches: keybindingMatches.extensionIdMatches || undefined,
                    extensionLabelMatches: keybindingMatches.extensionLabelMatches || undefined
                });
            }
        }
        return result;
    }
    filterByWhen(keybindingItems, command, when) {
        if (keybindingItems.length === 0) {
            return [];
        }
        // Check if a keybinding with the same command id and when clause exists
        const keybindingItemsWithWhen = keybindingItems.filter(k => k.when === when);
        if (keybindingItemsWithWhen.length) {
            return keybindingItemsWithWhen;
        }
        // Create a new entry with the when clause which does not live in the model
        // We can reuse some of the properties from the same command with different when clause
        const commandLabel = keybindingItems[0].commandLabel;
        const keybindingItem = new ResolvedKeybindingItem(undefined, command, null, ContextKeyExpr.deserialize(when), false, null, false);
        const actionLabels = new Map([[command, commandLabel]]);
        return [KeybindingsEditorModel_1.toKeybindingEntry(command, keybindingItem, actionLabels, this.getExtensionsMapping())];
    }
    splitKeybindingWords(wordsSeparatedBySpaces) {
        const result = [];
        for (const word of wordsSeparatedBySpaces) {
            result.push(...coalesce(word.split('+')));
        }
        return result;
    }
    async resolve(actionLabels = new Map()) {
        const extensions = this.getExtensionsMapping();
        this._keybindingItemsSortedByPrecedence = [];
        const boundCommands = new Map();
        for (const keybinding of this.keybindingsService.getKeybindings()) {
            if (keybinding.command) { // Skip keybindings without commands
                this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel_1.toKeybindingEntry(keybinding.command, keybinding, actionLabels, extensions));
                boundCommands.set(keybinding.command, true);
            }
        }
        const commandsWithDefaultKeybindings = this.keybindingsService.getDefaultKeybindings().map(keybinding => keybinding.command);
        for (const command of getAllUnboundCommands(boundCommands)) {
            const keybindingItem = new ResolvedKeybindingItem(undefined, command, null, undefined, commandsWithDefaultKeybindings.indexOf(command) === -1, null, false);
            this._keybindingItemsSortedByPrecedence.push(KeybindingsEditorModel_1.toKeybindingEntry(command, keybindingItem, actionLabels, extensions));
        }
        this._keybindingItemsSortedByPrecedence = distinct(this._keybindingItemsSortedByPrecedence, keybindingItem => KeybindingsEditorModel_1.getId(keybindingItem));
        this._keybindingItems = this._keybindingItemsSortedByPrecedence.slice(0).sort((a, b) => KeybindingsEditorModel_1.compareKeybindingData(a, b));
        return super.resolve();
    }
    static getId(keybindingItem) {
        return keybindingItem.command + (keybindingItem?.keybinding?.getAriaLabel() ?? '') + keybindingItem.when + (isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.identifier.value);
    }
    getExtensionsMapping() {
        const extensions = new ExtensionIdentifierMap();
        for (const extension of this.extensionService.extensions) {
            extensions.set(extension.identifier, extension);
        }
        return extensions;
    }
    static compareKeybindingData(a, b) {
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
    static toKeybindingEntry(command, keybindingItem, actions, extensions) {
        const menuCommand = MenuRegistry.getCommand(command);
        const editorActionLabel = actions.get(command);
        let source = SOURCE_USER;
        if (keybindingItem.isDefault) {
            const extensionId = keybindingItem.extensionId ?? (keybindingItem.resolvedKeybinding ? undefined : menuCommand?.source?.id);
            source = extensionId ? extensions.get(extensionId) ?? SOURCE_EXTENSION : SOURCE_SYSTEM;
        }
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        return {
            keybinding: keybindingItem.resolvedKeybinding,
            keybindingItem,
            command,
            commandLabel: KeybindingsEditorModel_1.getCommandLabel(menuCommand, editorActionLabel),
            commandDefaultLabel: KeybindingsEditorModel_1.getCommandDefaultLabel(menuCommand),
            when: keybindingItem.when ? keybindingItem.when.serialize() : '',
            source
        };
    }
    static getCommandDefaultLabel(menuCommand) {
        if (!Language.isDefaultVariant()) {
            if (menuCommand && menuCommand.title && menuCommand.title.original) {
                const category = menuCommand.category ? menuCommand.category.original : undefined;
                const title = menuCommand.title.original;
                return category ? localize('cat.title', "{0}: {1}", category, title) : title;
            }
        }
        return null;
    }
    static getCommandLabel(menuCommand, editorActionLabel) {
        if (menuCommand) {
            const category = menuCommand.category ? typeof menuCommand.category === 'string' ? menuCommand.category : menuCommand.category.value : undefined;
            const title = typeof menuCommand.title === 'string' ? menuCommand.title : menuCommand.title.value;
            return category ? localize('cat.title', "{0}: {1}", category, title) : title;
        }
        if (editorActionLabel) {
            return editorActionLabel;
        }
        return '';
    }
};
KeybindingsEditorModel = KeybindingsEditorModel_1 = __decorate([
    __param(1, IKeybindingService),
    __param(2, IExtensionService)
], KeybindingsEditorModel);
export { KeybindingsEditorModel };
class KeybindingItemMatches {
    constructor(modifierLabels, keybindingItem, searchValue, words, keybindingWords, completeMatch) {
        this.modifierLabels = modifierLabels;
        this.commandIdMatches = null;
        this.commandLabelMatches = null;
        this.commandDefaultLabelMatches = null;
        this.sourceMatches = null;
        this.whenMatches = null;
        this.keybindingMatches = null;
        this.extensionIdMatches = null;
        this.extensionLabelMatches = null;
        if (!completeMatch) {
            this.commandIdMatches = this.matches(searchValue, keybindingItem.command, or(matchesWords, matchesCamelCase), words);
            this.commandLabelMatches = keybindingItem.commandLabel ? this.matches(searchValue, keybindingItem.commandLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
            this.commandDefaultLabelMatches = keybindingItem.commandDefaultLabel ? this.matches(searchValue, keybindingItem.commandDefaultLabel, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandDefaultLabel, true), words) : null;
            this.whenMatches = keybindingItem.when ? this.matches(null, keybindingItem.when, or(matchesWords, matchesCamelCase), words) : null;
            if (isString(keybindingItem.source)) {
                this.sourceMatches = this.matches(searchValue, keybindingItem.source, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.source, true), words);
            }
            else {
                this.extensionLabelMatches = keybindingItem.source.displayName ? this.matches(searchValue, keybindingItem.source.displayName, (word, wordToMatchAgainst) => matchesWords(word, keybindingItem.commandLabel, true), words) : null;
            }
        }
        this.keybindingMatches = keybindingItem.keybinding ? this.matchesKeybinding(keybindingItem.keybinding, searchValue, keybindingWords, completeMatch) : null;
    }
    matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
        let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
        if (!matches) {
            matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
        }
        if (matches) {
            matches = this.filterAndSort(matches);
        }
        return matches;
    }
    matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
        let matches = [];
        for (const word of words) {
            const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
            if (wordMatches) {
                matches = [...(matches || []), ...wordMatches];
            }
            else {
                matches = null;
                break;
            }
        }
        return matches;
    }
    filterAndSort(matches) {
        return distinct(matches, (a => a.start + '.' + a.end)).filter(match => !matches.some(m => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
    }
    matchesKeybinding(keybinding, searchValue, words, completeMatch) {
        const [firstPart, chordPart] = keybinding.getChords();
        const userSettingsLabel = keybinding.getUserSettingsLabel();
        const ariaLabel = keybinding.getAriaLabel();
        const label = keybinding.getLabel();
        if ((userSettingsLabel && strings.compareIgnoreCase(searchValue, userSettingsLabel) === 0)
            || (ariaLabel && strings.compareIgnoreCase(searchValue, ariaLabel) === 0)
            || (label && strings.compareIgnoreCase(searchValue, label) === 0)) {
            return {
                firstPart: this.createCompleteMatch(firstPart),
                chordPart: this.createCompleteMatch(chordPart)
            };
        }
        const firstPartMatch = {};
        let chordPartMatch = {};
        const matchedWords = [];
        const firstPartMatchedWords = [];
        let chordPartMatchedWords = [];
        let matchFirstPart = true;
        for (let index = 0; index < words.length; index++) {
            const word = words[index];
            let firstPartMatched = false;
            let chordPartMatched = false;
            matchFirstPart = matchFirstPart && !firstPartMatch.keyCode;
            let matchChordPart = !chordPartMatch.keyCode;
            if (matchFirstPart) {
                firstPartMatched = this.matchPart(firstPart, firstPartMatch, word, completeMatch);
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
                chordPartMatched = this.matchPart(chordPart, chordPartMatch, word, completeMatch);
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
        if (completeMatch) {
            if (!this.isCompleteMatch(firstPart, firstPartMatch)) {
                return null;
            }
            if (!isEmptyObject(chordPartMatch) && !this.isCompleteMatch(chordPart, chordPartMatch)) {
                return null;
            }
        }
        return this.hasAnyMatch(firstPartMatch) || this.hasAnyMatch(chordPartMatch) ? { firstPart: firstPartMatch, chordPart: chordPartMatch } : null;
    }
    matchPart(chord, match, word, completeMatch) {
        let matched = false;
        if (this.matchesMetaModifier(chord, word)) {
            matched = true;
            match.metaKey = true;
        }
        if (this.matchesCtrlModifier(chord, word)) {
            matched = true;
            match.ctrlKey = true;
        }
        if (this.matchesShiftModifier(chord, word)) {
            matched = true;
            match.shiftKey = true;
        }
        if (this.matchesAltModifier(chord, word)) {
            matched = true;
            match.altKey = true;
        }
        if (this.matchesKeyCode(chord, word, completeMatch)) {
            match.keyCode = true;
            matched = true;
        }
        return matched;
    }
    matchesKeyCode(chord, word, completeMatch) {
        if (!chord) {
            return false;
        }
        const ariaLabel = chord.keyAriaLabel || '';
        if (completeMatch || ariaLabel.length === 1 || word.length === 1) {
            if (strings.compareIgnoreCase(ariaLabel, word) === 0) {
                return true;
            }
        }
        else {
            if (matchesContiguousSubString(word, ariaLabel)) {
                return true;
            }
        }
        return false;
    }
    matchesMetaModifier(chord, word) {
        if (!chord) {
            return false;
        }
        if (!chord.metaKey) {
            return false;
        }
        return this.wordMatchesMetaModifier(word);
    }
    matchesCtrlModifier(chord, word) {
        if (!chord) {
            return false;
        }
        if (!chord.ctrlKey) {
            return false;
        }
        return this.wordMatchesCtrlModifier(word);
    }
    matchesShiftModifier(chord, word) {
        if (!chord) {
            return false;
        }
        if (!chord.shiftKey) {
            return false;
        }
        return this.wordMatchesShiftModifier(word);
    }
    matchesAltModifier(chord, word) {
        if (!chord) {
            return false;
        }
        if (!chord.altKey) {
            return false;
        }
        return this.wordMatchesAltModifier(word);
    }
    hasAnyMatch(keybindingMatch) {
        return !!keybindingMatch.altKey ||
            !!keybindingMatch.ctrlKey ||
            !!keybindingMatch.metaKey ||
            !!keybindingMatch.shiftKey ||
            !!keybindingMatch.keyCode;
    }
    isCompleteMatch(chord, match) {
        if (!chord) {
            return true;
        }
        if (!match.keyCode) {
            return false;
        }
        if (chord.metaKey && !match.metaKey) {
            return false;
        }
        if (chord.altKey && !match.altKey) {
            return false;
        }
        if (chord.ctrlKey && !match.ctrlKey) {
            return false;
        }
        if (chord.shiftKey && !match.shiftKey) {
            return false;
        }
        return true;
    }
    createCompleteMatch(chord) {
        const match = {};
        if (chord) {
            match.keyCode = true;
            if (chord.metaKey) {
                match.metaKey = true;
            }
            if (chord.altKey) {
                match.altKey = true;
            }
            if (chord.ctrlKey) {
                match.ctrlKey = true;
            }
            if (chord.shiftKey) {
                match.shiftKey = true;
            }
        }
        return match;
    }
    isModifier(word) {
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
    wordMatchesAltModifier(word) {
        if (strings.equalsIgnoreCase(this.modifierLabels.ui.altKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.aria.altKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.user.altKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(localize('option', "option"), word)) {
            return true;
        }
        return false;
    }
    wordMatchesCtrlModifier(word) {
        if (strings.equalsIgnoreCase(this.modifierLabels.ui.ctrlKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.aria.ctrlKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.user.ctrlKey, word)) {
            return true;
        }
        return false;
    }
    wordMatchesMetaModifier(word) {
        if (strings.equalsIgnoreCase(this.modifierLabels.ui.metaKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.aria.metaKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.user.metaKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(localize('meta', "meta"), word)) {
            return true;
        }
        return false;
    }
    wordMatchesShiftModifier(word) {
        if (strings.equalsIgnoreCase(this.modifierLabels.ui.shiftKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.aria.shiftKey, word)) {
            return true;
        }
        if (strings.equalsIgnoreCase(this.modifierLabels.user.shiftKey, word)) {
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFZGl0b3JNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJpbmRpbmdzRWRpdG9yTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFtQixRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRixPQUFPLEVBQW1CLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsOEJBQThCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVySyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUUsZUFBZSxFQUErQixNQUFNLDZDQUE2QyxDQUFDO0FBQ3pKLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDMUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVB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