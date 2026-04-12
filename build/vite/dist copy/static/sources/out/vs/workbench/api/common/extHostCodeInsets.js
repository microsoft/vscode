/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { asWebviewUri, webviewGenericCspSource } from '../../contrib/webview/common/webview.js';
export class ExtHostEditorInsets {
    constructor(_proxy, _editors, _remoteInfo) {
        this._proxy = _proxy;
        this._editors = _editors;
        this._remoteInfo = _remoteInfo;
        this._handlePool = 0;
        this._disposables = new DisposableStore();
        this._insets = new Map();
        // dispose editor inset whenever the hosting editor goes away
        this._disposables.add(_editors.onDidChangeVisibleTextEditors(() => {
            const visibleEditor = _editors.getVisibleTextEditors();
            for (const value of this._insets.values()) {
                if (visibleEditor.indexOf(value.editor) < 0) {
                    value.inset.dispose(); // will remove from `this._insets`
                }
            }
        }));
    }
    dispose() {
        this._insets.forEach(value => value.inset.dispose());
        this._disposables.dispose();
    }
    createWebviewEditorInset(editor, line, height, options, extension) {
        let apiEditor;
        for (const candidate of this._editors.getVisibleTextEditors(true)) {
            if (candidate.value === editor) {
                apiEditor = candidate;
                break;
            }
        }
        if (!apiEditor) {
            throw new Error('not a visible editor');
        }
        const that = this;
        const handle = this._handlePool++;
        const onDidReceiveMessage = new Emitter();
        const onDidDispose = new Emitter();
        const webview = new class {
            constructor() {
                this._html = '';
                this._options = Object.create(null);
            }
            asWebviewUri(resource) {
                return asWebviewUri(resource, that._remoteInfo);
            }
            get cspSource() {
                return webviewGenericCspSource;
            }
            set options(value) {
                this._options = value;
                that._proxy.$setOptions(handle, value);
            }
            get options() {
                return this._options;
            }
            set html(value) {
                this._html = value;
                that._proxy.$setHtml(handle, value);
            }
            get html() {
                return this._html;
            }
            get onDidReceiveMessage() {
                return onDidReceiveMessage.event;
            }
            postMessage(message) {
                return that._proxy.$postMessage(handle, message);
            }
        };
        const inset = new class {
            constructor() {
                this.editor = editor;
                this.line = line;
                this.height = height;
                this.webview = webview;
                this.onDidDispose = onDidDispose.event;
            }
            dispose() {
                if (that._insets.delete(handle)) {
                    that._proxy.$disposeEditorInset(handle);
                    onDidDispose.fire();
                    // final cleanup
                    onDidDispose.dispose();
                    onDidReceiveMessage.dispose();
                }
            }
        };
        this._proxy.$createEditorInset(handle, apiEditor.id, apiEditor.value.document.uri, line + 1, height, options || {}, extension.identifier, extension.extensionLocation);
        this._insets.set(handle, { editor, inset, onDidReceiveMessage });
        return inset;
    }
    $onDidDispose(handle) {
        const value = this._insets.get(handle);
        if (value) {
            value.inset.dispose();
        }
    }
    $onDidReceiveMessage(handle, message) {
        const value = this._insets.get(handle);
        value?.onDidReceiveMessage.fire(message);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENvZGVJbnNldHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q29kZUluc2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSXBFLE9BQU8sRUFBRSxZQUFZLEVBQUUsdUJBQXVCLEVBQXFCLE1BQU0seUNBQXlDLENBQUM7QUFJbkgsTUFBTSxPQUFPLG1CQUFtQjtJQU0vQixZQUNrQixNQUFtQyxFQUNuQyxRQUF3QixFQUN4QixXQUE4QjtRQUY5QixXQUFNLEdBQU4sTUFBTSxDQUE2QjtRQUNuQyxhQUFRLEdBQVIsUUFBUSxDQUFnQjtRQUN4QixnQkFBVyxHQUFYLFdBQVcsQ0FBbUI7UUFQeEMsZ0JBQVcsR0FBRyxDQUFDLENBQUM7UUFDUCxpQkFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDOUMsWUFBTyxHQUFHLElBQUksR0FBRyxFQUE4RyxDQUFDO1FBUXZJLDZEQUE2RDtRQUM3RCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsR0FBRyxFQUFFO1lBQ2pFLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3ZELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO2dCQUMzQyxJQUFJLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUM3QyxLQUFLLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsa0NB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