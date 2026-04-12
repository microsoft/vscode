/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as arrays from '../../../base/common/arrays.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { TextEditorDecorationType } from './extHostTextEditor.js';
import * as TypeConverters from './extHostTypeConverters.js';
import { TextEditorSelectionChangeKind, TextEditorChangeKind } from './extHostTypes.js';
export class ExtHostEditors extends Disposable {
    constructor(mainContext, _extHostDocumentsAndEditors) {
        super();
        this._extHostDocumentsAndEditors = _extHostDocumentsAndEditors;
        this._onDidChangeTextEditorSelection = this._register(new Emitter());
        this._onDidChangeTextEditorOptions = this._register(new Emitter());
        this._onDidChangeTextEditorVisibleRanges = this._register(new Emitter());
        this._onDidChangeTextEditorViewColumn = this._register(new Emitter());
        this._onDidChangeTextEditorDiffInformation = this._register(new Emitter());
        this._onDidChangeActiveTextEditor = this._register(new Emitter());
        this._onDidChangeVisibleTextEditors = this._register(new Emitter());
        this.onDidChangeTextEditorSelection = this._onDidChangeTextEditorSelection.event;
        this.onDidChangeTextEditorOptions = this._onDidChangeTextEditorOptions.event;
        this.onDidChangeTextEditorVisibleRanges = this._onDidChangeTextEditorVisibleRanges.event;
        this.onDidChangeTextEditorViewColumn = this._onDidChangeTextEditorViewColumn.event;
        this.onDidChangeTextEditorDiffInformation = this._onDidChangeTextEditorDiffInformation.event;
        this.onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;
        this.onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;
        this._proxy = mainContext.getProxy(MainContext.MainThreadTextEditors);
        this._register(this._extHostDocumentsAndEditors.onDidChangeVisibleTextEditors(e => this._onDidChangeVisibleTextEditors.fire(e)));
        this._register(this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(e => this._onDidChangeActiveTextEditor.fire(e)));
    }
    getActiveTextEditor() {
        return this._extHostDocumentsAndEditors.activeEditor();
    }
    getVisibleTextEditors(internal) {
        const editors = this._extHostDocumentsAndEditors.allEditors();
        return internal
            ? editors
            : editors.map(editor => editor.value);
    }
    async showTextDocument(document, columnOrOptions, preserveFocus) {
        let options;
        if (typeof columnOrOptions === 'number') {
            options = {
                position: TypeConverters.ViewColumn.from(columnOrOptions),
                preserveFocus
            };
        }
        else if (typeof columnOrOptions === 'object') {
            options = {
                position: TypeConverters.ViewColumn.from(columnOrOptions.viewColumn),
                preserveFocus: columnOrOptions.preserveFocus,
                selection: typeof columnOrOptions.selection === 'object' ? TypeConverters.Range.from(columnOrOptions.selection) : undefined,
                pinned: typeof columnOrOptions.preview === 'boolean' ? !columnOrOptions.preview : undefined
            };
        }
        else {
            options = {
                preserveFocus: false
            };
        }
        const editorId = await this._proxy.$tryShowTextDocument(document.uri, options);
        const editor = editorId && this._extHostDocumentsAndEditors.getEditor(editorId);
        if (editor) {
            return editor.value;
        }
        // we have no editor... having an id means that we had an editor
        // on the main side and that it isn't the current editor anymore...
        if (editorId) {
            throw new Error(`Could NOT open editor for "${document.uri.toString()}" because another editor opened in the meantime.`);
        }
        else {
            throw new Error(`Could NOT open editor for "${document.uri.toString()}".`);
        }
    }
    createTextEditorDecorationType(extension, options) {
        return new TextEditorDecorationType(this._proxy, extension, options).value;
    }
    // --- called from main thread
    $acceptEditorPropertiesChanged(id, data) {
        const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
        if (!textEditor) {
            throw new Error('unknown text editor');
        }
        // (1) set all properties
        if (data.options) {
            textEditor._acceptOptions(data.options);
        }
        if (data.selections) {
            const selections = data.selections.selections.map(TypeConverters.Selection.to);
            textEditor._acceptSelections(selections);
        }
        if (data.visibleRanges) {
            const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
            textEditor._acceptVisibleRanges(visibleRanges);
        }
        // (2) fire change events
        if (data.options) {
            this._onDidChangeTextEditorOptions.fire({
                textEditor: textEditor.value,
                options: { ...data.options, lineNumbers: TypeConverters.TextEditorLineNumbersStyle.to(data.options.lineNumbers) }
            });
        }
        if (data.selections) {
            const kind = TextEditorSelectionChangeKind.fromValue(data.selections.source);
            const selections = data.selections.selections.map(TypeConverters.Selection.to);
            this._onDidChangeTextEditorSelection.fire({
                textEditor: textEditor.value,
                selections,
                kind
            });
        }
        if (data.visibleRanges) {
            const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
            this._onDidChangeTextEditorVisibleRanges.fire({
                textEditor: textEditor.value,
                visibleRanges
            });
        }
    }
    $acceptEditorPositionData(data) {
        for (const id in data) {
            const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
            if (!textEditor) {
                throw new Error('Unknown text editor');
            }
            const viewColumn = TypeConverters.ViewColumn.to(data[id]);
            if (textEditor.value.viewColumn !== viewColumn) {
                textEditor._acceptViewColumn(viewColumn);
                this._onDidChangeTextEditorViewColumn.fire({ textEditor: textEditor.value, viewColumn });
            }
        }
    }
    $acceptEditorDiffInformation(id, diffInformation) {
        const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
        if (!textEditor) {
            throw new Error('unknown text editor');
        }
        if (!diffInformation) {
            textEditor._acceptDiffInformation(undefined);
            this._onDidChangeTextEditorDiffInformation.fire({
                textEditor: textEditor.value,
                diffInformation: undefined
            });
            return;
        }
        const that = this;
        const result = diffInformation.map(diff => {
            const original = URI.revive(diff.original);
            const modified = URI.revive(diff.modified);
            const changes = diff.changes.map(change => {
                const [originalStartLineNumber, originalEndLineNumberExclusive, modifiedStartLineNumber, modifiedEndLineNumberExclusive] = change;
                let kind;
                if (originalStartLineNumber === originalEndLineNumberExclusive) {
                    kind = TextEditorChangeKind.Addition;
                }
                else if (modifiedStartLineNumber === modifiedEndLineNumberExclusive) {
                    kind = TextEditorChangeKind.Deletion;
                }
                else {
                    kind = TextEditorChangeKind.Modification;
                }
                return {
                    original: {
                        startLineNumber: originalStartLineNumber,
                        endLineNumberExclusive: originalEndLineNumberExclusive
                    },
                    modified: {
                        startLineNumber: modifiedStartLineNumber,
                        endLineNumberExclusive: modifiedEndLineNumberExclusive
                    },
                    kind
                };
            });
            return Object.freeze({
                documentVersion: diff.documentVersion,
                original,
                modified,
                changes,
                get isStale() {
                    const document = that._extHostDocumentsAndEditors.getDocument(modified);
                    return document?.version !== diff.documentVersion;
                }
            });
        });
        textEditor._acceptDiffInformation(result);
        this._onDidChangeTextEditorDiffInformation.fire({
            textEditor: textEditor.value,
            diffInformation: result
        });
    }
    getDiffInformation(id) {
        return Promise.resolve(this._proxy.$getDiffInformation(id));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRleHRFZGl0b3JzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFRleHRFZGl0b3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sZ0NBQWdDLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFpSixXQUFXLEVBQThCLE1BQU0sdUJBQXVCLENBQUM7QUFFL04sT0FBTyxFQUFxQix3QkFBd0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3JGLE9BQU8sS0FBSyxjQUFjLE1BQU0sNEJBQTRCLENBQUM7QUFDN0QsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFHeEYsTUFBTSxPQUFPLGNBQWUsU0FBUSxVQUFVO0lBb0I3QyxZQUNDLFdBQXlCLEVBQ1IsMkJBQXVEO1FBRXhFLEtBQUssRUFBRSxDQUFDO1FBRlMsZ0NBQTJCLEdBQTNCLDJCQUEyQixDQUE0QjtRQXBCeEQsb0NBQStCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBeUMsQ0FBQyxDQUFDO1FBQ3ZHLGtDQUE2QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVDLENBQUMsQ0FBQztRQUNuRyx3Q0FBbUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE2QyxDQUFDLENBQUM7UUFDL0cscUNBQWdDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9B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