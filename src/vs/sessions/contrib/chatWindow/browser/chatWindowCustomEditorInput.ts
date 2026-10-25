/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities } from '../../../../workbench/common/editor.js';
import { CustomEditorInput } from '../../../../workbench/contrib/customEditor/browser/customEditorInput.js';
import { IWebviewService } from '../../../../workbench/contrib/webview/browser/webview.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';

/**
 * The editor of a chat window, in a custom editor. It cannot be closed while it is kept in the chat window, and behaves
 * like any other custom editor once it leaves the window, for example when its unsaved changes move to the main window as
 * the chat window closes.
 */
export class ChatWindowCustomEditorInput extends CustomEditorInput {

	static createInput(instantiationService: IInstantiationService, resource: URI, viewType: string): ChatWindowCustomEditorInput {
		return instantiationService.invokeFunction(accessor => {
			const webview = accessor.get(IWebviewService).createWebviewOverlay({
				providedViewType: viewType,
				title: undefined,
				options: {},
				contentOptions: {},
				extension: undefined,
			});
			return instantiationService.createInstance(ChatWindowCustomEditorInput, { resource, viewType, webviewTitle: undefined, preferredName: undefined, iconPath: undefined }, webview, {});
		});
	}

	private _keptIn: IEditorGroup | undefined;

	override get capabilities(): EditorInputCapabilities {
		return this._keptIn ? super.capabilities | EditorInputCapabilities.CannotClose : super.capabilities;
	}

	/** Keeps the editor open in `group` until it is moved out of it or the returned disposable is disposed. */
	keepIn(group: IEditorGroup): IDisposable {
		this._setKeptIn(group);
		const listener = group.onWillMoveEditor(e => {
			if (e.editor === this && e.target !== group.id) {
				this._setKeptIn(undefined);
			}
		});
		return toDisposable(() => {
			listener.dispose();
			if (this._keptIn === group) {
				this._setKeptIn(undefined);
			}
		});
	}

	private _setKeptIn(group: IEditorGroup | undefined): void {
		this._keptIn = group;
		this._onDidChangeCapabilities.fire();
	}
}
