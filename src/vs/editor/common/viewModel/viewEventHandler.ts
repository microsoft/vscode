/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EventEmitter = require('vs/base/common/eventEmitter');
import EditorCommon = require('vs/editor/common/editorCommon');

export class ViewEventHandler {

	public shouldRender:boolean;

	constructor() {
		this.shouldRender = true;
	}

	// --- begin event handlers

	public onLineMappingChanged(): boolean {
		return false;
	}
	public onModelFlushed(): boolean {
		return false;
	}
	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onModelLinesDeleted(e:EditorCommon.IViewLinesDeletedEvent): boolean {
		return false;
	}
	public onModelLineChanged(e:EditorCommon.IViewLineChangedEvent): boolean {
		return false;
	}
	public onModelLinesInserted(e:EditorCommon.IViewLinesInsertedEvent): boolean {
		return false;
	}
	public onModelTokensChanged(e:EditorCommon.IViewTokensChangedEvent): boolean {
		return false;
	}
	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:EditorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onCursorLineScroll(e:EditorCommon.IViewLineScrollEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		return false;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		return false;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return false;
	}
	public onZonesChanged(): boolean {
		return false;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return false;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}
	public onViewFocusChanged(isFocused:boolean): boolean {
		return false;
	}

	// --- end event handlers

	public handleEvents(events:EventEmitter.IEmitterEvent[]): void {
		var i:number,
			len:number,
			e:EventEmitter.IEmitterEvent,
			data:any;

		for (i = 0, len = events.length; i < len; i++) {
			e = events[i];
			data = e.getData();

			switch (e.getType()) {

				case EditorCommon.ViewEventNames.LineMappingChangedEvent:
					this.shouldRender = this.onLineMappingChanged() || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.ModelFlushedEvent:
					this.shouldRender = this.onModelFlushed() || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.LinesDeletedEvent:
					this.shouldRender = this.onModelLinesDeleted(<EditorCommon.IViewLinesDeletedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.LinesInsertedEvent:
					this.shouldRender = this.onModelLinesInserted(<EditorCommon.IViewLinesInsertedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.LineChangedEvent:
					this.shouldRender = this.onModelLineChanged(<EditorCommon.IViewLineChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.TokensChangedEvent:
					this.shouldRender = this.onModelTokensChanged(<EditorCommon.IViewTokensChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.DecorationsChangedEvent:
					this.shouldRender = this.onModelDecorationsChanged(<EditorCommon.IViewDecorationsChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.CursorPositionChangedEvent:
					this.shouldRender = this.onCursorPositionChanged(<EditorCommon.IViewCursorPositionChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.CursorSelectionChangedEvent:
					this.shouldRender = this.onCursorSelectionChanged(<EditorCommon.IViewCursorSelectionChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.RevealRangeEvent:
					this.shouldRender = this.onCursorRevealRange(<EditorCommon.IViewRevealRangeEvent>data) || this.shouldRender;
					break;

				case EditorCommon.ViewEventNames.LineScrollEvent:
					this.shouldRender = this.onCursorLineScroll(<EditorCommon.IViewLineScrollEvent>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ConfigurationChanged:
					this.shouldRender = this.onConfigurationChanged(<EditorCommon.IConfigurationChangedEvent>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewLayoutChanged:
					this.shouldRender = this.onLayoutChanged(<EditorCommon.IEditorLayoutInfo>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewScrollChanged:
					this.shouldRender = this.onScrollChanged(<EditorCommon.IScrollEvent>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewZonesChanged:
					this.shouldRender = this.onZonesChanged() || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewScrollWidthChanged:
					this.shouldRender = this.onScrollWidthChanged(<number>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewScrollHeightChanged:
					this.shouldRender = this.onScrollHeightChanged(<number>data) || this.shouldRender;
					break;

				case EditorCommon.EventType.ViewFocusChanged:
					this.shouldRender = this.onViewFocusChanged(<boolean>data) || this.shouldRender;
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}
	}
}