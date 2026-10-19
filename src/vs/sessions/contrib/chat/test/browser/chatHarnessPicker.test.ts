/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChat, ISessionCapabilities, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { getChatHarnessChoices } from '../../browser/chatHarnessPicker.js';

suite('ChatHarnessPicker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const main = upcastPartial<IChat>({ resource: URI.parse('test:///session'), status: constObservable(SessionStatus.Completed) });
	const draft = upcastPartial<IChat>({ resource: URI.parse('test:///session#draft'), status: constObservable(SessionStatus.Untitled) });
	const sent = upcastPartial<IChat>({ resource: URI.parse('test:///session#sent'), status: constObservable(SessionStatus.Completed) });

	function session(options: { harnesses?: readonly string[]; activeChat?: IChat; isCreated?: boolean }): IActiveSession {
		const capabilities: ISessionCapabilities = { supportsMultipleChats: true, ...(options.harnesses ? { supportsChatHarnesses: options.harnesses } : {}) };
		return upcastPartial<IActiveSession>({
			harness: 'copilot',
			isCreated: constObservable(options.isCreated ?? true),
			capabilities: constObservable(capabilities),
			mainChat: constObservable(main),
			activeChat: constObservable(options.activeChat ?? draft),
		});
	}

	test('offers the advertised harnesses only for an unsent peer draft of a session offering more than one', () => {
		const presentation = (harness: string) => harness === 'copilot' ? { label: 'Copilot', icon: Codicon.copilot } : undefined;
		const choices = (s: IActiveSession | undefined) => getChatHarnessChoices(s, presentation, undefined).map(choice => [choice.harness, choice.presentation.label]);
		assert.deepStrictEqual({
			offered: choices(session({ harnesses: ['copilot', 'claude'] })),
			notAdvertised: choices(session({})),
			single: choices(session({ harnesses: ['copilot'] })),
			mainChat: choices(session({ harnesses: ['copilot', 'claude'], activeChat: main })),
			sentChat: choices(session({ harnesses: ['copilot', 'claude'], activeChat: sent })),
			newSession: choices(session({ harnesses: ['copilot', 'claude'], isCreated: false })),
			noSession: choices(undefined),
		}, {
			offered: [['copilot', 'Copilot'], ['claude', 'claude']],
			notAdvertised: [],
			single: [],
			mainChat: [],
			sentChat: [],
			newSession: [],
			noSession: [],
		});
	});
});
