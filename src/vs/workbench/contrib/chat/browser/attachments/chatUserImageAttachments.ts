/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry, isImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/** How the user attached images to a chat input. */
export type ChatImageAttachGesture = 'paste' | 'drop';

export interface IChatUserImageAttachmentEvent {
	/** The chat input that the images were attached to. */
	readonly inputUri: URI;
	/** The images that the gesture attached, none of which were attached before. */
	readonly attachmentIds: readonly string[];
	readonly gesture: ChatImageAttachGesture;
}

export const IChatUserImageAttachmentService = createDecorator<IChatUserImageAttachmentService>('chatUserImageAttachmentService');

/**
 * Reports the images that the user attaches to a chat input by hand, by pasting or dropping them. Images that come back
 * with a draft, the history, an undo or a redo are not reported, nor are images that other features attach.
 */
export interface IChatUserImageAttachmentService {
	readonly _serviceBrand: undefined;

	readonly onDidAttachImages: Event<IChatUserImageAttachmentEvent>;

	/** Called by the paste and drop handlers once the images are attached. */
	didAttachImages(event: IChatUserImageAttachmentEvent): void;
}

/** Returns the ids of the images in `after` that are not in `before`. */
export function getAddedImageIds(before: readonly IChatRequestVariableEntry[], after: readonly IChatRequestVariableEntry[]): string[] {
	const beforeIds = new Set(before.map(entry => entry.id));
	return after.filter(entry => isImageVariableEntry(entry) && !beforeIds.has(entry.id)).map(entry => entry.id);
}

class ChatUserImageAttachmentService extends Disposable implements IChatUserImageAttachmentService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidAttachImages = this._register(new Emitter<IChatUserImageAttachmentEvent>());
	readonly onDidAttachImages = this._onDidAttachImages.event;

	didAttachImages(event: IChatUserImageAttachmentEvent): void {
		if (event.attachmentIds.length) {
			this._onDidAttachImages.fire(event);
		}
	}
}

registerSingleton(IChatUserImageAttachmentService, ChatUserImageAttachmentService, InstantiationType.Delayed);
