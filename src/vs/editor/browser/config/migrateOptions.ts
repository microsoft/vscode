/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from '../../common/config/editorOptions.js';

export interface ISettingsReader {
	(key: string): unknown;
}

export interface ISettingsWriter {
	(key: string, value: unknown): void;
}

export class EditorSettingMigration {

	public static items: EditorSettingMigration[] = [];

	constructor(
		public readonly key: string,
		public readonly migrate: (value: unknown, read: ISettingsReader, write: ISettingsWriter) => void
	) { }

	apply(options: unknown): void {
		const value = EditorSettingMigration._read(options, this.key);
		const read = (key: string) => EditorSettingMigration._read(options, key);
		const write = (key: string, value: unknown) => EditorSettingMigration._write(options, key, value);
		this.migrate(value, read, write);
	}

	private static _read(source: unknown, key: string): unknown {
		if (typeof source === 'undefined' || source === null) {
			return undefined;
		}

		const firstDotIndex = key.indexOf('.');
		if (firstDotIndex >= 0) {
			const firstSegment = key.substring(0, firstDotIndex);
			return this._read((source as Record<string, unknown>)[firstSegment], key.substring(firstDotIndex + 1));
		}
		return (source as Record<string, unknown>)[key];
	}

	private static _write(target: unknown, key: string, value: unknown): void {
		const firstDotIndex = key.indexOf('.');
		if (firstDotIndex >= 0) {
			const firstSegment = key.substring(0, firstDotIndex);
			(target as Record<string, unknown>)[firstSegment] = (target as Record<string, unknown>)[firstSegment] || {};
			this._write((target as Record<string, unknown>)[firstSegment], key.substring(firstDotIndex + 1), value);
			return;
		}
		(target as Record<string, unknown>)[key] = value;
	}
}

function registerEditorSettingMigration(key: string, migrate: (value: unknown, read: ISettingsReader, write: ISettingsWriter) => void): void {
	EditorSettingMigration.items.push(new EditorSettingMigration(key, migrate));
}

function registerSimpleEditorSettingMigration(key: string, values: [unknown, unknown][]): void {
	registerEditorSettingMigration(key, (value, read, write) => {
		if (typeof value !== 'undefined') {
			for (const [oldValue, newValue] of values) {
				if (value === oldValue) {
					write(key, newValue);
					return;
				}
			}
		}
	});
}

/**
 * Compatibility with old options
 */
export function migrateOptions(options: IEditorOptions): void {
	EditorSettingMigration.items.forEach(migration => migration.apply(options));
}

registerSimpleEditorSettingMigration('wordWrap', [[true, 'on'], [false, 'off']]);
registerSimpleEditorSettingMigration('lineNumbers', [[true, 'on'], [false, 'off']]);
registerSimpleEditorSettingMigration('cursorBlinking', [['visible', 'solid']]);
registerSimpleEditorSettingMigration('renderWhitespace', [[true, 'boundary'], [false, 'none']]);
registerSimpleEditorSettingMigration('renderLineHighlight', [[true, 'line'], [false, 'none']]);
registerSimpleEditorSettingMigration('acceptSuggestionOnEnter', [[true, 'on'], [false, 'off']]);
registerSimpleEditorSettingMigration('tabCompletion', [[false, 'off'], [true, 'onlySnippets']]);
registerSimpleEditorSettingMigration('hover', [[true, { enabled: true }], [false, { enabled: false }]]);
registerSimpleEditorSettingMigration('parameterHints', [[true, { enabled: true }], [false, { enabled: false }]]);
registerSimpleEditorSettingMigration('autoIndent', [[false, 'advanced'], [true, 'full']]);
registerSimpleEditorSettingMigration('matchBrackets', [[true, 'always'], [false, 'never']]);
registerSimpleEditorSettingMigration('renderFinalNewline', [[true, 'on'], [false, 'off']]);
registerSimpleEditorSettingMigration('cursorSmoothCaretAnimation', [[true, 'on'], [false, 'off']]);
registerSimpleEditorSettingMigration('occurrencesHighlight', [[true, 'singleFile'], [false, 'off']]);
registerSimpleEditorSettingMigration('wordBasedSuggestions', [[true, 'matchingDocuments'], [false, 'off']]);
registerSimpleEditorSettingMigration('defaultColorDecorators', [[true, 'auto'], [false, 'never']]);
registerSimpleEditorSettingMigration('minimap.autohide', [[true, 'mouseover'], [false, 'none']]);

registerEditorSettingMigration('autoClosingBrackets', (value, read, write) => {
	if (value === false) {
		write('autoClosingBrackets', 'never');
		if (typeof read('autoClosingQuotes') === 'undefined') {
			write('autoClosingQuotes', 'never');
		}
		if (typeof read('autoSurround') === 'undefined') {
			write('autoSurround', 'never');
		}
	}
});

registerEditorSettingMigration('renderIndentGuides', (value, read, write) => {
	if (typeof value !== 'undefined') {
		write('renderIndentGuides', undefined);
		if (typeof read('guides.indentation') === 'undefined') {
			write('guides.indentation', !!value);
		}
	}
});

registerEditorSettingMigration('highlightActiveIndentGuide', (value, read, write) => {
	if (typeof value !== 'undefined') {
		write('highlightActiveIndentGuide', undefined);
		if (typeof read('guides.highlightActiveIndentation') === 'undefined') {
			write('guides.highlightActiveIndentation', !!value);
		}
	}
});

const suggestFilteredTypesMapping: Record<string, string> = {
	method: 'showMethods',
	function: 'showFunctions',
	constructor: 'showConstructors',
	deprecated: 'showDeprecated',
	field: 'showFields',
	variable: 'showVariables',
	class: 'showClasses',
	struct: 'showStructs',
	interface: 'showInterfaces',
	module: 'showModules',
	property: 'showProperties',
	event: 'showEvents',
	operator: 'showOperators',
	unit: 'showUnits',
	value: 'showValues',
	constant: 'showConstants',
	enum: 'showEnums',
	enumMember: 'showEnumMembers',
	keyword: 'showKeywords',
	text: 'showWords',
	color: 'showColors',
	file: 'showFiles',
	reference: 'showReferences',
	folder: 'showFolders',
	typeParameter: 'showTypeParameters',
	snippet: 'showSnippets',
};

registerEditorSettingMigration('suggest.filteredTypes', (value, read, write) => {
	if (value && typeof value === 'object') {
		for (const entry of Object.entries(suggestFilteredTypesMapping)) {
			const v = (value as Record<string, unknown>)[entry[0]];
			if (v === false) {
				if (typeof read(`suggest.${entry[1]}`) === 'undefined') {
					write(`suggest.${entry[1]}`, false);
				}
			}
		}
		write('suggest.filteredTypes', undefined);
	}
});

registerEditorSettingMigration('quickSuggestions', (input, read, write) => {
	if (typeof input === 'boolean') {
		const value = input ? 'on' : 'off';
		const newValue = { comments: value, strings: value, other: value };
		write('quickSuggestions', newValue);
	}
});

// Sticky Scroll

registerEditorSettingMigration('experimental.stickyScroll.enabled', (value, read, write) => {
	if (typeof value === 'boolean') {
		write('experimental.stickyScroll.enabled', undefined);
		if (typeof read('stickyScroll.enabled') === 'undefined') {
			write('stickyScroll.enabled', value);
		}
	}
});

registerEditorSettingMigration('experimental.stickyScroll.maxLineCount', (value, read, write) => {
	if (typeof value === 'number') {
		write('experimental.stickyScroll.maxLineCount', undefined);
		if (typeof read('stickyScroll.maxLineCount') === 'undefined') {
			write('stickyScroll.maxLineCount', value);
		}
	}
});

// Edit Context

registerEditorSettingMigration('editor.experimentalEditContextEnabled', (value, read, write) => {
	if (typeof value === 'boolean') {
		write('editor.experimentalEditContextEnabled', undefined);
		if (typeof read('editor.editContext') === 'undefined') {
			write('editor.editContext', value);
		}
	}
});

// Code Actions on Save
registerEditorSettingMigration('codeActionsOnSave', (value, read, write) => {
	if (value && typeof value === 'object') {
		let toBeModified = false;
		const newValue: Record<string, unknown> = {};
		for (const entry of Object.entries(value)) {
			if (typeof entry[1] === 'boolean') {
				toBeModified = true;
				newValue[entry[0]] = entry[1] ? 'explicit' : 'never';
			} else {
				newValue[entry[0]] = entry[1];
			}
		}
		if (toBeModified) {
			write(`codeActionsOnSave`, newValue);
		}
	}
});

// Migrate Quick Fix Settings
registerEditorSettingMigration('codeActionWidget.includeNearbyQuickfixes', (value, read, write) => {
	if (typeof value === 'boolean') {
		write('codeActionWidget.includeNearbyQuickfixes', undefined);
		if (typeof read('codeActionWidget.includeNearbyQuickFixes') === 'undefined') {
			write('codeActionWidget.includeNearbyQuickFixes', value);
		}
	}
});

// Migrate the lightbulb settings
registerEditorSettingMigration('lightbulb.enabled', (value, read, write) => {
	if (typeof value === 'boolean') {
		write('lightbulb.enabled', value ? undefined : 'off');
	}
});

// NES Code Shifting
registerEditorSettingMigration('inlineSuggest.edits.codeShifting', (value, read, write) => {
	if (typeof value === 'boolean') {
		write('inlineSuggest.edits.codeShifting', undefined);
		write('inlineSuggest.edits.allowCodeShifting', value ? 'always' : 'never');
	}
});
