/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { forEach } from 'vs/base/common/collections';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';

/**
 * Compatibility with old options
 */
export function migrateOptions(options: IEditorOptions): void {
	const wordWrap = options.wordWrap;
	if (<any>wordWrap === true) {
		options.wordWrap = 'on';
	} else if (<any>wordWrap === false) {
		options.wordWrap = 'off';
	}

	const lineNumbers = options.lineNumbers;
	if (<any>lineNumbers === true) {
		options.lineNumbers = 'on';
	} else if (<any>lineNumbers === false) {
		options.lineNumbers = 'off';
	}

	const autoClosingBrackets = options.autoClosingBrackets;
	if (<any>autoClosingBrackets === false) {
		options.autoClosingBrackets = 'never';
		options.autoClosingQuotes = 'never';
		options.autoSurround = 'never';
	}

	const cursorBlinking = options.cursorBlinking;
	if (<any>cursorBlinking === 'visible') {
		options.cursorBlinking = 'solid';
	}

	const renderWhitespace = options.renderWhitespace;
	if (<any>renderWhitespace === true) {
		options.renderWhitespace = 'boundary';
	} else if (<any>renderWhitespace === false) {
		options.renderWhitespace = 'none';
	}

	const renderLineHighlight = options.renderLineHighlight;
	if (<any>renderLineHighlight === true) {
		options.renderLineHighlight = 'line';
	} else if (<any>renderLineHighlight === false) {
		options.renderLineHighlight = 'none';
	}

	const acceptSuggestionOnEnter = options.acceptSuggestionOnEnter;
	if (<any>acceptSuggestionOnEnter === true) {
		options.acceptSuggestionOnEnter = 'on';
	} else if (<any>acceptSuggestionOnEnter === false) {
		options.acceptSuggestionOnEnter = 'off';
	}

	const tabCompletion = options.tabCompletion;
	if (<any>tabCompletion === false) {
		options.tabCompletion = 'off';
	} else if (<any>tabCompletion === true) {
		options.tabCompletion = 'onlySnippets';
	}

	const suggest = options.suggest;
	if (suggest && typeof (<any>suggest).filteredTypes === 'object' && (<any>suggest).filteredTypes) {
		const mapping: Record<string, string> = {};
		mapping['method'] = 'showMethods';
		mapping['function'] = 'showFunctions';
		mapping['constructor'] = 'showConstructors';
		mapping['deprecated'] = 'showDeprecated';
		mapping['field'] = 'showFields';
		mapping['variable'] = 'showVariables';
		mapping['class'] = 'showClasses';
		mapping['struct'] = 'showStructs';
		mapping['interface'] = 'showInterfaces';
		mapping['module'] = 'showModules';
		mapping['property'] = 'showProperties';
		mapping['event'] = 'showEvents';
		mapping['operator'] = 'showOperators';
		mapping['unit'] = 'showUnits';
		mapping['value'] = 'showValues';
		mapping['constant'] = 'showConstants';
		mapping['enum'] = 'showEnums';
		mapping['enumMember'] = 'showEnumMembers';
		mapping['keyword'] = 'showKeywords';
		mapping['text'] = 'showWords';
		mapping['color'] = 'showColors';
		mapping['file'] = 'showFiles';
		mapping['reference'] = 'showReferences';
		mapping['folder'] = 'showFolders';
		mapping['typeParameter'] = 'showTypeParameters';
		mapping['snippet'] = 'showSnippets';
		forEach(mapping, entry => {
			const value = (<any>suggest).filteredTypes[entry.key];
			if (value === false) {
				(<any>suggest)[entry.value] = value;
			}
		});
		// delete (<any>suggest).filteredTypes;
	}

	const hover = options.hover;
	if (<any>hover === true) {
		options.hover = {
			enabled: true
		};
	} else if (<any>hover === false) {
		options.hover = {
			enabled: false
		};
	}

	const parameterHints = options.parameterHints;
	if (<any>parameterHints === true) {
		options.parameterHints = {
			enabled: true
		};
	} else if (<any>parameterHints === false) {
		options.parameterHints = {
			enabled: false
		};
	}

	const autoIndent = options.autoIndent;
	if (<any>autoIndent === true) {
		options.autoIndent = 'full';
	} else if (<any>autoIndent === false) {
		options.autoIndent = 'advanced';
	}

	const matchBrackets = options.matchBrackets;
	if (<any>matchBrackets === true) {
		options.matchBrackets = 'always';
	} else if (<any>matchBrackets === false) {
		options.matchBrackets = 'never';
	}

	const { renderIndentGuides, highlightActiveIndentGuide } = options as any as {
		renderIndentGuides: boolean;
		highlightActiveIndentGuide: boolean;
	};
	if (!options.guides) {
		options.guides = {};
	}

	if (renderIndentGuides !== undefined) {
		options.guides.indentation = !!renderIndentGuides;
	}
	if (highlightActiveIndentGuide !== undefined) {
		options.guides.highlightActiveIndentation = !!highlightActiveIndentGuide;
	}
}
