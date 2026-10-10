/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, matchesChatPhoneInputTarget } from '../../browser/mobile/mobileChatPhoneInputTarget.js';

const uriIdentityService = { extUri: extUriBiasedIgnorePathCase };

function session(providerId: string, sessionId: string, chatResource: string): IActiveSession {
	return {
		providerId,
		sessionId,
		sessionType: 'test',
		activeChat: observableValue<IChat>('activeChat', { resource: URI.parse(chatResource) } as IChat),
		modelId: observableValue<string | undefined>('modelId', undefined),
	} as unknown as IActiveSession;
}

suite('MobileChatPhoneInputTarget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches only the captured provider, session, and active chat', () => {
		const original = session('provider', 'session', 'chat:/one');
		const target = createChatPhoneInputTarget(createChatPhoneInputSessionContext(original), uriIdentityService);

		assert.deepStrictEqual({
			same: matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(original), uriIdentityService),
			equivalentChat: matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(session('provider', 'session', 'chat:/ONE')), uriIdentityService),
			providerChanged: matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(session('other', 'session', 'chat:/one')), uriIdentityService),
			sessionChanged: matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(session('provider', 'other', 'chat:/one')), uriIdentityService),
			chatChanged: matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(session('provider', 'session', 'chat:/two')), uriIdentityService),
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
			sessionAppeared: matchesChatPhoneInputTarget(undefined, createChatPhoneInputSessionContext(session('provider', 'session', 'chat:/one')), uriIdentityService),
		}, {
			stillAbsent: true,
			sessionAppeared: false,
		});
	});
});
