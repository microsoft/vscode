/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookRendererMessagingService, IScopedRendererMessaging } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

type MessageToSend = { editorId: string; rendererId: string; message: unknown };

export class NotebookRendererMessagingService extends Disposable implements INotebookRendererMessagingService {
	declare _serviceBrand: undefined;
	/**
	 * Activation promises. Maps renderer IDs to a queue of messages that should
	 * be sent once activation finishes, or undefined if activation is complete.
	 */
	private readonly activations = new Map<string /* rendererId */, undefined | MessageToSend[]>();
	private readonly scopedMessaging = new Map</* editorId */ string, IScopedRendererMessaging>();
	private readonly postMessageEmitter = this._register(new Emitter<MessageToSend>());
	public readonly onShouldPostMessage = this.postMessageEmitter.event;

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();
	}

	/** @inheritdoc */
	public receiveMessage(editorId: string | undefined, rendererId: string, message: unknown): Promise<boolean> {
		if (editorId === undefined) {
			const sends = [...this.scopedMessaging.values()].map(e => e.receiveMessageHandler?.(rendererId, message));
			return Promise.all(sends).then(s => s.some(s => !!s));
		}

		return this.scopedMessaging.get(editorId)?.receiveMessageHandler?.(rendererId, message) ?? Promise.resolve(false);
	}

	/** @inheritdoc */
	public prepare(rendererId: string) {
		if (this.activations.has(rendererId)) {
			return;
		}

		const queue: MessageToSend[] = [];
		this.activations.set(rendererId, queue);

		this.extensionService.activateByEvent(`onRenderer:${rendererId}`).then(() => {
			for (const message of queue) {
				this.postMessageEmitter.fire(message);
			}

			this.activations.set(rendererId, undefined);
		});
	}

	/** @inheritdoc */
	public getScoped(editorId: string): IScopedRendererMessaging {
		const existing = this.scopedMessaging.get(editorId);
		if (existing) {
			return existing;
		}

		const messaging: IScopedRendererMessaging = {
			postMessage: (rendererId, message) => this.postMessage(editorId, rendererId, message),
			dispose: () => this.scopedMessaging.delete(editorId),
		};

		this.scopedMessaging.set(editorId, messaging);
		return messaging;
	}

	private postMessage(editorId: string, rendererId: string, message: unknown): void {
		if (!this.activations.has(rendererId)) {
			this.prepare(rendererId);
		}

		const activation = this.activations.get(rendererId);
		const toSend = { rendererId, editorId, message };
		if (activation === undefined) {
			this.postMessageEmitter.fire(toSend);
		} else {
			activation.push(toSend);
		}
	}
}
