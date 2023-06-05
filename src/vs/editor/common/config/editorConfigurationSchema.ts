/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorOptionsRegistry } from 'vs/editor/common/config/editorOptions';
import { EDITOR_MODEL_DEFAULTS } from 'vs/editor/common/core/textModelDefaults';
import * as nls from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

export const editorConfigurationBaseNode = Object.freeze<IConfigurationNode>({
	id: 'editor',
	order: 5,
	type: 'object',
	title: nls.localize('editorConfigurationTitle', "Editor"),
	scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
});

const editorConfiguration: IConfigurationNode = {
	...editorConfigurationBaseNode,
	properties: {
		'editor.tabSize': {
			type: 'number',
			default: EDITOR_MODEL_DEFAULTS.tabSize,
			minimum: 1,
			markdownDescription: nls.localize('tabSize', "The number of spaces a tab is equal to. This setting is overridden based on the file contents when {0} is on.", '`#editor.detectIndentation#`')
		},
		'editor.indentSize': {
			'anyOf': [
				{
					type: 'string',
					enum: ['tabSize']
				},
				{
					type: 'number',
					minimum: 1
				}
			],
			default: 'tabSize',
			markdownDescription: nls.localize('indentSize', "The number of spaces used for indentation or `\"tabSize\"` to use the value from `#editor.tabSize#`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.")
		},
		'editor.insertSpaces': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.insertSpaces,
			markdownDescription: nls.localize('insertSpaces', "Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when {0} is on.", '`#editor.detectIndentation#`')
		},
		'editor.detectIndentation': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.detectIndentation,
			markdownDescription: nls.localize('detectIndentation', "Controls whether {0} and {1} will be automatically detected when a file is opened based on the file contents.", '`#editor.tabSize#`', '`#editor.insertSpaces#`')
		},
		'editor.trimAutoWhitespace': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
			description: nls.localize('trimAutoWhitespace', "Remove trailing auto inserted whitespace.")
		},
		'editor.largeFileOptimizations': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
			description: nls.localize('largeFileOptimizations', "Special handling for large files to disable certain memory intensive features.")
		},
		'editor.wordBasedSuggestions': {
			type: 'boolean',
			default: true,
			description: nls.localize('wordBasedSuggestions', "Controls whether completions should be computed based on words in the document.")
		},
		'editor.wordBasedSuggestionsMode': {
			enum: ['currentDocument', 'matchingDocuments', 'allDocuments'],
			default: 'matchingDocuments',
			enumDescriptions: [
				nls.localize('wordBasedSuggestionsMode.currentDocument', 'Only suggest words from the active document.'),
				nls.localize('wordBasedSuggestionsMode.matchingDocuments', 'Suggest words from all open documents of the same language.'),
				nls.localize('wordBasedSuggestionsMode.allDocuments', 'Suggest words from all open documents.')
			],
			description: nls.localize('wordBasedSuggestionsMode', "Controls from which documents word based completions are computed.")
		},
		'editor.semanticHighlighting.enabled': {
			enum: [true, false, 'configuredByTheme'],
			enumDescriptions: [
				nls.localize('semanticHighlighting.true', 'Semantic highlighting enabled for all color themes.'),
				nls.localize('semanticHighlighting.false', 'Semantic highlighting disabled for all color themes.'),
				nls.localize('semanticHighlighting.configuredByTheme', 'Semantic highlighting is configured by the current color theme\'s `semanticHighlighting` setting.')
			],
			default: 'configuredByTheme',
			description: nls.localize('semanticHighlighting.enabled', "Controls whether the semanticHighlighting is shown for the languages that support it.")
		},
		'editor.stablePeek': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('stablePeek', "Keep peek editors open even when double-clicking their content or when hitting `Escape`.")
		},
		'editor.maxTokenizationLineLength': {
			type: 'integer',
			default: 20_000,
			description: nls.localize('maxTokenizationLineLength', "Lines above this length will not be tokenized for performance reasons")
		},
		'editor.experimental.asyncTokenization': {
			type: 'boolean',
			default: false,
			description: nls.localize('editor.experimental.asyncTokenization', "Controls whether the tokenization should happen asynchronously on a web worker."),
			tags: ['experimental'],
		},
		'editor.experimental.asyncTokenizationLogging': {
			type: 'boolean',
			default: false,
			description: nls.localize('editor.experimental.asyncTokenizationLogging', "Controls whether async tokenization should be logged. For debugging only."),
		},
		'editor.experimental.asyncTokenizationVerification': {
			type: 'boolean',
			default: false,
			description: nls.localize('editor.experimental.asyncTokenizationVerification', "Controls whether async tokenization should be verified against legacy background tokenization. Might slow down tokenization. For debugging only."),
		},
		'editor.language.brackets': {
			type: ['array', 'null'],
			default: null, // We want to distinguish the empty array from not configured.
			description: nls.localize('schema.brackets', 'Defines the bracket symbols that increase or decrease the indentation.'),
			items: {
				type: 'array',
				items: [
					{
						type: 'string',
						description: nls.localize('schema.openBracket', 'The opening bracket character or string sequence.')
					},
					{
						type: 'string',
						description: nls.localize('schema.closeBracket', 'The closing bracket character or string sequence.')
					}
				]
			}
		},
		'editor.language.colorizedBracketPairs': {
			type: ['array', 'null'],
			default: null, // We want to distinguish the empty array from not configured.
			description: nls.localize('schema.colorizedBracketPairs', 'Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled.'),
			items: {
				type: 'array',
				items: [
					{
						type: 'string',
						description: nls.localize('schema.openBracket', 'The opening bracket character or string sequence.')
					},
					{
						type: 'string',
						description: nls.localize('schema.closeBracket', 'The closing bracket character or string sequence.')
					}
				]
			}
		},
		'diffEditor.maxComputationTime': {
			type: 'number',
			default: 5000,
			description: nls.localize('maxComputationTime', "Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.")
		},
		'diffEditor.maxFileSize': {
			type: 'number',
			default: 50,
			description: nls.localize('maxFileSize', "Maximum file size in MB for which to compute diffs. Use 0 for no limit.")
		},
		'diffEditor.renderSideBySide': {
			type: 'boolean',
			default: true,
			description: nls.localize('sideBySide', "Controls whether the diff editor shows the diff side by side or inline.")
		},
		'diffEditor.renderMarginRevertIcon': {
			type: 'boolean',
			default: true,
			description: nls.localize('renderMarginRevertIcon', "When enabled, the diff editor shows arrows in its glyph margin to revert changes.")
		},
		'diffEditor.ignoreTrimWhitespace': {
			type: 'boolean',
			default: true,
			description: nls.localize('ignoreTrimWhitespace', "When enabled, the diff editor ignores changes in leading or trailing whitespace.")
		},
		'diffEditor.renderIndicators': {
			type: 'boolean',
			default: true,
			description: nls.localize('renderIndicators', "Controls whether the diff editor shows +/- indicators for added/removed changes.")
		},
		'diffEditor.codeLens': {
			type: 'boolean',
			default: false,
			description: nls.localize('codeLens', "Controls whether the editor shows CodeLens.")
		},
		'diffEditor.wordWrap': {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: 'inherit',
			markdownEnumDescriptions: [
				nls.localize('wordWrap.off', "Lines will never wrap."),
				nls.localize('wordWrap.on', "Lines will wrap at the viewport width."),
				nls.localize('wordWrap.inherit', "Lines will wrap according to the {0} setting.", '`#editor.wordWrap#`'),
			]
		},
		'diffEditor.diffAlgorithm': {
			type: 'string',
			enum: ['legacy', 'advanced'],
			default: 'legacy',
			markdownEnumDescriptions: [
				nls.localize('diffAlgorithm.legacy', "Uses the legacy diffing algorithm."),
				nls.localize('diffAlgorithm.advanced', "Uses the advanced diffing algorithm."),
			],
			tags: ['experimental'],
		},
		'diffEditor.experimental.collapseUnchangedRegions': {
			type: 'boolean',
			default: false,
			description: nls.localize('collapseUnchangedRegions', "Controls whether the diff editor shows unchanged regions. Only works when 'diffEditor.experimental.useVersion2' is set."),
		},
		'diffEditor.experimental.showMoves': {
			type: 'boolean',
			default: false,
			description: nls.localize('showMoves', "Controls whether the diff editor should show detected code moves. Only works when 'diffEditor.experimental.useVersion2' is set."),
		},
		'diffEditor.experimental.useVersion2': {
			type: 'boolean',
			default: false,
			description: nls.localize('useVersion2', "Controls whether the diff editor uses the new or the old implementation."),
		}
	}
};

function isConfigurationPropertySchema(x: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema }): x is IConfigurationPropertySchema {
	return (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}

// Add properties from the Editor Option Registry
for (const editorOption of editorOptionsRegistry) {
	const schema = editorOption.schema;
	if (typeof schema !== 'undefined') {
		if (isConfigurationPropertySchema(schema)) {
			// This is a single schema contribution
			editorConfiguration.properties![`editor.${editorOption.name}`] = schema;
		} else {
			for (const key in schema) {
				if (Object.hasOwnProperty.call(schema, key)) {
					editorConfiguration.properties![key] = schema[key];
				}
			}
		}
	}
}

let cachedEditorConfigurationKeys: { [key: string]: boolean } | null = null;
function getEditorConfigurationKeys(): { [key: string]: boolean } {
	if (cachedEditorConfigurationKeys === null) {
		cachedEditorConfigurationKeys = <{ [key: string]: boolean }>Object.create(null);
		Object.keys(editorConfiguration.properties!).forEach((prop) => {
			cachedEditorConfigurationKeys![prop] = true;
		});
	}
	return cachedEditorConfigurationKeys;
}

export function isEditorConfigurationKey(key: string): boolean {
	const editorConfigurationKeys = getEditorConfigurationKeys();
	return (editorConfigurationKeys[`editor.${key}`] || false);
}

export function isDiffEditorConfigurationKey(key: string): boolean {
	const editorConfigurationKeys = getEditorConfigurationKeys();
	return (editorConfigurationKeys[`diffEditor.${key}`] || false);
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration(editorConfiguration);
