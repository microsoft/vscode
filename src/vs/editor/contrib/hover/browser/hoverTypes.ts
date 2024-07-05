/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { BrandedService, IConstructorSignature } from 'vs/platform/instantiation/common/instantiation';

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

	/**
	 * If true, the hover item should appear before content
	 */
	readonly isBeforeContent?: boolean;
	/**
	 * Is this hover part still valid for this new anchor?
	 */
	isValidForHoverAnchor(anchor: HoverAnchor): boolean;
}

export const enum HoverAnchorType {
	Range = 1,
	ForeignElement = 2
}

export class HoverRangeAnchor {
	public readonly type = HoverAnchorType.Range;
	constructor(
		public readonly priority: number,
		public readonly range: Range,
		public readonly initialMousePosX: number | undefined,
		public readonly initialMousePosY: number | undefined,
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
		public readonly range: Range,
		public readonly initialMousePosX: number | undefined,
		public readonly initialMousePosY: number | undefined,
		public readonly supportsMarkerHover: boolean | undefined
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
	addAction(actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }): IEditorHoverAction;
	append(element: HTMLElement): HTMLElement;
}

export interface IEditorHoverAction {
	setEnabled(enabled: boolean): void;
}

export interface IEditorHoverColorPickerWidget {
	layout(): void;
}

export interface IEditorHoverContext {
	/**
	 * The contents rendered inside the fragment have been changed, which means that the hover should relayout.
	 */
	onContentsChanged(): void;
	/**
	 * Set the minimum dimensions of the resizable hover
	 */
	setMinimumDimensions?(dimensions: Dimension): void;
	/**
	 * Hide the hover.
	 */
	hide(): void;
}

export interface IEditorHoverRenderContext extends IEditorHoverContext {
	/**
	 * The fragment where dom elements should be attached.
	 */
	readonly fragment: DocumentFragment;
	/**
	 * The status bar for actions for this hover.
	 */
	readonly statusBar: IEditorHoverStatusBar;
}

export interface IRenderedHoverPart<T extends IHoverPart> extends IDisposable {
	/**
	 * The rendered hover part.
	 */
	hoverPart: T;
	/**
	 * The HTML element containing the hover part.
	 */
	hoverElement: HTMLElement;
}

export interface IRenderedHoverParts<T extends IHoverPart> extends IDisposable {
	/**
	 * Array of rendered hover parts.
	 */
	renderedHoverParts: IRenderedHoverPart<T>[];
}

/**
 * Default implementation of IRenderedHoverParts.
 */
export class RenderedHoverParts<T extends IHoverPart> implements IRenderedHoverParts<T> {

	constructor(public readonly renderedHoverParts: IRenderedHoverPart<T>[]) { }

	dispose() {
		for (const part of this.renderedHoverParts) {
			part.dispose();
		}
	}
}

export interface IEditorHoverParticipant<T extends IHoverPart = IHoverPart> {
	readonly hoverOrdinal: number;
	suggestHoverAnchor?(mouseEvent: IEditorMouseEvent): HoverAnchor | null;
	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): T[];
	computeAsync?(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<T>;
	createLoadingMessage?(anchor: HoverAnchor): T | null;
	renderHoverParts(context: IEditorHoverRenderContext, hoverParts: T[]): IRenderedHoverParts<T>;
	getAccessibleContent(hoverPart: T): string;
	handleResize?(): void;
}

export type IEditorHoverParticipantCtor = IConstructorSignature<IEditorHoverParticipant, [ICodeEditor]>;

export const HoverParticipantRegistry = (new class HoverParticipantRegistry {

	_participants: IEditorHoverParticipantCtor[] = [];

	public register<Services extends BrandedService[]>(ctor: { new(editor: ICodeEditor, ...services: Services): IEditorHoverParticipant }): void {
		this._participants.push(ctor as IEditorHoverParticipantCtor);
	}

	public getAll(): IEditorHoverParticipantCtor[] {
		return this._participants;
	}

}());

export interface IHoverWidget {
	/**
	 * Returns whether the hover widget is shown or should show in the future.
	 * If the widget should show, this triggers the display.
	 * @param mouseEvent editor mouse event
	 */
	showsOrWillShow(mouseEvent: IEditorMouseEvent): boolean;

	/**
	 * Hides the hover.
	 */
	hide(): void;
}
