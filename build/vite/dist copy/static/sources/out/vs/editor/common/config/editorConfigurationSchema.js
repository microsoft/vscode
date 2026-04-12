/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { diffEditorDefaultOptions } from './diffEditor.js';
import { editorOptionsRegistry } from './editorOptions.js';
import { EDITOR_MODEL_DEFAULTS } from '../core/misc/textModelDefaults.js';
import * as nls from '../../../nls.js';
import { Extensions } from '../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../platform/registry/common/platform.js';
export const editorConfigurationBaseNode = Object.freeze({
    id: 'editor',
    order: 5,
    type: 'object',
    title: nls.localize('editorConfigurationTitle', "Editor"),
    scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
});
const editorConfiguration = {
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
            enum: ['off', 'offWithInlineSuggestions', 'currentDocument', 'matchingDocuments', 'allDocuments'],
            default: 'offWithInlineSuggestions',
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
function isConfigurationPropertySchema(x) {
    return (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}
// Add properties from the Editor Option Registry
for (const editorOption of editorOptionsRegistry) {
    const schema = editorOption.schema;
    if (typeof schema !== 'undefined') {
        if (isConfigurationPropertySchema(schema)) {
            // This is a single schema contribution
            editorConfiguration.properties[`editor.${editorOption.name}`] = schema;
        }
        else {
            for (const key in schema) {
                if (Object.hasOwnProperty.call(schema, key)) {
                    editorConfiguration.properties[key] = schema[key];
                }
            }
        }
    }
}
let cachedEditorConfigurationKeys = null;
function getEditorConfigurationKeys() {
    if (cachedEditorConfigurationKeys === null) {
        cachedEditorConfigurationKeys = Object.create(null);
        Object.keys(editorConfiguration.properties).forEach((prop) => {
            cachedEditorConfigurationKeys[prop] = true;
        });
    }
    return cachedEditorConfigurationKeys;
}
export function isEditorConfigurationKey(key) {
    const editorConfigurationKeys = getEditorConfigurationKeys();
    return (editorConfigurationKeys[`editor.${key}`] || false);
}
export function isDiffEditorConfigurationKey(key) {
    const editorConfigurationKeys = getEditorConfigurationKeys();
    return (editorConfigurationKeys[`diffEditor.${key}`] || false);
}
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration(editorConfiguration);
export async function registerEditorFontConfigurations(getFontSnippets) {
    const editorKeysWithFont = ['editor.fontFamily'];
    const fontSnippets = await getFontSnippets();
    for (const key of editorKeysWithFont) {
        if (editorConfiguration.properties && editorConfiguration.properties[key]) {
            editorConfiguration.properties[key].defaultSnippets = fontSnippets;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQ29uZmlndXJhdGlvblNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDM0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLEVBQXNCLFVBQVUsRUFBNEUsTUFBTSxpRUFBaUUsQ0FBQztBQUMzTCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFekUsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBcUI7SUFDNUUsRUFBRSxFQUFFLFFBQVE7SUFDWixLQUFLLEVBQUUsQ0FBQztJQUNSLElBQUksRUFBRSxRQUFRO0lBQ2QsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsUUFBUSxDQUFDO0lBQ3pELEtBQUssaURBQXlDO0NBQzlDLENBQUMsQ0FBQztBQUVILE1BQU0sbUJBQW1CLEdBQXVCO0lBQy9DLEdBQUcsMkJBQTJCO0lBQzlCLFVBQVUsRUFBRTtRQUNYLGdCQUFnQixFQUFFO1lBQ2pCLElBQUksRUFBRSxRQUFRO1lBQ2QsT0FBTyxFQUFFLHFCQUFxQixDQUFDLE9BQU87WUFDdEMsT0FBTyxFQUFFLENBQUM7WUFDVixPQUFPLEVBQUUsR0FBRztZQUNaLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLCtHQUErRyxFQUFFLDhCQUE4QixDQUFDO1NBQzdMO1FBQ0QsbUJBQW1CLEVBQUU7WUFDcEIsT0FBTyxFQUFFO2dCQUNSO29CQUNDLElBQUksRUFBRSxRQUFRO29CQUNkLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztpQkFDakI7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsT0FBTyxFQUFFLENBQUM7aUJBQ1Y7YUFDRDtZQUNELE9BQU8sRUFBRSxTQUFTO1lBQ2xCLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLHFNQUFxTSxDQUFDO1NBQ3RQO1FBQ0QscUJBQXFCLEVBQUU7WUFDdEIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUscUJBQXFCLENBQUMsWUFBWTtZQUMzQyxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSwwR0FBMEcsRUFBRSw4QkFBOEIsQ0FBQztTQUM3TDtRQUNELDBCQUEwQixFQUFFO1lBQzNCLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLHFCQUFxQixDQUFDLGlCQUFpQjtZQUNoRCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLCtHQUErRyxFQUFFLG9CQUFvQixFQUFFLHlCQUF5QixDQUFDO1NBQ3hOO1FBQ0QsMkJBQTJCLEVBQUU7WUFDNUIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUscUJBQXFCLENBQUMsa0JBQWtCO1lBQ2pELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDJDQUEyQyxDQUFDO1NBQzVGO1FBQ0QsK0JBQStCLEVBQUU7WUFDaEMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUscUJBQXFCLENBQUMsc0JBQXNCO1lBQ3JELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGdGQUFnRixDQUFDO1NBQ3JJO1FBQ0QsNkJBQTZCLEVBQUU7WUFDOUIsSUFBSSxFQUFFLENBQUMsS0FBSyxFQUFFLDBCQUEwQixFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLGNBQWMsQ0FBQztZQUNqRyxPQUFPLEVBQUUsMEJBQTBCO1lBQ25DLGdCQUFnQixFQUFFO2dCQUNqQixHQUFHLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLGtDQUFrQyxDQUFDO2dCQUM1RSxHQUFHLENBQUMsUUFBUSxDQUFDLCtDQUErQyxFQUFFLHNFQUFzRSxDQUFDO2dCQUNySSxHQUFHLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDhDQUE4QyxDQUFDO2dCQUNwRyxHQUFHLENBQUMsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLDZEQUE2RCxDQUFDO2dCQUNySCxHQUFHLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHdDQUF3QyxDQUFDO2FBQzNGO1lBQ0QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsNEhBQTRILENBQUM7WUFDL0ssVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtTQUM1QjtRQUNELHFDQUFxQyxFQUFFO1lBQ3RDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsbUJBQW1CLENBQUM7WUFDeEMsZ0JBQWdCLEVBQUU7Z0JBQ2pCLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUscURBQXFELENBQUM7Z0JBQ2hHLEdBQUcsQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsc0RBQXNELENBQUM7Z0JBQ2xHLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0NBQXdDLEVBQUUsbUdBQW1HLENBQUM7YUFDM0o7WUFDRCxPQUFPLEVBQUUsbUJBQW1CO1lBQzVCLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHVGQUF1RixDQUFDO1NBQ2xKO1FBQ0QsbUJBQW1CLEVBQUU7WUFDcEIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLDBGQUEwRixDQUFDO1NBQzNJO1FBQ0Qsa0NBQWtDLEVBQUU7WUFDbkMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsTUFBTTtZQUNmLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDJCQUEyQixFQUFFLHVFQUF1RSxDQUFDO1NBQy9IO1FBQ0QsdUNBQXVDLEVBQUU7WUFDeEMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLGlGQUFpRixDQUFDO1lBQ3JKLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztTQUN0QjtRQUNELDhDQUE4QyxFQUFFO1lBQy9DLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4Q0FBOEMsRUFBRSwyRUFBMkUsQ0FBQztTQUN0SjtRQUNELG1EQUFtRCxFQUFFO1lBQ3BELElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtREFBbUQsRUFBRSxrSkFBa0osQ0FBQztZQUNsTyxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7U0FDdEI7UUFDRCx5Q0FBeUMsRUFBRTtZQUMxQyxJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxLQUFLO1lBQ2QsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxpTEFBaUwsQ0FBQztZQUMvUCxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7WUFDdEIsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2FBQ1o7U0FDRDtRQUNELDBDQUEwQyxFQUFFO1lBQzNDLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLHVKQUF1SixDQUFDO1lBQ3RPLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztZQUN0QixVQUFVLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLE1BQU07YUFDWjtTQUNEO1FBQ0QsaURBQWlELEVBQUU7WUFDbEQsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsaURBQWlELEVBQUUscUtBQXFLLENBQUM7WUFDM1AsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1lBQ3RCLFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsTUFBTTthQUNaO1NBQ0Q7UUFDRCwwQ0FBMEMsRUFBRTtZQUMzQyxJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxLQUFLO1lBQ2QsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSx1SkFBdUosQ0FBQztZQUN0TyxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7WUFDdEIsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxNQUFNO2FBQ1o7U0FDRDtRQUNELDRDQUE0QyxFQUFFO1lBQzdDLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLEtBQUs7WUFDZCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLDJKQUEySixDQUFDO1lBQzVPLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztZQUN0QixVQUFVLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLE1BQU07YUFDWjtTQUNEO1FBQ0QsMEJBQTBCLEVBQUU7WUFDM0IsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztZQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLDhEQUE4RDtZQUM3RSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSx3RUFBd0UsQ0FBQztZQUN0SCxLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLE9BQU87Z0JBQ2IsS0FBSyxFQUFFO29CQUNOO3dCQUNDLElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLG1EQUFtRCxDQUFDO3FCQUNwRztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxtREFBbUQsQ0FBQztxQkFDckc7aUJBQ0Q7YUFDRDtTQUNEO1FBQ0QsdUNBQXVDLEVBQUU7WUFDeEMsSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztZQUN2QixPQUFPLEVBQUUsSUFBSSxFQUFFLDhEQUE4RDtZQUM3RSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSw4R0FBOEcsQ0FBQztZQUN6SyxLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLE9BQU87Z0JBQ2IsS0FBSyxFQUFFO29CQUNOO3dCQUNDLElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLG1EQUFtRCxDQUFDO3FCQUNwRztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxtREFBbUQsQ0FBQztxQkFDckc7aUJBQ0Q7YUFDRDtTQUNEO1FBQ0QsK0JBQStCLEVBQUU7WUFDaEMsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsd0JBQXdCLENBQUMsa0JBQWtCO1lBQ3BELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDBGQUEwRixDQUFDO1NBQzNJO1FBQ0Qsd0JBQXdCLEVBQUU7WUFDekIsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsd0JBQXdCLENBQUMsV0FBVztZQUM3QyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUseUVBQXlFLENBQUM7U0FDbkg7UUFDRCw2QkFBNkIsRUFBRTtZQUM5QixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSx3QkFBd0IsQ0FBQyxnQkFBZ0I7WUFDbEQsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLHlFQUF5RSxDQUFDO1NBQ2xIO1FBQ0QsNkNBQTZDLEVBQUU7WUFDOUMsSUFBSSxFQUFFLFFBQVE7WUFDZCxPQUFPLEVBQUUsd0JBQXdCLENBQUMsZ0NBQWdDO1lBQ2xFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLCtFQUErRSxDQUFDO1NBQzlJO1FBQ0QsNENBQTRDLEVBQUU7WUFDN0MsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsK0JBQStCO1lBQ2pFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLHdFQUF3RSxDQUFDO1NBQ3RJO1FBQ0QsbUNBQW1DLEVBQUU7WUFDcEMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsc0JBQXNCO1lBQ3hELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLG1GQUFtRixDQUFDO1NBQ3hJO1FBQ0QsNkJBQTZCLEVBQUU7WUFDOUIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsZ0JBQWdCO1lBQ2xELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLG9GQUFvRixDQUFDO1NBQ25JO1FBQ0QsaUNBQWlDLEVBQUU7WUFDbEMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsb0JBQW9CO1lBQ3RELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLGtGQUFrRixDQUFDO1NBQ3JJO1FBQ0QsNkJBQTZCLEVBQUU7WUFDOUIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsZ0JBQWdCO1lBQ2xELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLGtGQUFrRixDQUFDO1NBQ2pJO1FBQ0QscUJBQXFCLEVBQUU7WUFDdEIsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsWUFBWTtZQUM5QyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsNkNBQTZDLENBQUM7U0FDcEY7UUFDRCxxQkFBcUIsRUFBRTtZQUN0QixJQUFJLEVBQUUsUUFBUTtZQUNkLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsU0FBUyxDQUFDO1lBQzlCLE9BQU8sRUFBRSx3QkFBd0IsQ0FBQyxZQUFZO1lBQzlDLHdCQUF3QixFQUFFO2dCQUN6QixHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSx3QkFBd0IsQ0FBQztnQkFDdEQsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsd0NBQXdDLENBQUM7Z0JBQ3JFLEdBQUcsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsK0NBQStDLEVBQUUscUJBQXFCLENBQUM7YUFDeEc7U0FDRDtRQUNELDBCQUEwQixFQUFFO1lBQzNCLElBQUksRUFBRSxRQUFRO1lBQ2QsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQztZQUM1QixPQUFPLEVBQUUsd0JBQXdCLENBQUMsYUFBYTtZQUMvQyx3QkFBd0IsRUFBRTtnQkFDekIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxvQ0FBb0MsQ0FBQztnQkFDMUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxzQ0FBc0MsQ0FBQzthQUM5RTtTQUNEO1FBQ0QseUNBQXlDLEVBQUU7WUFDMUMsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsT0FBTztZQUM5RCxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDJEQUEyRCxDQUFDO1NBQzlIO1FBQ0QsaURBQWlELEVBQUU7WUFDbEQsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsZUFBZTtZQUN0RSxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLHlEQUF5RCxDQUFDO1lBQ3BJLE9BQU8sRUFBRSxDQUFDO1NBQ1Y7UUFDRCxrREFBa0QsRUFBRTtZQUNuRCxJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSx3QkFBd0IsQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0I7WUFDdkUsbUJBQW1CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSxzRUFBc0UsQ0FBQztZQUNsSixPQUFPLEVBQUUsQ0FBQztTQUNWO1FBQ0Qsa0RBQWtELEVBQUU7WUFDbkQsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCO1lBQ3ZFLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUNBQXVDLEVBQUUsK0VBQStFLENBQUM7WUFDM0osT0FBTyxFQUFFLENBQUM7U0FDVjtRQUNELG1DQUFtQyxFQUFFO1lBQ3BDLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxTQUFTO1lBQ3hELG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLG1FQUFtRSxDQUFDO1NBQ25IO1FBQ0QsOENBQThDLEVBQUU7WUFDL0MsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsd0JBQXdCLENBQUMsWUFBWSxDQUFDLG9CQUFvQjtZQUNuRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSwyR0FBMkcsQ0FBQztTQUM5SjtRQUNELDJDQUEyQyxFQUFFO1lBQzVDLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLHdCQUF3QixDQUFDLFlBQVksQ0FBQyxpQkFBaUI7WUFDaEUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsbUZBQW1GLENBQUM7U0FDbkk7S0FDRDtDQUNELENBQUM7QUFFRixTQUFTLDZCQUE2QixDQUFDLENBQWtGO0lBQ3hILE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEtBQUssV0FBVyxJQUFJLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxXQUFXLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsaURBQWlEO0FBQ2pELEtBQUssTUFBTSxZQUFZLElBQUkscUJBQXFCLEVBQUUsQ0FBQztJQUNsRCxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO0lBQ25DLElBQUksT0FBTyxNQUFNLEtBQUssV0FBVyxFQUFFLENBQUM7UUFDbkMsSUFBSSw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzNDLHVDQUF1QztZQUN2QyxtQkFBbUIsQ0FBQyxVQUFXLENBQUMsVUFBVSxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUM7UUFDekUsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUMxQixJQUFJLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUM3QyxtQkFBbUIsQ0FBQyxVQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNwRCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELElBQUksNkJBQTZCLEdBQXNDLElBQUksQ0FBQztBQUM1RSxTQUFTLDBCQUEwQjtJQUNsQyxJQUFJLDZCQUE2QixLQUFLLElBQUksRUFBRSxDQUFDO1FBQzVDLDZCQUE2QixHQUErQixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsVUFBVyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFDN0QsNkJBQThCLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUNELE9BQU8sNkJBQTZCLENBQUM7QUFDdEMsQ0FBQztBQUVELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFXO0lBQ25ELE1BQU0sdUJBQXVCLEdBQUcsMEJBQTBCLEVBQUUsQ0FBQztJQUM3RCxPQUFPLENBQUMsdUJBQXVCLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO0FBQzVELENBQUM7QUFFRCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsR0FBVztJQUN2RCxNQUFNLHVCQUF1QixHQUFHLDBCQUEwQixFQUFFLENBQUM7SUFDN0QsT0FBTyxDQUFDLHVCQUF1QixDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNoRSxDQUFDO0FBRUQsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUF5QixVQUFVLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDNUYscUJBQXFCLENBQUMscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUVqRSxNQUFNLENBQUMsS0FBSyxVQUFVLGdDQUFnQyxDQUFDLGVBQW9EO0lBQzFHLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sWUFBWSxHQUFHLE1BQU0sZUFBZSxFQUFFLENBQUM7SUFDN0MsS0FBSyxNQUFNLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQ3RDLElBQ0MsbUJBQW1CLENBQUMsVUFBVSxJQUFJLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFDcEUsQ0FBQztZQUNGLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLEdBQUcsWUFBWSxDQUFDO1FBQ3BFLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQyJ9