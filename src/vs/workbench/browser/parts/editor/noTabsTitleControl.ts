/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notabstitle';
import errors = require('vs/base/common/errors');
import {IEditorGroup} from 'vs/workbench/common/editor';
import DOM = require('vs/base/browser/dom');
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';

export class NoTabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement;
	private titleLabel: HTMLElement;
	private titleDecoration: HTMLElement;
	private titleDescription: HTMLElement;

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
		this.toDispose.push(DOM.addDisposableListener(this.titleContainer, DOM.EventType.MOUSE_UP, (e: MouseEvent) => this.onTitleClick(e)));

		// Left Title Decoration
		this.titleDecoration = document.createElement('div');
		DOM.addClass(this.titleDecoration, 'title-decoration');
		this.titleContainer.appendChild(this.titleDecoration);

		// Left Title Label & Description
		const labelContainer = document.createElement('div');
		DOM.addClass(labelContainer, 'title-label');

		this.titleLabel = document.createElement('a');
		labelContainer.appendChild(this.titleLabel);

		this.titleDescription = document.createElement('span');
		labelContainer.appendChild(this.titleDescription);

		// Detect title label & description click
		this.toDispose.push(DOM.addDisposableListener(this.titleLabel, DOM.EventType.CLICK, (e: MouseEvent) => this.onTitleLabelClick(e)));
		this.toDispose.push(DOM.addDisposableListener(this.titleDescription, DOM.EventType.CLICK, (e: MouseEvent) => this.onTitleLabelClick(e)));

		this.titleContainer.appendChild(labelContainer);

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
			this.quickOpenService.show();
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
		DOM.EventHelper.stop(e, false);
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
		else if (this.stacks.groups.length === 1 && !DOM.isAncestor(<any>e.target || e.srcElement, this.editorActionsToolbar.getContainer().getHTMLElement())) {
			this.editorGroupService.focusGroup(group);
		}
	}

	protected doRefresh(): void {
		const group = this.context;
		const editor = group && group.activeEditor;
		if (!editor) {
			this.titleLabel.innerText = '';
			this.titleDescription.innerText = '';

			this.clearEditorActionsToolbar();

			return; // return early if we are being closed
		}

		const isPinned = group.isPinned(group.activeEditor);
		const isActive = this.stacks.isActive(group);

		// Pinned state
		if (isPinned) {
			DOM.addClass(this.titleContainer, 'pinned');
		} else {
			DOM.removeClass(this.titleContainer, 'pinned');
		}

		// Activity state
		if (isActive) {
			DOM.addClass(this.titleContainer, 'active');
		} else {
			DOM.removeClass(this.titleContainer, 'active');
		}

		// Editor Title
		const name = editor.getName() || '';
		const description = isActive ? (editor.getDescription() || '') : '';
		let verboseDescription = editor.getDescription(true) || '';
		if (description === verboseDescription) {
			verboseDescription = ''; // dont repeat what is already shown
		}

		this.titleLabel.innerText = name;
		this.titleLabel.title = verboseDescription;

		this.titleDescription.innerText = description;
		this.titleDescription.title = verboseDescription;

		// Editor Decoration
		if (editor.isDirty()) {
			DOM.addClass(this.titleDecoration, 'dirty');
		} else {
			DOM.removeClass(this.titleDecoration, 'dirty');
		}

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();
	}
}