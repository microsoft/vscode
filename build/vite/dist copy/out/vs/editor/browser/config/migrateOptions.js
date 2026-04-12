/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class EditorSettingMigration {
    static { this.items = []; }
    constructor(key, migrate) {
        this.key = key;
        this.migrate = migrate;
    }
    apply(options) {
        const value = EditorSettingMigration._read(options, this.key);
        const read = (key) => EditorSettingMigration._read(options, key);
        const write = (key, value) => EditorSettingMigration._write(options, key, value);
        this.migrate(value, read, write);
    }
    static _read(source, key) {
        if (typeof source === 'undefined' || source === null) {
            return undefined;
        }
        const firstDotIndex = key.indexOf('.');
        if (firstDotIndex >= 0) {
            const firstSegment = key.substring(0, firstDotIndex);
            return this._read(source[firstSegment], key.substring(firstDotIndex + 1));
        }
        return source[key];
    }
    static _write(target, key, value) {
        const firstDotIndex = key.indexOf('.');
        if (firstDotIndex >= 0) {
            const firstSegment = key.substring(0, firstDotIndex);
            target[firstSegment] = target[firstSegment] || {};
            this._write(target[firstSegment], key.substring(firstDotIndex + 1), value);
            return;
        }
        target[key] = value;
    }
}
function registerEditorSettingMigration(key, migrate) {
    EditorSettingMigration.items.push(new EditorSettingMigration(key, migrate));
}
function registerSimpleEditorSettingMigration(key, values) {
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
export function migrateOptions(options) {
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
const suggestFilteredTypesMapping = {
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
            const v = value[entry[0]];
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
        const newValue = {};
        for (const entry of Object.entries(value)) {
            if (typeof entry[1] === 'boolean') {
                toBeModified = true;
                newValue[entry[0]] = entry[1] ? 'explicit' : 'never';
            }
            else {
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
// Migrate Hover
registerEditorSettingMigration('hover.enabled', (value, read, write) => {
    if (typeof value === 'boolean') {
        write('hover.enabled', value ? 'on' : 'off');
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlncmF0ZU9wdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb25maWcvbWlncmF0ZU9wdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFZaEcsTUFBTSxPQUFPLHNCQUFzQjthQUVwQixVQUFLLEdBQTZCLEVBQUUsQ0FBQztJQUVuRCxZQUNpQixHQUFXLEVBQ1gsT0FBZ0Y7UUFEaEYsUUFBRyxHQUFILEdBQUcsQ0FBUTtRQUNYLFlBQU8sR0FBUCxPQUFPLENBQXlFO0lBQzdGLENBQUM7SUFFTCxLQUFLLENBQUMsT0FBZ0I7UUFDckIsTUFBTSxLQUFLLEdBQUcsc0JBQXNCLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDekUsTUFBTSxLQUFLLEdBQUcsQ0FBQyxHQUFXLEVBQUUsS0FBYyxFQUFFLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBZSxFQUFFLEdBQVc7UUFDaEQsSUFBSSxPQUFPLE1BQU0sS0FBSyxXQUFXLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3RELE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZD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