/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import Strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Registry} from 'vs/platform/platform';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import Event, {Emitter} from 'vs/base/common/event';

export interface ILegacyLanguageDefinition {
	id: string;
	extensions: string[];
	filenames?: string[];
	firstLine?: string;
	aliases: string[];
	mimetypes: string[];
	moduleId: string;
	ctorName: string;
}

// Define extension point ids
export var Extensions = {
	EditorModes: 'editor.modes'
};

export interface IEditorModesRegistry {

	onDidAddCompatMode: Event<ILegacyLanguageDefinition>;
	onDidAddLanguage: Event<ILanguageExtensionPoint>;

	// --- worker participants registration
	registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string):void;
	getWorkerParticipants(modeId:string):Modes.IWorkerParticipantDescriptor[];

	_getAllWorkerParticipants(): Modes.IWorkerParticipantDescriptor[];
	_setWorkerParticipants(participants:Modes.IWorkerParticipantDescriptor[]);

	// --- modes registration
	registerCompatMode(def:ILegacyLanguageDefinition): void;
	getCompatModes(): ILegacyLanguageDefinition[];

	registerLanguage(def:ILanguageExtensionPoint): void;
	getLanguages(): ILanguageExtensionPoint[];
}

class EditorModesRegistry implements IEditorModesRegistry {

	private _workerParticipants: Modes.IWorkerParticipantDescriptor[];
	private _compatModes: ILegacyLanguageDefinition[];
	private _languages: ILanguageExtensionPoint[];

	private _onDidAddCompatMode: Emitter<ILegacyLanguageDefinition> = new Emitter<ILegacyLanguageDefinition>();
	public onDidAddCompatMode: Event<ILegacyLanguageDefinition> = this._onDidAddCompatMode.event;

	private _onDidAddLanguage: Emitter<ILanguageExtensionPoint> = new Emitter<ILanguageExtensionPoint>();
	public onDidAddLanguage: Event<ILanguageExtensionPoint> = this._onDidAddLanguage.event;

	constructor() {
		this._workerParticipants = [];
		this._compatModes = [];
		this._languages = [];
	}

	// --- worker participants registration

	public registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string):void {
		this._workerParticipants.push({
			modeId: modeId,
			moduleId: moduleId,
			ctorName: ctorName
		});
	}

	public _getAllWorkerParticipants(): Modes.IWorkerParticipantDescriptor[] {
		return this._workerParticipants;
	}

	public _setWorkerParticipants(participants:Modes.IWorkerParticipantDescriptor[]): void {
		this._workerParticipants = participants;
	}

	public getWorkerParticipants(modeId:string):Modes.IWorkerParticipantDescriptor[] {
		return this._workerParticipants.filter(p => p.modeId === modeId);
	}


	public registerCompatMode(def:ILegacyLanguageDefinition): void {
		this._compatModes.push(def);
		this._onDidAddCompatMode.fire(def);
	}

	public getCompatModes(): ILegacyLanguageDefinition[] {
		return this._compatModes.slice(0);
	}


	public registerLanguage(def:ILanguageExtensionPoint): void {
		this._languages.push(def);
		this._onDidAddLanguage.fire(def);
	}

	public getLanguages(): ILanguageExtensionPoint[] {
		return this._languages.slice(0);
	}
}

var mR = new EditorModesRegistry();
Registry.add(Extensions.EditorModes, mR);

export function registerCompatMode(def:ILegacyLanguageDefinition): void {
	mR.registerCompatMode(def);
}

export function registerLanguage(def:ILanguageExtensionPoint): void {
	mR.registerLanguage(def);
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

