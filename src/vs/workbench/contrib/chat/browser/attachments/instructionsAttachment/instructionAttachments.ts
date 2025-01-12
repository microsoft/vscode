/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { InstructionsAttachmentWidget } from './instructionsAttachment.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatInstructionAttachmentsModel } from '../../chatAttachmentModel/chatInstructionAttachmentsModel.js';

/**
 * Widget fot a collection of prompt instructions attachments.
 * See {@linkcode InstructionsAttachmentWidget}.
 */
export class InstructionAttachmentsWidget extends Disposable {
	/**
	 * The root DOM node of the widget.
	 */
	public readonly domNode: HTMLElement;

	/**
	 * List of child instruction attachment widgets.
	 */
	private children: InstructionsAttachmentWidget[] = [];

	/**
	 * Get all `URI`s of all valid references, including all
	 * the possible references nested inside the children.
	 */
	public get references(): readonly URI[] {
		return this.model.references;
	}

	/**
	 * Check if child widget list is empty (no attachments present).
	 */
	public get empty(): boolean {
		return this.children.length === 0;
	}

	constructor(
		private readonly model: ChatInstructionAttachmentsModel,
		private readonly resourceLabels: ResourceLabels,
		@IInstantiationService private readonly initService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.render = this.render.bind(this);
		this.domNode = dom.$('.chat-prompt-instructions-attachments');

		this._register(this.model.onUpdate(this.render));

		// when a new attachment model is added, create a new child widget for it
		this.model.onAdd((attachment) => {
			const widget = this.initService.createInstance(
				InstructionsAttachmentWidget,
				attachment,
				this.resourceLabels,
			);

			// handle the child widget disposal event, removing it from the list
			widget.onDispose(this.onChildDispose.bind(this, widget));

			// register the new child widget
			this.children.push(widget);
			this.domNode.appendChild(widget.domNode);
			this.render();
		});
	}

	/**
	 * Handle child widget disposal.
	 * @param widget The child widget that was disposed.
	 */
	public onChildDispose(widget: InstructionsAttachmentWidget): this {
		// common prefix for all log messages
		const logPrefix = `[onChildDispose] Widget for instructions attachment '${widget.uri.path}'`;

		// flag to check if the widget was found in the children list
		let widgetExists = false;

		// filter out disposed child widget from the list
		this.children = this.children.filter((child) => {
			if (child === widget) {
				// because we filter out all objects here it might be ok to have multiple of them, but
				// it also highlights a potential issue in our logic somewhere else, so trace a warning here
				if (widgetExists) {
					this.logService.warn(
						`${logPrefix} is present in the children references list multiple times.`,
					);
				}

				widgetExists = true;
				return false;
			}

			return true;
		});

		// no widget was found in the children list, while it might be ok it also
		// highlights a potential issue in our logic, so trace a warning here
		if (!widgetExists) {
			this.logService.warn(
				`${logPrefix} was disposed, but was not found in the child references.`,
			);
		}

		// remove the child widget root node from the DOM
		this.domNode.removeChild(widget.domNode);

		// re-render the whole widget
		return this.render();
	}

	/**
	 * Render this widget.
	 */
	private render(): this {
		// set visibility of the root node based on the presence of attachments
		dom.setVisibility(!this.empty, this.domNode);

		return this;
	}

	/**
	 * Dispose of the widget, including all the child
	 * widget instances.
	 */
	public override dispose(): void {
		for (const child of this.children) {
			child.dispose();
		}

		super.dispose();
	}
}
