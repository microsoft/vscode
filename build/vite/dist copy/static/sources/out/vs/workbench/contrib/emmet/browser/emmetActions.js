/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorAction } from '../../../../editor/browser/editorExtensions.js';
import { grammarsExtPoint } from '../../../services/textMate/common/TMGrammars.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
class GrammarContributions {
    static { this._grammars = {}; }
    constructor(contributions) {
        if (!Object.keys(GrammarContributions._grammars).length) {
            this.fillModeScopeMap(contributions);
        }
    }
    fillModeScopeMap(contributions) {
        contributions.forEach((contribution) => {
            contribution.value.forEach((grammar) => {
                if (grammar.language && grammar.scopeName) {
                    GrammarContributions._grammars[grammar.language] = grammar.scopeName;
                }
            });
        });
    }
    getGrammar(mode) {
        return GrammarContributions._grammars[mode];
    }
}
export class EmmetEditorAction extends EditorAction {
    constructor(opts) {
        super(opts);
        this._lastGrammarContributions = null;
        this._lastExtensionService = null;
        this.emmetActionName = opts.actionName;
    }
    static { this.emmetSupportedModes = ['html', 'css', 'xml', 'xsl', 'haml', 'jade', 'jsx', 'slim', 'scss', 'sass', 'less', 'stylus', 'styl', 'svg']; }
    _withGrammarContributions(extensionService) {
        if (this._lastExtensionService !== extensionService) {
            this._lastExtensionService = extensionService;
            this._lastGrammarContributions = extensionService.readExtensionPointContributions(grammarsExtPoint).then((contributions) => {
                return new GrammarContributions(contributions);
            });
        }
        return this._lastGrammarContributions || Promise.resolve(null);
    }
    run(accessor, editor) {
        const extensionService = accessor.get(IExtensionService);
        const commandService = accessor.get(ICommandService);
        return this._withGrammarContributions(extensionService).then((grammarContributions) => {
            if (this.id === 'editor.emmet.action.expandAbbreviation' && grammarContributions) {
                return commandService.executeCommand('emmet.expandAbbreviation', EmmetEditorAction.getLanguage(editor, grammarContributions));
            }
            return undefined;
        });
    }
    static getLanguage(editor, grammars) {
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) {
            return null;
        }
        const position = selection.getStartPosition();
        model.tokenization.tokenizeIfCheap(position.lineNumber);
        const languageId = model.getLanguageIdAtPosition(position.lineNumber, position.column);
        const syntax = languageId.split('.').pop();
        if (!syntax) {
            return null;
        }
        const checkParentMode = () => {
            const languageGrammar = grammars.getGrammar(syntax);
            if (!languageGrammar) {
                return syntax;
            }
            const languages = languageGrammar.split('.');
            if (languages.length < 2) {
                return syntax;
            }
            for (let i = 1; i < languages.length; i++) {
                const language = languages[languages.length - i];
                if (this.emmetSupportedModes.indexOf(language) !== -1) {
                    return language;
                }
            }
            return syntax;
        };
        return {
            language: syntax,
            parentMode: checkParentMode()
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1tZXRBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZW1tZXQvYnJvd3Nlci9lbW1ldEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBb0MsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTJCLE1BQU0saURBQWlELENBQUM7QUFDNUcsT0FBTyxFQUFFLGlCQUFpQixFQUE4QixNQUFNLG1EQUFtRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQVduRixNQUFNLG9CQUFvQjthQUVWLGNBQVMsR0FBaUIsRUFBRSxDQUFDO0lBRTVDLFlBQVksYUFBc0U7UUFDakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDekQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7SUFDRixDQUFDO0lBRU8sZ0JBQWdCLENBQUMsYUFBc0U7UUFDOUYsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3RDLFlBQVksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7Z0JBQ3RDLElBQUksT0FBTyxDQUFDLFFBQVEsSUFBSSxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQzNDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztnQkFDdEUsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU0s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