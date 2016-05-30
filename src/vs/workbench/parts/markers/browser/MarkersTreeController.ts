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
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import { Marker } from 'vs/workbench/parts/markers/common/MarkersModel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import { IMarker } from 'vs/platform/markers/common/markers';

export class Controller extends treedefaults.DefaultController {

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
				@ICodeEditorService private codeEditorService: ICodeEditorService) {
		super({ clickBehavior: treedefaults.ClickBehavior.ON_MOUSE_UP });
		this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_UP_ARROW, this.onUp.bind(this));
		this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_DOWN_ARROW, this.onDown.bind(this));
		this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_PAGE_UP, this.onPageUp.bind(this));
		this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_PAGE_DOWN, this.onPageDown.bind(this));
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: mouse.IMouseEvent): boolean {
		if (this.openFileAtElement(element)) {
			return true;
		}
		return super.onLeftClick(tree, element, event);
	}

	protected onEnter(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		super.onEnter(tree, event);
		this.openFileAtElement(tree.getFocus());
		return true;
	}

	private openFileAtElement(element: any) {
		if (element instanceof Marker) {
			let marker = <IMarker>element.marker;
			this.editorService.openEditor({
				resource: marker.resource,
				options: {
					selection: {
						startLineNumber: marker.startLineNumber,
						startColumn: marker.startColumn,
						endLineNumber: marker.endLineNumber,
						endColumn: marker.endColumn
					}
				}
			}).done(null, errors.onUnexpectedError);
			return true;
		}
		return false;
	}

	public _preview(element: any): void {
		if (element instanceof Marker) {
			let marker = <IMarker>element.marker;
			const editors = this.codeEditorService.listCodeEditors();
			let editor: ICommonCodeEditor;
			for (let candidate of editors) {
				if (!candidate.getModel()
					|| candidate.getModel().getAssociatedResource().toString() !== marker.resource.toString()) {

					continue;
				}

				if (!editor || this.editorService.getActiveEditor()
					&& candidate === this.editorService.getActiveEditor().getControl()) {

					editor = candidate;
				}
			}

			if (editor) {
				editor.revealRangeInCenter(marker);
			}
		}
	}
}
