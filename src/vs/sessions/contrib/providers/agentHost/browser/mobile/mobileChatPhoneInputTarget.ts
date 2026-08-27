/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatPhoneInputSessionContext } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';

export interface IChatPhoneInputTarget {
	readonly providerId: string;
	readonly sessionId: string;
	readonly chatResourceKey: string;
}

export function createChatPhoneInputSessionContext(session: Pick<IActiveSession, 'providerId' | 'sessionId' | 'sessionType' | 'activeChat' | 'modelId'> | undefined): IChatPhoneInputSessionContext | undefined {
	return session ? {
		providerId: session.providerId,
		sessionId: session.sessionId,
		sessionType: session.sessionType,
		chatResource: session.activeChat.get().resource,
		modelId: session.modelId.get(),
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
