/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/colorPickerWidget';

export interface IHoverPart {
	/**
	 * The creator of this hover part.
	 */
	readonly owner: IEditorHoverParticipant;
	/**
	 * The range where this hover part applies.
	 */
	readonly range: Range;
	/**
	 * Force the hover to always be rendered at this specific range,
	 * even in the case of multiple hover parts.
	 */
	readonly forceShowAtRange?: boolean;

	isValidForHoverAnchor(anchor: HoverAnchor): boolean;
}

export interface IEditorHover {
	hide(): void;
	onContentsChanged(): void;
	setColorPicker(widget: ColorPickerWidget): void;
}

export const enum HoverAnchorType {
	Range = 1,
	ForeignElement = 2
}

export class HoverRangeAnchor {
	public readonly type = HoverAnchorType.Range;
	constructor(
		public readonly priority: number,
		public readonly range: Range
	) {
	}
	public equals(other: HoverAnchor) {
		return (other.type === HoverAnchorType.Range && this.range.equalsRange(other.range));
	}
	public canAdoptVisibleHover(lastAnchor: HoverAnchor, showAtPosition: Position): boolean {
		return (lastAnchor.type === HoverAnchorType.Range && showAtPosition.lineNumber === this.range.startLineNumber);
	}
}

export class HoverForeignElementAnchor {
	public readonly type = HoverAnchorType.ForeignElement;
	constructor(
		public readonly priority: number,
		public readonly owner: IEditorHoverParticipant,
		public readonly range: Range
	) {
	}
	public equals(other: HoverAnchor) {
		return (other.type === HoverAnchorType.ForeignElement && this.owner === other.owner);
	}
	public canAdoptVisibleHover(lastAnchor: HoverAnchor, showAtPosition: Position): boolean {
		return (lastAnchor.type === HoverAnchorType.ForeignElement && this.owner === lastAnchor.owner);
	}
}

export type HoverAnchor = HoverRangeAnchor | HoverForeignElementAnchor;

export interface IEditorHoverStatusBar {
	addAction(actionOptions: { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }): IEditorHoverAction;
	append(element: HTMLElement): HTMLElement;
}

export interface IEditorHoverAction {
	setEnabled(enabled: boolean): void;
}

export interface IEditorHoverParticipant<T extends IHoverPart = IHoverPart> {
	suggestHoverAnchor?(mouseEvent: IEditorMouseEvent): HoverAnchor | null;
	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): T[];
	computeAsync?(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<T[]>;
	createLoadingMessage?(anchor: HoverAnchor): T | null;
	renderHoverParts(hoverParts: T[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable;
}
