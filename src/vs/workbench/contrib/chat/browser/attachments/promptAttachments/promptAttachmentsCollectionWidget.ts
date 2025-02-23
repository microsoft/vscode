/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ResourceLabels } from '../../../../../browser/labels.js';
import { PromptAttachmentWidget } from './promptAttachmentWidget.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatPromptAttachmentsCollection } from '../../chatAttachmentModel/chatPromptAttachmentsCollection.js';

/**
 * Widget for a collection of prompt instructions attachments.
 * See {@linkcode PromptAttachmentWidget}.
 */
export class PromptAttachmentsCollectionWidget extends Disposable {
	/**
	 * List of child instruction attachment widgets.
	 */
	private children: PromptAttachmentWidget[] = [];

	/**
	 * Event that fires when number of attachments change
	 *
	 * See {@linkcode onAttachmentsCountChange}.
	 */
	private _onAttachmentsCountChange = this._register(new Emitter<void>());
	/**
	 * Subscribe to the `onAttachmentsCountChange` event.
	 * @param callback Function to invoke when number of attachments change.
	 */
	public onAttachmentsCountChange(callback: () => unknown): this {
		this._register(this._onAttachmentsCountChange.event(callback));

		return this;
	}

	/**
	 * The parent DOM node this widget was rendered into.
	 */
	private parentNode: HTMLElement | undefined;

	/**
	 * Get all `URI`s of all valid references, including all
	 * the possible references nested inside the children.
	 */
	public get references(): readonly URI[] {
		return this.model.references;
	}

	/**
	 * Get the list of all prompt instruction attachment variables, including all
	 * nested child references of each attachment explicitly attached by user.
	 */
	public get chatAttachments() {
		return this.model.chatAttachments;
	}

	/**
	 * Check if child widget list is empty (no attachments present).
	 */
	public get empty(): boolean {
		return this.children.length === 0;
	}

	constructor(
		private readonly model: ChatPromptAttachmentsCollection,
		private readonly resourceLabels: ResourceLabels,
		@IInstantiationService private readonly initService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.render = this.render.bind(this);

		// when a new attachment model is added, create a new child widget for it
		this.model.onAdd((attachment) => {
			const widget = this.initService.createInstance(
				PromptAttachmentWidget,
				attachment,
				this.resourceLabels,
			);

			// handle the child widget disposal event, removing it from the list
			widget.onDispose(this.handleAttachmentDispose.bind(this, widget));

			// register the new child widget
			this.children.push(widget);

			// if parent node is present - append the wiget to it, otherwise wait
			// until the `render` method will be called
			if (this.parentNode) {
				this.parentNode.appendChild(widget.domNode);
			}

			// fire the event to notify about the change in the number of attachments
			this._onAttachmentsCountChange.fire();
		});
	}

	/**
	 * Handle child widget disposal.
	 * @param widget The child widget that was disposed.
	 */
	public handleAttachmentDispose(widget: PromptAttachmentWidget): this {
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

		if (!this.parentNode) {
			this.logService.warn(
				`${logPrefix} no parent node reference found.`,
			);
		}

		// remove the child widget root node from the DOM
		this.parentNode?.removeChild(widget.domNode);

		// fire the event to notify about the change in the number of attachments
		this._onAttachmentsCountChange.fire();

		return this;
	}

	/**
	 * Render attachments into the provided `parentNode`.
	 *
	 * Note! this method assumes that the provided `parentNode` is cleared by the caller.
	 */
	public render(
		parentNode: HTMLElement,
	): this {
		this.parentNode = parentNode;

		for (const widget of this.children) {
			this.parentNode.appendChild(widget.domNode);
		}

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
