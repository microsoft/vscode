/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IJSONSchemaSnippet } from '../../../base/common/jsonSchema.js';
import { diffEditorDefaultOptions } from './diffEditor.js';
import { editorOptionsRegistry } from './editorOptions.js';
import { EDITOR_MODEL_DEFAULTS } from '../core/misc/textModelDefaults.js';
import * as nls from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../platform/registry/common/platform.js';

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
			maximum: 100,
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
			enum: ['off', 'currentDocument', 'matchingDocuments', 'allDocuments', 'offWithInlineSuggestions'],
			default: 'matchingDocuments',
			enumDescriptions: [
				nls.localize('wordBasedSuggestions.off', 'Turn off Word Based Suggestions.'),
				nls.localize('wordBasedSuggestions.offWithInlineSuggestions', 'Turn off Word Based Suggestions when Inline Suggestions are present.'),
				nls.localize('wordBasedSuggestions.currentDocument', 'Only suggest words from the active document.'),
				nls.localize('wordBasedSuggestions.matchingDocuments', 'Suggest words from all open documents of the same language.'),
				nls.localize('wordBasedSuggestions.allDocuments', 'Suggest words from all open documents.'),
			],
			description: nls.localize('wordBasedSuggestions', "Controls whether completions should be computed based on words in the document and from which documents they are computed."),
			experiment: { mode: 'auto' },
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
			default: true,
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
			tags: ['experimental'],
		},
		'editor.experimental.treeSitterTelemetry': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('editor.experimental.treeSitterTelemetry', "Controls whether tree sitter parsing should be turned on and telemetry collected. Setting `#editor.experimental.preferTreeSitter#` for specific languages will take precedence."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'editor.experimental.preferTreeSitter.css': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('editor.experimental.preferTreeSitter.css', "Controls whether tree sitter parsing should be turned on for css. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for css."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'editor.experimental.preferTreeSitter.typescript': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('editor.experimental.preferTreeSitter.typescript', "Controls whether tree sitter parsing should be turned on for typescript. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for typescript."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'editor.experimental.preferTreeSitter.ini': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('editor.experimental.preferTreeSitter.ini', "Controls whether tree sitter parsing should be turned on for ini. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for ini."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
		},
		'editor.experimental.preferTreeSitter.regex': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('editor.experimental.preferTreeSitter.regex', "Controls whether tree sitter parsing should be turned on for regex. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for regex."),
			tags: ['experimental'],
			experiment: {
				mode: 'auto'
			}
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
			default: diffEditorDefaultOptions.maxComputationTime,
			description: nls.localize('maxComputationTime', "Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.")
		},
		'diffEditor.maxFileSize': {
			type: 'number',
			default: diffEditorDefaultOptions.maxFileSize,
			description: nls.localize('maxFileSize', "Maximum file size in MB for which to compute diffs. Use 0 for no limit.")
		},
		'diffEditor.renderSideBySide': {
			type: 'boolean',
			default: diffEditorDefaultOptions.renderSideBySide,
			description: nls.localize('sideBySide', "Controls whether the diff editor shows the diff side by side or inline.")
		},
		'diffEditor.renderSideBySideInlineBreakpoint': {
			type: 'number',
			default: diffEditorDefaultOptions.renderSideBySideInlineBreakpoint,
			description: nls.localize('renderSideBySideInlineBreakpoint', "If the diff editor width is smaller than this value, the inline view is used.")
		},
		'diffEditor.useInlineViewWhenSpaceIsLimited': {
			type: 'boolean',
			default: diffEditorDefaultOptions.useInlineViewWhenSpaceIsLimited,
			description: nls.localize('useInlineViewWhenSpaceIsLimited', "If enabled and the editor width is too small, the inline view is used.")
		},
		'diffEditor.renderMarginRevertIcon': {
			type: 'boolean',
			default: diffEditorDefaultOptions.renderMarginRevertIcon,
			description: nls.localize('renderMarginRevertIcon', "When enabled, the diff editor shows arrows in its glyph margin to revert changes.")
		},
		'diffEditor.renderGutterMenu': {
			type: 'boolean',
			default: diffEditorDefaultOptions.renderGutterMenu,
			description: nls.localize('renderGutterMenu', "When enabled, the diff editor shows a special gutter for revert and stage actions.")
		},
		'diffEditor.ignoreTrimWhitespace': {
			type: 'boolean',
			default: diffEditorDefaultOptions.ignoreTrimWhitespace,
			description: nls.localize('ignoreTrimWhitespace', "When enabled, the diff editor ignores changes in leading or trailing whitespace.")
		},
		'diffEditor.renderIndicators': {
			type: 'boolean',
			default: diffEditorDefaultOptions.renderIndicators,
			description: nls.localize('renderIndicators', "Controls whether the diff editor shows +/- indicators for added/removed changes.")
		},
		'diffEditor.codeLens': {
			type: 'boolean',
			default: diffEditorDefaultOptions.diffCodeLens,
			description: nls.localize('codeLens', "Controls whether the editor shows CodeLens.")
		},
		'diffEditor.wordWrap': {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: diffEditorDefaultOptions.diffWordWrap,
			markdownEnumDescriptions: [
				nls.localize('wordWrap.off', "Lines will never wrap."),
				nls.localize('wordWrap.on', "Lines will wrap at the viewport width."),
				nls.localize('wordWrap.inherit', "Lines will wrap according to the {0} setting.", '`#editor.wordWrap#`'),
			]
		},
		'diffEditor.diffAlgorithm': {
			type: 'string',
			enum: ['legacy', 'advanced'],
			default: diffEditorDefaultOptions.diffAlgorithm,
			markdownEnumDescriptions: [
				nls.localize('diffAlgorithm.legacy', "Uses the legacy diffing algorithm."),
				nls.localize('diffAlgorithm.advanced', "Uses the advanced diffing algorithm."),
			]
		},
		'diffEditor.hideUnchangedRegions.enabled': {
			type: 'boolean',
			default: diffEditorDefaultOptions.hideUnchangedRegions.enabled,
			markdownDescription: nls.localize('hideUnchangedRegions.enabled', "Controls whether the diff editor shows unchanged regions."),
		},
		'diffEditor.hideUnchangedRegions.revealLineCount': {
			type: 'integer',
			default: diffEditorDefaultOptions.hideUnchangedRegions.revealLineCount,
			markdownDescription: nls.localize('hideUnchangedRegions.revealLineCount', "Controls how many lines are used for unchanged regions."),
			minimum: 1,
		},
		'diffEditor.hideUnchangedRegions.minimumLineCount': {
			type: 'integer',
			default: diffEditorDefaultOptions.hideUnchangedRegions.minimumLineCount,
			markdownDescription: nls.localize('hideUnchangedRegions.minimumLineCount', "Controls how many lines are used as a minimum for unchanged regions."),
			minimum: 1,
		},
		'diffEditor.hideUnchangedRegions.contextLineCount': {
			type: 'integer',
			default: diffEditorDefaultOptions.hideUnchangedRegions.contextLineCount,
			markdownDescription: nls.localize('hideUnchangedRegions.contextLineCount', "Controls how many lines are used as context when comparing unchanged regions."),
			minimum: 1,
		},
		'diffEditor.experimental.showMoves': {
			type: 'boolean',
			default: diffEditorDefaultOptions.experimental.showMoves,
			markdownDescription: nls.localize('showMoves', "Controls whether the diff editor should show detected code moves.")
		},
		'diffEditor.experimental.showEmptyDecorations': {
			type: 'boolean',
			default: diffEditorDefaultOptions.experimental.showEmptyDecorations,
			description: nls.localize('showEmptyDecorations', "Controls whether the diff editor shows empty decorations to see where characters got inserted or deleted."),
		},
		'diffEditor.experimental.useTrueInlineView': {
			type: 'boolean',
			default: diffEditorDefaultOptions.experimental.useTrueInlineView,
			description: nls.localize('useTrueInlineView', "If enabled and the editor uses the inline view, word changes are rendered inline."),
		},
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

export async function registerEditorFontConfigurations(getFontSnippets: () => Promise<IJSONSchemaSnippet[]>) {
	const editorKeysWithFont = ['editor.fontFamily'];
	const fontSnippets = await getFontSnippets();
	for (const key of editorKeysWithFont) {
		if (
			editorConfiguration.properties && editorConfiguration.properties[key]
		) {
			editorConfiguration.properties[key].defaultSnippets = fontSnippets;
		}
	}
}
