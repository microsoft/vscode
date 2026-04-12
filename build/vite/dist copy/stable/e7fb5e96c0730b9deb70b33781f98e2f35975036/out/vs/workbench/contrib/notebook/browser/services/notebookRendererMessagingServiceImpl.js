/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
let NotebookRendererMessagingService = class NotebookRendererMessagingService extends Disposable {
    constructor(extensionService) {
        super();
        this.extensionService = extensionService;
        /**
         * Activation promises. Maps renderer IDs to a queue of messages that should
         * be sent once activation finishes, or undefined if activation is complete.
         */
        this.activations = new Map();
        this.scopedMessaging = new Map();
        this.postMessageEmitter = this._register(new Emitter());
        this.onShouldPostMessage = this.postMessageEmitter.event;
    }
    /** @inheritdoc */
    receiveMessage(editorId, rendererId, message) {
        if (editorId === undefined) {
            const sends = [...this.scopedMessaging.values()].map(e => e.receiveMessageHandler?.(rendererId, message));
            return Promise.all(sends).then(s => s.some(s => !!s));
        }
        return this.scopedMessaging.get(editorId)?.receiveMessageHandler?.(rendererId, message) ?? Promise.resolve(false);
    }
    /** @inheritdoc */
    prepare(rendererId) {
        if (this.activations.has(rendererId)) {
            return;
        }
        const queue = [];
        this.activations.set(rendererId, queue);
        this.extensionService.activateByEvent(`onRenderer:${rendererId}`).then(() => {
            for (const message of queue) {
                this.postMessageEmitter.fire(message);
            }
            this.activations.set(rendererId, undefined);
        });
    }
    /** @inheritdoc */
    getScoped(editorId) {
        const existing = this.scopedMessaging.get(editorId);
        if (existing) {
            return existing;
        }
        const messaging = {
            postMessage: (rendererId, message) => this.postMessage(editorId, rendererId, message),
            dispose: () => this.scopedMessaging.delete(editorId),
        };
        this.scopedMessaging.set(editorId, messaging);
        return messaging;
    }
    postMessage(editorId, rendererId, message) {
        if (!this.activations.has(rendererId)) {
            this.prepare(rendererId);
        }
        const activation = this.activations.get(rendererId);
        const toSend = { rendererId, editorId, message };
        if (activation === undefined) {
            this.postMessageEmitter.fire(toSend);
        }
        else {
            activation.push(toSend);
        }
    }
};
NotebookRendererMessagingService = __decorate([
    __param(0, IExtensionService)
], NotebookRendererMessagingService);
export { NotebookRendererMessagingService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2VJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZUltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUlsRixJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFpQyxTQUFRLFVBQVU7SUFXL0QsWUFDb0IsZ0JBQW9EO1FBRXZFLEtBQUssRUFBRSxDQUFDO1FBRjRCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFWeEU7OztXQUdHO1FBQ2MsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBd0QsQ0FBQztRQUM5RSxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUFtRCxDQUFDO1FBQzdFLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWlCLENBQUMsQ0FBQztRQUNuRSx3QkFBbUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO0lBTXBFLENBQUM7SUFFRCxrQkFBa0I7SUFDWCxjQUFjLENBQUMsUUFBNEIsRUFBRSxVQUFrQixFQUFFLE9BQWdCO1FBQ3ZGLElBQUksUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzVCLE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENB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