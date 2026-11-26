/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../../base/common/resources.js';
import { IChat } from '../../../../../../services/sessions/common/session.js';
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, matchesChatPhoneInputTarget } from '../../../../browser/chatPhoneInputContext.js';
import { ITestSessionWithChat } from '../../../../test/browser/sessionHostTestUtils.js';

const uriIdentityService = { extUri: extUriBiasedIgnorePathCase };

function session(providerId: string, sessionId: string, chatResource: string): ITestSessionWithChat {
	return {
		providerId,
		sessionId,
		sessionType: 'test',
		activeChat: observableValue<IChat>('activeChat', { resource: URI.parse(chatResource), modelId: observableValue<string | undefined>('modelId', undefined) } as unknown as IChat),
	} as unknown as ITestSessionWithChat;
}

function contextOf(value: ITestSessionWithChat) {
	return createChatPhoneInputSessionContext(value, value.activeChat.get());
}

suite('MobileChatPhoneInputTarget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches only the captured provider, session, and active chat', () => {
		const original = session('provider', 'session', 'chat:/one');
		const target = createChatPhoneInputTarget(contextOf(original), uriIdentityService);

		assert.deepStrictEqual({
			same: matchesChatPhoneInputTarget(target, contextOf(original), uriIdentityService),
			equivalentChat: matchesChatPhoneInputTarget(target, contextOf(session('provider', 'session', 'chat:/ONE')), uriIdentityService),
			providerChanged: matchesChatPhoneInputTarget(target, contextOf(session('other', 'session', 'chat:/one')), uriIdentityService),
			sessionChanged: matchesChatPhoneInputTarget(target, contextOf(session('provider', 'other', 'chat:/one')), uriIdentityService),
			chatChanged: matchesChatPhoneInputTarget(target, contextOf(session('provider', 'session', 'chat:/two')), uriIdentityService),
			missing: matchesChatPhoneInputTarget(target, undefined, uriIdentityService),
		}, {
			same: true,
			equivalentChat: true,
			providerChanged: false,
			sessionChanged: false,
			chatChanged: false,
			missing: false,
		});
	});

	test('an absent target matches only while no session is active', () => {
		assert.deepStrictEqual({
			stillAbsent: matchesChatPhoneInputTarget(undefined, undefined, uriIdentityService),
			sessionAppeared: matchesChatPhoneInputTarget(undefined, contextOf(session('provider', 'session', 'chat:/one')), uriIdentityService),
		}, {
			stillAbsent: true,
			sessionAppeared: false,
		});
	});
});
