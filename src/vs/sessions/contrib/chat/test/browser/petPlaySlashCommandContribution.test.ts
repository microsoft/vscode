/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { CHAT_PET_TAUGHT_MOVES_COMMAND_ID, ChatPetMovePoses } from '../../../../../workbench/contrib/chat/browser/chatPetMoves.js';
import { ChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ChatSubmitRequestHandlerService } from '../../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js';
import { IChatPetWidgetService } from '../../../../../workbench/contrib/chat/browser/widget/chatPetWidgetService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { PetPlaySlashCommandContribution } from '../../browser/petPlaySlashCommand.contribution.js';

suite('PetPlaySlashCommandContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('plays moves the pet knows, taught or built in, without the agent, and sends other names on to it', async () => {
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		chatPetService.toggle();
		chatPetService.learnMove({ name: 'yes-sir', about: '', loop: false, still: undefined, colors: {}, fixed: '', frames: [{ durationMs: 100, rows: ChatPetMovePoses.idle }] });
		const widget = new class extends mock<IChatWidget>() { }();
		const played: { name: string; inCallingChat: boolean }[] = [];
		const commands: string[] = [];
		const submitRequestHandlerService = new ChatSubmitRequestHandlerService();
		disposables.add(new PetPlaySlashCommandContribution(
			submitRequestHandlerService,
			chatPetService,
			new class extends mock<IChatPetWidgetService>() {
				override playReaction(name: string, owner?: object): boolean {
					played.push({ name, inCallingChat: owner === widget });
					return true;
				}
			}(),
			new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource(): IChatWidget | undefined {
					return widget;
				}
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand<R>(id: string): Promise<R | undefined> {
					commands.push(id);
					return undefined;
				}
			}(),
		));
		const handles = (input: string) => submitRequestHandlerService.tryHandle({ sessionResource: URI.parse('agent-host-copilotcli:/session'), input });

		const handled = {
			taught: await handles('/pet-play YES SIR!'),
			builtInMove: await handles('/pet-play Cowboy'),
			builtInReaction: await handles('/pet-play love'),
			// Names the pet doesn't know, the /pet skill and other messages go to the agent.
			unknown: await handles('/pet-play the salute one'),
			teach: await handles('/pet play yes sir'),
			message: await handles('play yes sir'),
			list: await handles('/pet-play'),
		};
		chatPetService.toggle();
		// A hidden pet can't play: the agent tells the user how to show it.
		const hidden = await handles('/pet-play yes sir');

		assert.deepStrictEqual({ handled, hidden, played, commands }, {
			handled: { taught: true, builtInMove: true, builtInReaction: true, unknown: false, teach: false, message: false, list: true },
			hidden: false,
			played: [{ name: 'yes-sir', inCallingChat: true }, { name: 'cowboy', inCallingChat: true }, { name: 'love', inCallingChat: true }],
			commands: [CHAT_PET_TAUGHT_MOVES_COMMAND_ID],
		});
	});
});
