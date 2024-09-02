/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';

export class EditContextState {

	constructor(
		public readonly content: string,
		public readonly selectionStartOffset: number,
		public readonly selectionEndOffset: number,
		public readonly contentStartPosition: Position
	) { }

	equals(other: EditContextState): boolean {
		return (
			this.content === other.content
			&& this.selectionStartOffset === other.selectionStartOffset
			&& this.selectionEndOffset === other.selectionEndOffset
			&& this.contentStartPosition.equals(other.contentStartPosition)
		);
	}
}

export function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}
