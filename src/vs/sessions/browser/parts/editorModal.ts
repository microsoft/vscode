/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Part } from '../../../workbench/browser/part.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { mark } from '../../../base/common/performance.js';

const MODAL_HEADER_HEIGHT = 32;
const MODAL_SIZE_PERCENTAGE = 0.8;
const MODAL_MIN_WIDTH = 400;
const MODAL_MAX_WIDTH = 1200;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_HEIGHT = 900;

export class EditorModal extends Disposable {

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly overlay: HTMLElement;
	private readonly container: HTMLElement;
	private readonly content: HTMLElement;

	private _visible = false;
	get visible(): boolean { return this._visible; }

	private _workbenchWidth = 0;
	private _workbenchHeight = 0;

	constructor(
		private readonly parentContainer: HTMLElement,
		private readonly editorPart: Part,
		private readonly editorGroupService: IEditorGroupsService
	) {
		super();

		// Create modal structure
		this.overlay = this.createOverlay();
		this.container = this.createContainer();
		this.content = this.createContent();

		// Assemble the modal
		this.container.appendChild(this.content);
		this.overlay.appendChild(this.container);

		// Create and add editor part to modal content
		this.createEditorPart();

		// Register keyboard handler
		this.registerKeyboardHandler();

		// Add to parent
		this.parentContainer.appendChild(this.overlay);
	}

	private createOverlay(): HTMLElement {
		const overlay = $('div.editor-modal-overlay');

		// Create backdrop (clicking closes the modal)
		const backdrop = $('div.editor-modal-backdrop');
		backdrop.addEventListener('click', () => this.close());
		overlay.appendChild(backdrop);

		return overlay;
	}

	private createContainer(): HTMLElement {
		const container = $('div.editor-modal-container');
		container.setAttribute('role', 'dialog');
		container.setAttribute('aria-modal', 'true');

		// Create header with close button
		const header = $('div.editor-modal-header');
		const closeButton = $('button.editor-modal-close-button');
		closeButton.setAttribute('aria-label', 'Close');
		closeButton.title = 'Close (Escape)';
		const closeIcon = $('span');
		closeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		closeButton.appendChild(closeIcon);
		closeButton.addEventListener('click', () => this.close());
		header.appendChild(closeButton);
		container.appendChild(header);

		return container;
	}

	private createContent(): HTMLElement {
		return $('div.editor-modal-content');
	}

	private createEditorPart(): void {
		const editorPartContainer = document.createElement('div');
		editorPartContainer.classList.add('part', 'editor');
		editorPartContainer.id = Parts.EDITOR_PART;
		editorPartContainer.setAttribute('role', 'main');

		mark('code/willCreatePart/workbench.parts.editor');
		this.editorPart.create(editorPartContainer, { restorePreviousState: false });
		mark('code/didCreatePart/workbench.parts.editor');

		this.content.appendChild(editorPartContainer);
	}

	private registerKeyboardHandler(): void {
		mainWindow.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this._visible) {
				this.close();
			}
		});
	}

	show(): void {
		if (this._visible) {
			return;
		}

		this._visible = true;
		this.overlay.classList.add('visible');

		this.doLayout();

		this._onDidChangeVisibility.fire(true);
	}

	hide(): void {
		if (!this._visible) {
			return;
		}

		this._visible = false;
		this.overlay.classList.remove('visible');

		this._onDidChangeVisibility.fire(false);
	}

	close(): void {
		if (!this._visible) {
			return;
		}

		// Close all editors in all groups
		for (const group of this.editorGroupService.groups) {
			group.closeAllEditors();
		}

		// Hide the modal
		this.hide();
	}

	layout(workbenchWidth: number, workbenchHeight: number): void {
		this._workbenchWidth = workbenchWidth;
		this._workbenchHeight = workbenchHeight;

		if (this._visible) {
			this.doLayout();
		}
	}

	private doLayout(): void {
		// Calculate modal dimensions based on workbench size with constraints
		const modalWidth = Math.floor(
			Math.min(MODAL_MAX_WIDTH, Math.max(MODAL_MIN_WIDTH, this._workbenchWidth * MODAL_SIZE_PERCENTAGE))
		);
		const modalHeight = Math.floor(
			Math.min(MODAL_MAX_HEIGHT, Math.max(MODAL_MIN_HEIGHT, this._workbenchHeight * MODAL_SIZE_PERCENTAGE))
		);

		// Set the modal container dimensions
		this.container.style.width = `${modalWidth}px`;
		this.container.style.height = `${modalHeight}px`;

		// Calculate content dimensions (subtract header height)
		const contentWidth = modalWidth;
		const contentHeight = modalHeight - MODAL_HEADER_HEIGHT;

		if (contentWidth > 0 && contentHeight > 0) {
			// Explicitly size the content area
			this.content.style.width = `${contentWidth}px`;
			this.content.style.height = `${contentHeight}px`;

			// Layout the editor part
			this.editorPart.layout(contentWidth, contentHeight, 0, 0);
		}
	}
}
