/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../../base/browser/dom.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Event } from '../../../../../../base/common/event.js';
import { IObservable } from '../../../../../../base/common/observable.js';

export enum InlineEditTabAction {
	Jump = 'jump',
	Accept = 'accept',
	Inactive = 'inactive'
}

export class InlineEditClickEvent {
	static create(event: PointerEvent | MouseEvent, alternativeAction: boolean = false) {
		return new InlineEditClickEvent(new StandardMouseEvent(getWindow(event), event), alternativeAction);
	}
	constructor(
		public readonly event: IMouseEvent,
		public readonly alternativeAction: boolean = false
	) { }
}

export interface IInlineEditsView {
	isHovered: IObservable<boolean>;
	minEditorScrollHeight?: IObservable<number>;
	readonly onDidClick: Event<InlineEditClickEvent>;
}

// TODO: Move this out of here as it is also includes ghosttext
export enum InlineCompletionViewKind {
	GhostText = 'ghostText',
	Custom = 'custom',
	SideBySide = 'sideBySide',
	Deletion = 'deletion',
	InsertionInline = 'insertionInline',
	InsertionMultiLine = 'insertionMultiLine',
	WordReplacements = 'wordReplacements',
	LineReplacement = 'lineReplacement',
	Collapsed = 'collapsed',
	JumpTo = 'jumpTo'
}

export class InlineCompletionViewData {

	public longDistanceHintVisible: boolean | undefined = undefined;
	public longDistanceHintDistance: number | undefined = undefined;

	constructor(
		public readonly cursorColumnDistance: number,
		public readonly cursorLineDistance: number,
		public readonly lineCountOriginal: number,
		public readonly lineCountModified: number,
		public readonly characterCountOriginal: number,
		public readonly characterCountModified: number,
		public readonly disjointReplacements: number,
		public readonly sameShapeReplacements?: boolean
	) { }

	setLongDistanceViewData(lineNumber: number, inlineEditLineNumber: number): void {
		this.longDistanceHintVisible = true;
		this.longDistanceHintDistance = Math.abs(inlineEditLineNumber - lineNumber);
	}

	getData() {
		return {
			cursorColumnDistance: this.cursorColumnDistance,
			cursorLineDistance: this.cursorLineDistance,
			lineCountOriginal: this.lineCountOriginal,
			lineCountModified: this.lineCountModified,
			characterCountOriginal: this.characterCountOriginal,
			characterCountModified: this.characterCountModified,
			disjointReplacements: this.disjointReplacements,
			sameShapeReplacements: this.sameShapeReplacements,
			longDistanceHintVisible: this.longDistanceHintVisible,
			longDistanceHintDistance: this.longDistanceHintDistance
		};
	}
}
