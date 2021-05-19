/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { ExtHostNotebookRenderersShape, IMainContext, MainContext, MainThreadNotebookRenderersShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import * as vscode from 'vscode';

export class ExtHostNotebookRenderers implements ExtHostNotebookRenderersShape {
	private readonly _rendererMessageEmitters = new Map<string /* rendererId */, Emitter<{ document: vscode.NotebookEditor, data: any }>>();
	private readonly proxy: MainThreadNotebookRenderersShape;

	constructor(mainContext: IMainContext, private readonly _extHostNotebook: ExtHostNotebookController) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadNotebookRenderers);
	}

	$postRendererMessage(editorId: string, rendererId: string, message: unknown): void {
		const editor = this._extHostNotebook.getEditorById(editorId);
		if (!editor) {
			return;
		}

		this._rendererMessageEmitters.get(rendererId)?.fire({ document: editor.apiEditor, data: message });
	}

	public createRendererMessaging<TSend, TRecv>(rendererId: string): vscode.NotebookRendererMessaging<TSend, TRecv> {
		const emitter = this.getOrCreateEmitterFor(rendererId);
		const listener = emitter.event(e => messaging.messageHandler?.(e.document, e.data));
		const messaging: vscode.NotebookRendererMessaging<TSend, TRecv> = {
			dispose: () => listener.dispose(),
			postMessage: message => this.proxy.$postMessage(rendererId, message),
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
