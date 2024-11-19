/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';

export const NativeEditContextRegistry = new class NativeEditContextRegistry {

	private _textAreaMapping: Map<string, HTMLTextAreaElement> = new Map();

	registerTextArea(ownerID: string, textArea: HTMLTextAreaElement): IDisposable {
		this._textAreaMapping.set(ownerID, textArea);
		return {
			dispose: () => {
				this._textAreaMapping.delete(ownerID);
			}
		};
	}

	getTextArea(ownerID: string): HTMLTextAreaElement | undefined {
		return this._textAreaMapping.get(ownerID);
	}
};
