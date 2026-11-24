/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatPhoneInputSessionContext } from '../../chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';

export interface IChatPhoneInputTarget {
	readonly providerId: string;
	readonly sessionId: string;
	readonly chatResourceKey: string;
}

/** The phone input context of `chat` of `session`, the chat its host shows. */
export function createChatPhoneInputSessionContext(session: Pick<ISession, 'providerId' | 'sessionId' | 'sessionType'> | undefined, chat: Pick<IChat, 'resource' | 'modelId'> | undefined): IChatPhoneInputSessionContext | undefined {
	return session && chat ? {
		providerId: session.providerId,
		sessionId: session.sessionId,
		sessionType: session.sessionType,
		chatResource: chat.resource,
		modelId: chat.modelId.get(),
	} : undefined;
}

export function createChatPhoneInputTarget(session: IChatPhoneInputSessionContext | undefined, uriIdentityService: Pick<IUriIdentityService, 'extUri'>): IChatPhoneInputTarget | undefined {
	return session ? {
		providerId: session.providerId,
		sessionId: session.sessionId,
		chatResourceKey: uriIdentityService.extUri.getComparisonKey(session.chatResource),
	} : undefined;
}

export function matchesChatPhoneInputTarget(
	target: IChatPhoneInputTarget | undefined,
	session: IChatPhoneInputSessionContext | undefined,
	uriIdentityService: Pick<IUriIdentityService, 'extUri'>,
): boolean {
	return target === undefined ? session === undefined : !!session
		&& session.providerId === target.providerId
		&& session.sessionId === target.sessionId
		&& uriIdentityService.extUri.getComparisonKey(session.chatResource) === target.chatResourceKey;
}
