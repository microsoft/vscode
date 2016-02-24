/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import * as editorCommon from 'vs/editor/common/editorCommon';

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
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		return false;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
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

	public handleEvents(events:IEmitterEvent[]): void {
		var i:number,
			len:number,
			e:IEmitterEvent,
			data:any;

		for (i = 0, len = events.length; i < len; i++) {
			e = events[i];
			data = e.getData();

			switch (e.getType()) {

				case editorCommon.ViewEventNames.LineMappingChangedEvent:
					this.shouldRender = this.onLineMappingChanged() || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.ModelFlushedEvent:
					this.shouldRender = this.onModelFlushed() || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.LinesDeletedEvent:
					this.shouldRender = this.onModelLinesDeleted(<editorCommon.IViewLinesDeletedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.LinesInsertedEvent:
					this.shouldRender = this.onModelLinesInserted(<editorCommon.IViewLinesInsertedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.LineChangedEvent:
					this.shouldRender = this.onModelLineChanged(<editorCommon.IViewLineChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.TokensChangedEvent:
					this.shouldRender = this.onModelTokensChanged(<editorCommon.IViewTokensChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.DecorationsChangedEvent:
					this.shouldRender = this.onModelDecorationsChanged(<editorCommon.IViewDecorationsChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.CursorPositionChangedEvent:
					this.shouldRender = this.onCursorPositionChanged(<editorCommon.IViewCursorPositionChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.CursorSelectionChangedEvent:
					this.shouldRender = this.onCursorSelectionChanged(<editorCommon.IViewCursorSelectionChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.RevealRangeEvent:
					this.shouldRender = this.onCursorRevealRange(<editorCommon.IViewRevealRangeEvent>data) || this.shouldRender;
					break;

				case editorCommon.ViewEventNames.ScrollRequestEvent:
					this.shouldRender = this.onCursorScrollRequest(<editorCommon.IViewScrollRequestEvent>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ConfigurationChanged:
					this.shouldRender = this.onConfigurationChanged(<editorCommon.IConfigurationChangedEvent>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ViewLayoutChanged:
					this.shouldRender = this.onLayoutChanged(<editorCommon.IEditorLayoutInfo>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ViewScrollChanged:
					this.shouldRender = this.onScrollChanged(<editorCommon.IScrollEvent>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ViewZonesChanged:
					this.shouldRender = this.onZonesChanged() || this.shouldRender;
					break;

				case editorCommon.EventType.ViewScrollWidthChanged:
					this.shouldRender = this.onScrollWidthChanged(<number>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ViewScrollHeightChanged:
					this.shouldRender = this.onScrollHeightChanged(<number>data) || this.shouldRender;
					break;

				case editorCommon.EventType.ViewFocusChanged:
					this.shouldRender = this.onViewFocusChanged(<boolean>data) || this.shouldRender;
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}
	}
}