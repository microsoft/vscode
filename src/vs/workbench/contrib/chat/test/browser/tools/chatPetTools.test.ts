/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatPetMovePoses, serializeChatPetMove } from '../../../browser/chatPetMoves.js';
import { ChatPetService } from '../../../browser/chatPetService.js';
import { ChatPetGuideTool, ChatPetGuideToolData, ChatPetTeachTool, ChatPetTeachToolData } from '../../../browser/tools/chatPetTools.js';
import { IChatPetWidgetService } from '../../../browser/widget/chatPetWidgetService.js';
import { IToolInvocation, IToolResult } from '../../../common/tools/languageModelToolsService.js';

const salute = {
	name: 'YES SIR',
	about: 'Salutes with a YES sign.',
	loop: false,
	colors: { Y: '#ffd700' },
	fixed: 'Y',
	frames: [
		{ ms: 120, rows: ChatPetMovePoses.idle.map(row => `${row}..`) },
		{ ms: 400, rows: ChatPetMovePoses.crouch.map((row, index) => `${row}${index < 2 ? 'YY' : '..'}`) },
		{ ms: 120, rows: ChatPetMovePoses.idle.map(row => `${row}..`) },
	],
};

function invocation(parameters: Record<string, unknown>, sessionResource?: URI): IToolInvocation {
	return { callId: 'call', toolId: ChatPetTeachToolData.id, parameters, context: sessionResource ? { sessionResource } : undefined } as IToolInvocation;
}

function resultText(result: IToolResult): string {
	return result.content.map(part => part.kind === 'text' ? part.value : '').join('');
}

suite('ChatPetTools', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTools() {
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		chatPetService.toggle();
		const widget = new class extends mock<IChatWidget>() { }();
		const played: { name: string; owner: object | undefined }[] = [];
		const teach = new ChatPetTeachTool(
			chatPetService,
			new class extends mock<IChatPetWidgetService>() {
				override playReaction(name: string, owner?: object): boolean {
					played.push({ name, owner });
					return true;
				}
			}(),
			new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource(resource: URI): IChatWidget | undefined {
					return resource.toString() === 'agent-host-copilotcli:/session' ? widget : undefined;
				}
			}(),
		);
		return { chatPetService, teach, guide: new ChatPetGuideTool(chatPetService), widget, played };
	}

	test('only offers the tools while the pet is shown and AI features are on', () => {
		assert.deepStrictEqual(
			[ChatPetGuideToolData, ChatPetTeachToolData].map(data => [...data.when?.keys() ?? []].sort()),
			[['chatIsEnabled', 'chatPetEnabled'], ['chatIsEnabled', 'chatPetEnabled']],
		);
	});

	test('sends mistakes back to the agent, then teaches and previews the corrected lesson in the calling chat', async () => {
		const { chatPetService, teach, widget, played } = createTools();
		const session = URI.parse('agent-host-copilotcli:/session');
		const reaction = { when: 'when I tell you to execute on our plan', phrases: ['do it', 'go ahead'], play: 'YES SIR' };

		const invalid = await teach.invoke(invocation({ moves: [{ ...salute, colors: { Y: 'gold' } }], reactions: [reaction] }, session), async () => 0, { report: () => { } }, CancellationToken.None);
		const afterInvalid = { moves: chatPetService.moves.get().length, reactions: chatPetService.reactions.get().length };
		const valid = await teach.invoke(invocation({ moves: [salute], reactions: [reaction] }, session), async () => 0, { report: () => { } }, CancellationToken.None);
		const added = chatPetService.reactions.get()[0];

		assert.deepStrictEqual({
			invalid: [resultText(invalid).split('\n'), invalid.toolResultMessage],
			afterInvalid,
			valid: resultText(valid),
			validMessage: valid.toolResultMessage,
			played: played.map(entry => ({ name: entry.name, inCallingChat: entry.owner === widget })),
		}, {
			invalid: [[
				'Nothing was saved. Fix these mistakes and call teachPet again with the whole corrected lesson:',
				'- Move "yes-sir": "Y=gold" is not a color; use X=#rrggbb, where X is a letter or digit.',
				'- The pet doesn\'t know a move called "yes-sir" yet.',
			], 'The pet couldn\'t learn that yet'],
			afterInvalid: { moves: 0, reactions: 0 },
			valid: [
				'The pet learned:',
				'- Learned yes-sir: plays once (0.6 s)',
				`- New reaction ${added.id}: plays yes-sir when a message contains "do it", "go ahead"`,
				'The user can see and edit all of it in the pet\'s Sprites and Interactions pages (the pet\'s context menu) or as text in pets.md.',
				'It is playing yes-sir now.',
			].join('\n'),
			validMessage: undefined,
			played: [{ name: 'yes-sir', inCallingChat: true }],
		});
	});

	test('teaches pasted moves, forgets and plays', async () => {
		const { chatPetService, teach, played } = createTools();
		const wave = serializeChatPetMove({ name: 'wave', about: '', loop: true, still: undefined, colors: {}, fixed: '', frames: [{ durationMs: 100, rows: ChatPetMovePoses.idle }] });
		await teach.invoke(invocation({ pastedMoves: [wave] }), async () => 0, { report: () => { } }, CancellationToken.None);
		const afterPaste = chatPetService.moves.get().map(move => move.name);
		// Playing teaches nothing, so the chat and the agent hear only what plays.
		const playOnly = { play: 'Wave' };
		const playPrepared = await teach.prepareToolInvocation({ parameters: playOnly, toolCallId: 'call', chatSessionResource: undefined }, CancellationToken.None);
		const playResult = await teach.invoke(invocation(playOnly), async () => 0, { report: () => { } }, CancellationToken.None);
		const unknownPlay = await teach.invoke(invocation({ play: 'moonwalk' }), async () => 0, { report: () => { } }, CancellationToken.None);
		await teach.invoke(invocation({ forgetMoves: ['wave'], play: 'love' }), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			afterPaste,
			play: [playPrepared?.pastTenseMessage, resultText(playResult), unknownPlay.toolResultMessage],
			afterForget: chatPetService.moves.get().map(move => move.name),
			played: played.map(entry => entry.name),
		}, {
			afterPaste: ['wave'],
			play: ['Played wave', 'It is playing wave now.', 'The pet doesn\'t know that move'],
			afterForget: [],
			played: ['wave', 'wave', 'love'],
		});
	});

	test('previews a lesson as a picture of every frame, without saving or playing it', async () => {
		const { chatPetService, teach, played } = createTools();
		const parameters = { moves: [salute], preview: true };
		const prepared = await teach.prepareToolInvocation({ parameters, toolCallId: 'call', chatSessionResource: undefined }, CancellationToken.None);
		const preview = await teach.invoke(invocation(parameters), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			messages: [prepared?.invocationMessage, prepared?.pastTenseMessage],
			text: resultText(preview).split('\n').slice(0, 2),
			pictures: preview.content.map(part => part.kind === 'data' ? part.value.mimeType : part.kind),
			moves: chatPetService.moves.get().length,
			played,
		}, {
			messages: ['Previewing the pet\'s moves', 'Previewed the pet\'s moves'],
			text: [
				'Only a preview: the lesson is valid, but nothing was saved or played.',
				'The pictures show every frame of yes-sir (3 frames, 0.6 s, once), with its number and duration, on a dark and a light theme, standing on the chat input. "still" marks the frame shown for reduced motion.',
			],
			pictures: ['text', 'image/png'],
			moves: 0,
			played: [],
		});
	});

	test('lets the agent study built-in moves whole, a couple at a time', async () => {
		const { guide } = createTools();
		const parameters = { examples: ['cowboy', 'Rubber Duck', 'moonwalk', 'yes'] };
		const prepared = await guide.prepareToolInvocation({ parameters, toolCallId: 'call', chatSessionResource: undefined }, CancellationToken.None);
		const result = await guide.invoke(invocation(parameters), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			message: prepared?.pastTenseMessage,
			text: resultText(result).split('\n').map(line => line.startsWith('{') ? `${JSON.parse(line).name} as JSON` : line),
			pictures: result.content.map(part => part.kind === 'data' ? part.value.mimeType : part.kind),
		}, {
			message: 'Studied the pet\'s moves',
			text: [
				'The pet knows no move called "moonwalk"; it knows yes, idea, ship-it, cowboy, rubber-duck, magic, trophy, debug, coffee, zapped.',
				'The moves, whole: built-in moves in layers, taught moves as rows. The pictures show every frame of cowboy, then rubber-duck. To change one, send it back in "moves" with the same name, changing only what was asked.',
				'cowboy as JSON',
				'rubber-duck as JSON',
				'Moves come 2 at a time; ask again for yes.',
			],
			pictures: ['text', 'image/png', 'image/png'],
		});
	});

	test('refuses to teach a hidden pet, and guides the agent with what the pet knows', async () => {
		const { chatPetService, teach, guide } = createTools();
		await teach.invoke(invocation({ moves: [salute] }), async () => 0, { report: () => { } }, CancellationToken.None);
		const guideResult = await guide.invoke(invocation({}), async () => 0, { report: () => { } }, CancellationToken.None);
		const wholeResult = await guide.invoke(invocation({ moves: ['yes-sir'] }), async () => 0, { report: () => { } }, CancellationToken.None);
		chatPetService.toggle();
		const hidden = await teach.invoke(invocation({ moves: [{ ...salute, name: 'nod' }] }), async () => 0, { report: () => { } }, CancellationToken.None);
		const parts = (result: IToolResult) => result.content.map(part => part.kind === 'data' ? part.value.mimeType : part.kind);

		assert.deepStrictEqual({
			knowsYesSir: resultText(guideResult).includes('- taught moves: yes-sir'),
			// The guide comes with a picture of the examples it describes.
			guideParts: parts(guideResult),
			whole: [resultText(wholeResult).split('\n')[0], parts(wholeResult)],
			hidden: [resultText(hidden), hidden.toolResultMessage],
			moves: chatPetService.moves.get().map(move => move.name),
		}, {
			knowsYesSir: true,
			guideParts: ['text', 'image/png'],
			whole: ['The moves, whole: built-in moves in layers, taught moves as rows. The pictures show every frame of yes-sir. To change one, send it back in "moves" with the same name, changing only what was asked.', ['text', 'image/png']],
			hidden: ['The VS Code pet is hidden, so nothing was saved. Ask the user to show it with /vscode-pet, then try again.', 'The pet is hidden'],
			moves: ['yes-sir'],
		});
	});
});
