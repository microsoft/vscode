/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnchorPosition } from 'vs/base/browser/ui/contextview/contextview';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface IHoverDelegateTarget extends IDisposable {
	readonly targetElements: readonly HTMLElement[];
	x?: number;
}

export interface IHoverDelegateOptions {
	text: IMarkdownString | string;
	target: IHoverDelegateTarget | HTMLElement;
	anchorPosition?: AnchorPosition;
}

export interface IHoverDelegate {
	showHover(options: IHoverDelegateOptions): IDisposable | undefined;
	delay: number;
}
