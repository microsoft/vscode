/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { IChatModel } from './model/chatModel.js';

const notificationResources = new WeakMap<IChatModel, URI>();

/** Keeps notification navigation separate from the resource that owns an in-flight model. */
export function setChatNotificationResource(model: IChatModel, resource: URI): void {
	notificationResources.set(model, resource);
}

export function getChatNotificationResource(model: IChatModel): URI {
	return notificationResources.get(model) ?? model.sessionResource;
}

export const enum ChatNotificationKind {
	NeedsInput = 'needsInput',
	Idle = 'idle',
}

export function getChatNotificationDedupeKey(sessionResource: URI, kind: ChatNotificationKind): string {
	return `chat-session:${sessionResource.toString()}:${kind}`;
}
