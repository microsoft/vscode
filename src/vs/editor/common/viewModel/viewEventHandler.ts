/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EmitterEvent} from 'vs/base/common/eventEmitter';
import * as editorCommon from 'vs/editor/common/editorCommon';

export class ViewEventHandler {

	private _shouldRender:boolean;

	constructor() {
		this._shouldRender = true;
	}

	public shouldRender(): boolean {
		return this._shouldRender;
	}

	protected setShouldRender(): void {
		this._shouldRender = true;
	}

	public onDidRender(): void {
		this._shouldRender = false;
	}

	// --- begin event handlers

	public onLineMappingChanged(): boolean {
		return false;
	}
	public onModelFlushed(): boolean {
		return false;
	}
	public onModelDecorationsChanged(e:editorCommon.IViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		return false;
	}
	public onModelLineChanged(e:editorCommon.IViewLineChangedEvent): boolean {
		return false;
	}
	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return false;
	}
	public onModelTokensChanged(e:editorCommon.IViewTokensChangedEvent): boolean {
		return false;
	}
	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:editorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onCursorScrollRequest(e:editorCommon.IViewScrollRequestEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		return false;
	}
	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		return false;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return false;
	}
	public onZonesChanged(): boolean {
		return false;
	}
	public onViewFocusChanged(isFocused:boolean): boolean {
		return false;
	}

	// --- end event handlers

	public handleEvents(events:EmitterEvent[]): void {

		let shouldRender = false;

		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			let data = e.getData();

			switch (e.getType()) {

				case editorCommon.ViewEventNames.LineMappingChangedEvent:
					if (this.onLineMappingChanged()) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.ModelFlushedEvent:
					if (this.onModelFlushed()) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.LinesDeletedEvent:
					if (this.onModelLinesDeleted(<editorCommon.IViewLinesDeletedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.LinesInsertedEvent:
					if (this.onModelLinesInserted(<editorCommon.IViewLinesInsertedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.LineChangedEvent:
					if (this.onModelLineChanged(<editorCommon.IViewLineChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.TokensChangedEvent:
					if (this.onModelTokensChanged(<editorCommon.IViewTokensChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.DecorationsChangedEvent:
					if (this.onModelDecorationsChanged(<editorCommon.IViewDecorationsChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.CursorPositionChangedEvent:
					if (this.onCursorPositionChanged(<editorCommon.IViewCursorPositionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.CursorSelectionChangedEvent:
					if (this.onCursorSelectionChanged(<editorCommon.IViewCursorSelectionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.RevealRangeEvent:
					if (this.onCursorRevealRange(<editorCommon.IViewRevealRangeEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.ViewEventNames.ScrollRequestEvent:
					if (this.onCursorScrollRequest(<editorCommon.IViewScrollRequestEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ConfigurationChanged:
					if (this.onConfigurationChanged(<editorCommon.IConfigurationChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ViewLayoutChanged:
					if (this.onLayoutChanged(<editorCommon.EditorLayoutInfo>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ViewScrollChanged:
					if (this.onScrollChanged(<editorCommon.IScrollEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ViewZonesChanged:
					if (this.onZonesChanged()) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ViewFocusChanged:
					if (this.onViewFocusChanged(<boolean>data)) {
						shouldRender = true;
					}
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}

		if (shouldRender) {
			this._shouldRender = true;
		}
	}
}