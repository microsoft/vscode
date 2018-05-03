/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextNoTabsTitleControl';
import { toResource } from 'vs/workbench/common/editor';
import { NextTitleControl } from 'vs/workbench/browser/parts/editor2/nextTitleControl';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { Verbosity } from 'vs/platform/editor/common/editor';
import { TAB_ACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { EventType as TouchEventType, GestureEvent, Gesture } from 'vs/base/browser/touch';
import { addDisposableListener, EventType, addClass, EventHelper, removeClass } from 'vs/base/browser/dom';

export class NextNoTabsTitleControl extends NextTitleControl {
	private titleContainer: HTMLElement;
	private editorLabel: ResourceLabel;

	protected doCreate(parent: HTMLElement): void {
		this.titleContainer = parent;

		// Gesture Support
		Gesture.addTarget(this.titleContainer);

		// Pin on double click
		this._register(addDisposableListener(this.titleContainer, EventType.DBLCLICK, (e: MouseEvent) => this.onTitleDoubleClick(e)));

		// Detect mouse click
		this._register(addDisposableListener(this.titleContainer, EventType.CLICK, (e: MouseEvent) => this.onTitleClick(e)));

		// Detect touch
		this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, (e: GestureEvent) => this.onTitleClick(e)));

		// Editor Label
		this.editorLabel = this._register(this.instantiationService.createInstance(ResourceLabel, this.titleContainer, void 0));
		this._register(this.editorLabel.onClick(e => this.onTitleLabelClick(e)));

		// Right Actions Container
		const actionsContainer = document.createElement('div');
		addClass(actionsContainer, 'title-actions');
		this.titleContainer.appendChild(actionsContainer);

		// Editor actions toolbar
		this.createEditorActionsToolBar(actionsContainer);

		// Context Menu
		this._register(addDisposableListener(this.titleContainer, EventType.CONTEXT_MENU, (e: Event) => this.onContextMenu(this.group.activeEditor, e, this.titleContainer)));
		this._register(addDisposableListener(this.titleContainer, TouchEventType.Contextmenu, (e: Event) => this.onContextMenu(this.group.activeEditor, e, this.titleContainer)));
	}

	private onTitleLabelClick(e: MouseEvent): void {
		EventHelper.stop(e, false);

		// delayed to let the onTitleClick() come first which can cause a focus change which can close quick open
		setTimeout(() => this.quickOpenService.show());
	}

	private onTitleDoubleClick(e: MouseEvent): void {
		EventHelper.stop(e);

		this.group.pinEditor();
	}

	private onTitleClick(e: MouseEvent | GestureEvent): void {

		// Close editor on middle mouse click
		if (e instanceof MouseEvent && e.button === 1 /* Middle Button */) {
			this.closeOneEditorAction.run({ groupId: this.group.id, editorIndex: this.group.getIndexOfEditor(this.group.activeEditor) });
		}
	}

	protected doRefresh(): void {
		const editor = this.group.activeEditor;
		if (!editor) {
			this.editorLabel.clear();
			this.clearEditorActionsToolbar();

			return;
		}

		const isEditorPinned = this.group.isPinned(this.group.activeEditor);
		const isGroupActive = this.group.active;

		// Dirty state
		if (editor.isDirty()) {
			addClass(this.titleContainer, 'dirty');
		} else {
			removeClass(this.titleContainer, 'dirty');
		}

		// Editor Label
		const resource = toResource(editor, { supportSideBySide: true });
		const name = editor.getName() || '';

		const labelFormat = 'default'; //TODO@grid support tab options (this.editorGroupService.getTabOptions().labelFormat);
		let description: string;
		if (labelFormat === 'default' && !isGroupActive) {
			description = ''; // hide description when group is not active and style is 'default'
		} else {
			description = editor.getDescription(this.getVerbosity(labelFormat)) || '';
		}

		let title = editor.getTitle(Verbosity.LONG);
		if (description === title) {
			title = ''; // dont repeat what is already shown
		}

		this.editorLabel.setLabel({ name, description, resource }, { title, italic: !isEditorPinned, extraClasses: ['title-label'] });
		if (isGroupActive) {
			this.editorLabel.element.style.color = this.getColor(TAB_ACTIVE_FOREGROUND);
		} else {
			this.editorLabel.element.style.color = this.getColor(TAB_UNFOCUSED_ACTIVE_FOREGROUND);
		}

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();
	}

	private getVerbosity(style: string): Verbosity {
		switch (style) {
			case 'short': return Verbosity.SHORT;
			case 'long': return Verbosity.LONG;
			default: return Verbosity.MEDIUM;
		}
	}
}
