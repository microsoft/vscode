/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IEditorAriaOptions } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';

export abstract class AbstractEditContext extends ViewPart {
	abstract isFocused(): boolean;
	abstract appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void;
	abstract writeScreenReaderContent(reason: string): void;
	abstract focusTextArea(): void;
	abstract refreshFocusState(): void;
	abstract setAriaOptions(options: IEditorAriaOptions): void;
}
