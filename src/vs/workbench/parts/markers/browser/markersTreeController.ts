/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as errors from 'vs/base/common/errors';
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import tree = require('vs/base/parts/tree/browser/tree');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import { MarkersModel, Marker } from 'vs/workbench/parts/markers/common/markersModel';
import { RangeHighlightDecorations } from 'vs/workbench/common/editor/rangeDecorations';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class Controller extends treedefaults.DefaultController {

	constructor(private rangeHighlightDecorations: RangeHighlightDecorations, @IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super();
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: mouse.IMouseEvent): boolean {
		let currentFoucssed = tree.getFocus();
		if (super.onLeftClick(tree, element, event)) {
			if (this.openFileAtElement(element, event.detail !== 2, event.ctrlKey || event.metaKey, event.detail === 2)) {
				return true;
			}
			if (element instanceof MarkersModel) {
				if (currentFoucssed) {
					tree.setFocus(currentFoucssed);
				} else {
					tree.focusFirst();
				}
				return true;
			}
		}
		return false;
	}

	protected onEnter(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		if (super.onEnter(tree, event)) {
			return this.openFileAtElement(tree.getFocus(), false, event.ctrlKey || event.metaKey, true);
		}
		return false;
	}

	protected onSpace(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		let element = tree.getFocus();
		if (element instanceof Marker) {
			tree.setSelection([element]);
			return this.openFileAtElement(tree.getFocus(), true, false, false);
		} else {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return super.onSpace(tree, event);
	}

	private openFileAtElement(element: any, preserveFocus: boolean, sideByside: boolean, pinned: boolean): boolean {
		if (element instanceof Marker) {
			const marker: Marker = element;
			this.telemetryService.publicLog('problems.marker.opened', { source: marker.marker.source });
			this.editorService.openEditor({
				resource: marker.resource,
				options: {
					selection: marker.range,
					preserveFocus,
					pinned,
					revealIfVisible: true
				},
			}, sideByside).done((editor) => {
				if (preserveFocus) {
					this.rangeHighlightDecorations.highlightRange(marker, editor);
				} else {
					this.rangeHighlightDecorations.removeHighlightRange();
				}
			}, errors.onUnexpectedError);
			return true;
		} else {
			this.rangeHighlightDecorations.removeHighlightRange();
		}
		return false;
	}
}