/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPetAchievementId, ChatPetAchievementIds } from '../../../../../workbench/contrib/chat/browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionsChatPetAchievementContribution } from '../../browser/chatPetAchievements.js';

suite('Sessions - Chat Pet Achievements', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('unlocks Agents window, request, and archive achievements from shared contribution', () => {
		const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
		const onDidArchiveSession = disposables.add(new Emitter<ISession>());
		const attemptedUnlocks: ChatPetAchievementId[] = [];
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidSendRequest = onDidSendRequest.event;
			override readonly onDidArchiveSession = onDidArchiveSession.event;
		}();
		const chatPetService = new class extends mock<IChatPetService>() {
			override unlockAchievement(id: ChatPetAchievementId): boolean {
				attemptedUnlocks.push(id);
				return false;
			}
		}();
		disposables.add(new SessionsChatPetAchievementContribution(sessionsManagementService, chatPetService));

		onDidSendRequest.fire({
			session: undefined!,
			chat: undefined!,
			isNewSession: true,
			isNewChat: true,
			options: {
				query: 'hello',
				attachedContext: [
					{ kind: 'image', id: 'image', name: 'image', value: '' },
				],
			},
		});
		onDidArchiveSession.fire(undefined!);

		assert.deepStrictEqual(attemptedUnlocks, [
			ChatPetAchievementIds.AgentsWindowOpened,
			ChatPetAchievementIds.FirstChatMessage,
			ChatPetAchievementIds.ImageRequest,
			ChatPetAchievementIds.SessionArchived,
		]);
	});
});
