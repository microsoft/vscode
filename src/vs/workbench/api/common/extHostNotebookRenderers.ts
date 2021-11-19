/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostNotebookRenderersShape, IMainContext, MainContext, MainThreadNotebookRenderersShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostNotebookEditor } from 'vs/workbench/api/common/extHostNotebookEditor';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import * as vscode from 'vscode';


export class ExtHostNotebookRenderers implements ExtHostNotebookRenderersShape {
	private readonly _rendererMessageEmitters = new Map<string /* rendererId */, Emitter<{ editor: vscode.NotebookEditor, message: any }>>();
	private readonly proxy: MainThreadNotebookRenderersShape;

	constructor(mainContext: IMainContext, private readonly _extHostNotebook: ExtHostNotebookController) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadNotebookRenderers);
	}

	public $postRendererMessage(editorId: string, rendererId: string, message: unknown): void {
		const editor = this._extHostNotebook.getEditorById(editorId);
		this._rendererMessageEmitters.get(rendererId)?.fire({ editor: editor.apiEditor, message });
	}

	public createRendererMessaging(manifest: IExtensionDescription, rendererId: string): vscode.NotebookRendererMessaging {
		if (!manifest.contributes?.notebookRenderer?.some(r => r.id === rendererId)) {
			throw new Error(`Extensions may only call createRendererMessaging() for renderers they contribute (got ${rendererId})`);
		}

		// In the stable API, the editor is given as an empty object, and this map
		// is used to maintain references. This can be removed after editor finalization.
		const notebookEditorVisible = isProposedApiEnabled(manifest, 'notebookEditor');
		const notebookEditorAliases = new WeakMap<{}, vscode.NotebookEditor>();

		const messaging: vscode.NotebookRendererMessaging = {
			onDidReceiveMessage: (listener, thisArg, disposables) => {
				const wrappedListener = notebookEditorVisible ? listener : (evt: { editor: vscode.NotebookEditor, message: any }) => {
					const obj = {};
					notebookEditorAliases.set(obj, evt.editor);
					listener({ editor: obj as vscode.NotebookEditor, message: evt.message });
				};

				return this.getOrCreateEmitterFor(rendererId).event(wrappedListener, thisArg, disposables);
			},
			postMessage: (message, editorOrAlias) => {
				if (ExtHostNotebookEditor.apiEditorsToExtHost.has(message)) { // back compat for swapped args
					[message, editorOrAlias] = [editorOrAlias, message];
				}


				const editor = notebookEditorVisible ? editorOrAlias : notebookEditorAliases.get(editorOrAlias!);
				const extHostEditor = editor && ExtHostNotebookEditor.apiEditorsToExtHost.get(editor);
				return this.proxy.$postMessage(extHostEditor?.id, rendererId, message);
			},
		};

		return messaging;
	}

	private getOrCreateEmitterFor(rendererId: string) {
		let emitter = this._rendererMessageEmitters.get(rendererId);
		if (emitter) {
			return emitter;
		}

		emitter = new Emitter({
			onLastListenerRemove: () => {
				emitter?.dispose();
				this._rendererMessageEmitters.delete(rendererId);
			}
		});

		this._rendererMessageEmitters.set(rendererId, emitter);

		return emitter;
	}
}
