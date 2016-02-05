/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {LanguageExtensions, ILegacyLanguageDefinition} from 'vs/editor/common/modes/languageExtensionPoint';
import Modes = require('vs/editor/common/modes');
import Strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Registry} from 'vs/platform/platform';

// Define extension point ids
export var Extensions = {
	EditorModes: 'editor.modes'
};

export interface IEditorModesRegistry {

	// --- worker participants registration
	registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string):void;
	getWorkerParticipants(modeId:string):Modes.IWorkerParticipantDescriptor[];

	_getAllWorkerParticipants(): Modes.IWorkerParticipantDescriptor[];
	_setWorkerParticipants(participants:Modes.IWorkerParticipantDescriptor[]);

	// --- modes registration
	registerMode(def:ILegacyLanguageDefinition): void;

	// --- reading
	isRegisteredMode(modeName: string): boolean;
	getRegisteredModes(): string[];
	getRegisteredMimetypes(): string[];
	getRegisteredLanguageNames(): string[];
	getExtensions(alias: string): string[];
	getMimeForMode(modeId: string): string;
	getLanguageName(modeId:string): string;
	getModeIdForLanguageName(alias:string): string;
	getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string;
}

class EditorModesRegistry implements IEditorModesRegistry {

	private workerParticipants: Modes.IWorkerParticipantDescriptor[];

	constructor() {
		this.workerParticipants = [];
	}

	// --- worker participants registration

	public registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string):void {
		this.workerParticipants.push({
			modeId: modeId,
			moduleId: moduleId,
			ctorName: ctorName
		});
	}

	public _getAllWorkerParticipants(): Modes.IWorkerParticipantDescriptor[] {
		return this.workerParticipants;
	}

	public _setWorkerParticipants(participants:Modes.IWorkerParticipantDescriptor[]): void {
		this.workerParticipants = participants;
	}

	public getWorkerParticipants(modeId:string):Modes.IWorkerParticipantDescriptor[] {
		return this.workerParticipants.filter(p => p.modeId === modeId);
	}

	// --- modes registration

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		return LanguageExtensions.isRegisteredMode(mimetypeOrModeId);
	}

	public getRegisteredModes(): string[] {
		return LanguageExtensions.getRegisteredModes();
	}

	public getRegisteredMimetypes(): string[] {
		return LanguageExtensions.getRegisteredMimetypes();
	}

	public getRegisteredLanguageNames(): string[] {
		return LanguageExtensions.getRegisteredLanguageNames();
	}

	public getExtensions(alias: string): string[] {
		return LanguageExtensions.getExtensions(alias);
	}

	public getMimeForMode(modeId: string): string {
		return LanguageExtensions.getMimeForMode(modeId);
	}

	public getLanguageName(modeId: string): string {
		return LanguageExtensions.getLanguageName(modeId);
	}

	public getModeIdForLanguageName(alias:string): string {
		return LanguageExtensions.getModeIdForLanguageNameLowercase(alias);
	}

	public registerMode(def:ILegacyLanguageDefinition): void {
		LanguageExtensions.registerCompatMode(def);
	}

	public getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string {
		var modeIds = LanguageExtensions.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}
}

var mR = new EditorModesRegistry();
Registry.add(Extensions.EditorModes, mR);

export function registerMode(def:ILegacyLanguageDefinition): void {
	mR.registerMode(def);
}

export function registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string): void {
	mR.registerWorkerParticipant(modeId, moduleId, ctorName);
}



// TODO@Martin: find a better home for this code:

// TODO@Martin: modify suggestSupport to return a boolean if snippets should be presented or not
//       and turn this into a real registry
var _defaultSnippets: { [modeId: string]: Modes.ISuggestion[] } = Object.create(null);
var _snippets: { [modeId: string]: { [path: string]: Modes.ISuggestion[] } } = Object.create(null);

export function registerDefaultSnippets(modeId: string, snippets: Modes.ISuggestion[]): void {
	_defaultSnippets[modeId] = (_defaultSnippets[modeId] || []).concat(snippets);
}

export function registerSnippets(modeId: string, path: string, snippets: Modes.ISuggestion[]): void {
	var snippetsByMode = _snippets[modeId];
	if (!snippetsByMode) {
		_snippets[modeId] = snippetsByMode = {};
	}
	snippetsByMode[path] = snippets;
}
export function getSnippets(model: EditorCommon.IModel, position: EditorCommon.IPosition): Modes.ISuggestResult {
	var word = model.getWordAtPosition(position);
	var currentPrefix = word ? word.word.substring(0, position.column - word.startColumn) : '';
	var result : Modes.ISuggestResult = {
		currentWord: currentPrefix,
		suggestions: []
	};

	// to avoid that snippets are too prominent in the intellisense proposals:
	// - force that the current prefix matches with the snippet prefix
	// if there's no prfix, only show snippets at the beginning of the line, or after a whitespace
	var filter = null;
	if (currentPrefix.length === 0) {
		if (position.column > 1) {
			var previousCharacter = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column - 1, endLineNumber: position.lineNumber, endColumn: position.column });
			if (previousCharacter.trim().length !== 0) {
				return result;
			}
		}
	} else {
		var lowerCasePrefix = currentPrefix.toLowerCase();
		filter = (p: Modes.ISuggestion) => {
			return Strings.startsWith(p.label.toLowerCase(), lowerCasePrefix);
		};
	}

	var modeId = model.getMode().getId();
	var snippets : Modes.ISuggestion[]= [];
	var snipppetsByMode = _snippets[modeId];
	if (snipppetsByMode) {
		for (var s in snipppetsByMode) {
			snippets = snippets.concat(snipppetsByMode[s]);
		}
	}
	var defaultSnippets = _defaultSnippets[modeId];
	if (defaultSnippets) {
		snippets = snippets.concat(defaultSnippets);
	}
	result.suggestions = filter ? snippets.filter(filter) : snippets;

	// if (result.suggestions.length > 0) {
	// 	if (word) {
	// 		// Push also the current word as first suggestion, to avoid unexpected snippet acceptance on Enter.
	// 		result.suggestions = result.suggestions.slice(0);
	// 		result.suggestions.unshift({
	// 			codeSnippet: word.word,
	// 			label: word.word,
	// 			type: 'text'
	// 		});
	// 	}
	// 	result.incomplete = true;
	// }

	return result;

}

