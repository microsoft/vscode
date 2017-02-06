/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notabstitle';
import errors = require('vs/base/common/errors');
import { IEditorGroup, toResource } from 'vs/workbench/common/editor';
import DOM = require('vs/base/browser/dom');
import { TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { EditorLabel } from 'vs/workbench/browser/labels';

export class NoTabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement;
	private editorLabel: EditorLabel;

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.editorActionsToolbar.context = { group };
	}

	public create(parent: HTMLElement): void {
		super.create(parent);

		this.titleContainer = parent;

		// Pin on double click
		this.toDispose.push(DOM.addDisposableListener(this.titleContainer, DOM.EventType.DBLCLICK, (e: MouseEvent) => this.onTitleDoubleClick(e)));

		// Detect mouse click
		this.toDispose.push(DOM.addDisposableListener(this.titleContainer, DOM.EventType.CLICK, (e: MouseEvent) => this.onTitleClick(e)));

		// Editor Label
		this.editorLabel = this.instantiationService.createInstance(EditorLabel, this.titleContainer, void 0);
		this.toDispose.push(this.editorLabel);
		this.toDispose.push(DOM.addDisposableListener(this.editorLabel.labelElement, DOM.EventType.CLICK, (e: MouseEvent) => this.onTitleLabelClick(e)));
		this.toDispose.push(DOM.addDisposableListener(this.editorLabel.descriptionElement, DOM.EventType.CLICK, (e: MouseEvent) => this.onTitleLabelClick(e)));

		// Right Actions Container
		const actionsContainer = document.createElement('div');
		DOM.addClass(actionsContainer, 'title-actions');
		this.titleContainer.appendChild(actionsContainer);

		// Editor actions toolbar
		this.createEditorActionsToolBar(actionsContainer);

		// Context Menu
		this.toDispose.push(DOM.addDisposableListener(this.titleContainer, DOM.EventType.CONTEXT_MENU, (e: Event) => this.onContextMenu({ group: this.context, editor: this.context.activeEditor }, e, this.titleContainer)));
	}

	private onTitleLabelClick(e: MouseEvent): void {
		DOM.EventHelper.stop(e, false);
		if (!this.dragged) {
			setTimeout(() => this.quickOpenService.show()); // delayed to let the onTitleClick() come first which can cause a focus change which can close quick open
		}
	}

	private onTitleDoubleClick(e: MouseEvent): void {
		DOM.EventHelper.stop(e);
		if (!this.context) {
			return;
		}

		const group = this.context;

		this.editorGroupService.pinEditor(group, group.activeEditor);
	}

	private onTitleClick(e: MouseEvent): void {
		if (!this.context) {
			return;
		}

		const group = this.context;
		const position = this.stacks.positionOfGroup(group);

		// Close editor on middle mouse click
		if (e.button === 1 /* Middle Button */) {
			this.editorService.closeEditor(position, group.activeEditor).done(null, errors.onUnexpectedError);
		}

		// Focus editor group unless click on toolbar
		else if (this.stacks.groups.length === 1 && !DOM.isAncestor((e.target || e.srcElement) as HTMLElement, this.editorActionsToolbar.getContainer().getHTMLElement())) {
			this.editorGroupService.focusGroup(group);
		}
	}

	protected doRefresh(): void {
		const group = this.context;
		const editor = group && group.activeEditor;
		if (!editor) {
			this.editorLabel.clear();
			this.clearEditorActionsToolbar();

			return; // return early if we are being closed
		}

		const isPinned = group.isPinned(group.activeEditor);
		const isActive = this.stacks.isActive(group);

		// Activity state
		if (isActive) {
			DOM.addClass(this.titleContainer, 'active');
		} else {
			DOM.removeClass(this.titleContainer, 'active');
		}

		// Dirty state
		if (editor.isDirty()) {
			DOM.addClass(this.titleContainer, 'dirty');
		} else {
			DOM.removeClass(this.titleContainer, 'dirty');
		}

		// Editor Label
		const resource = toResource(editor, { supportSideBySide: true });
		const name = editor.getName() || '';
		const description = isActive ? (editor.getDescription() || '') : '';
		let verboseDescription = editor.getDescription(true) || '';
		if (description === verboseDescription) {
			verboseDescription = ''; // dont repeat what is already shown
		}

		this.editorLabel.setLabel({ name, description, resource }, { title: verboseDescription, italic: !isPinned, extraClasses: ['title-label'] });

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();
	}
}