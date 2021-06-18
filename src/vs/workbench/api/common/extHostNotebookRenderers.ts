/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { ExtHostNotebookRenderersShape, IMainContext, MainContext, MainThreadNotebookRenderersShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostNotebookEditor } from 'vs/workbench/api/common/extHostNotebookEditor';
import * as vscode from 'vscode';

export class ExtHostNotebookRenderers implements ExtHostNotebookRenderersShape {
	private readonly _rendererMessageEmitters = new Map<string /* rendererId */, Emitter<vscode.NotebookRendererMessage<any>>>();
	private readonly proxy: MainThreadNotebookRenderersShape;

	constructor(mainContext: IMainContext, private readonly _extHostNotebook: ExtHostNotebookController) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadNotebookRenderers);
	}

	public $postRendererMessage(editorId: string, rendererId: string, message: unknown): void {
		const editor = this._extHostNotebook.getEditorById(editorId);
		this._rendererMessageEmitters.get(rendererId)?.fire({ editor: editor.apiEditor, message });
	}

	public createRendererMessaging<TSend, TRecv>(rendererId: string): vscode.NotebookRendererMessaging<TSend, TRecv> {
		const messaging: vscode.NotebookRendererMessaging<TSend, TRecv> = {
			onDidReceiveMessage: (...args) =>
				this.getOrCreateEmitterFor(rendererId).event(...args),
			postMessage: (editor, message) => {
				const extHostEditor = ExtHostNotebookEditor.apiEditorsToExtHost.get(editor);
				if (!extHostEditor) {
					throw new Error(`The first argument to postMessage() must be a NotebookEditor`);
				}

				this.proxy.$postMessage(extHostEditor.id, rendererId, message);
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
