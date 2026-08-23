/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from '../../../../base/browser/fastDomNode.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Position } from '../../../common/core/position.js';
import { IEditorAriaOptions } from '../../editorBrowser.js';
import { ViewPart } from '../../view/viewPart.js';
import { IClipboardCopyEvent, IClipboardPasteEvent } from './clipboardUtils.js';

export abstract class AbstractEditContext extends ViewPart {
	abstract domNode: FastDomNode<HTMLElement>;
	abstract focus(): void;
	abstract isFocused(): boolean;
	abstract refreshFocusState(): void;
	abstract setAriaOptions(options: IEditorAriaOptions): void;
	abstract getLastRenderData(): Position | null;
	abstract writeScreenReaderContent(reason: string): void;

	// Clipboard events - emitted before the default clipboard handling
	protected readonly _onWillCopy = this._register(new Emitter<IClipboardCopyEvent>());
	public readonly onWillCopy: Event<IClipboardCopyEvent> = this._onWillCopy.event;

	protected readonly _onWillCut = this._register(new Emitter<IClipboardCopyEvent>());
	public readonly onWillCut: Event<IClipboardCopyEvent> = this._onWillCut.event;

	protected readonly _onWillPaste = this._register(new Emitter<IClipboardPasteEvent>());
	public readonly onWillPaste: Event<IClipboardPasteEvent> = this._onWillPaste.event;
}
