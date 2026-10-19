/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewChatInSessionOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';

class TestNewChatInSessionWidget extends NewChatInSessionWidget {
	send(query: string, background: boolean): Promise<boolean> {
		return this._send(query, undefined, background);
	}
}

suite('NewChatInSessionWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resets the composer to a chat of the main harness after a background send', async () => {
		const draft = upcastPartial<IChat>({ resource: URI.parse('test:///session#draft'), harness: 'other' });
		const session = upcastPartial<IActiveSession>({ harness: 'main', activeChat: constObservable(draft) });
		const resets: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(_session: IActiveSession, options?: ICreateNewChatInSessionOptions): Promise<void> {
					resets.push(options);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async sendRequest(): Promise<void> { }
			}(),
		});

		const sent = await widget.send('hello', true);

		assert.deepStrictEqual({ sent, resets }, { sent: true, resets: [{ forceNew: true }] });
	});
});
