/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { CHAT_PET_DOCUMENT_URI, serializeChatPetDocument } from '../../browser/chatPetDocument.js';
import { ChatPetDocumentFileSystemProvider } from '../../browser/chatPetDocumentProvider.js';
import { ChatPetMovePoses, IChatPetMove, parseChatPetMove, serializeChatPetMove } from '../../browser/chatPetMoves.js';
import { ChatPetService } from '../../browser/chatPetService.js';
import { IChatPetWidgetService } from '../../browser/widget/chatPetWidgetService.js';

function move(name: string, durationMs = 200): IChatPetMove {
	return parseChatPetMove(`name: ${name}\nloop: no\n\nframe ${durationMs}\n${ChatPetMovePoses.idle.join('\n')}\n`);
}

suite('ChatPetDocumentFileSystemProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider() {
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		const played: string[] = [];
		const widgetService = new class extends mock<IChatPetWidgetService>() {
			override playReaction(name: string): boolean {
				played.push(name);
				return true;
			}
		}();
		const provider = disposables.add(new ChatPetDocumentFileSystemProvider(chatPetService, widgetService));
		return { chatPetService, provider, played };
	}

	test('serves pets.md from what the pet knows and changes it when the pet learns', async () => {
		const { chatPetService, provider } = createProvider();
		const changes: string[] = [];
		disposables.add(provider.onDidChangeFile(events => changes.push(...events.map(event => event.resource.path))));
		const empty = await provider.stat(CHAT_PET_DOCUMENT_URI);
		chatPetService.learnMove(move('wave'));
		chatPetService.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		const taught = await provider.stat(CHAT_PET_DOCUMENT_URI);
		const text = VSBuffer.wrap(await provider.readFile(CHAT_PET_DOCUMENT_URI)).toString();
		const missing = await provider.stat(URI.parse('vscode-chat-pet:/other.md')).then(() => undefined, (error: FileSystemProviderError) => error.code);
		assert.deepStrictEqual({
			types: [empty.type, (await provider.stat(URI.parse('vscode-chat-pet:/'))).type],
			listing: await provider.readdir(URI.parse('vscode-chat-pet:/')),
			later: taught.mtime > empty.mtime && taught.size > empty.size,
			text: text === serializeChatPetDocument(chatPetService.moves.get(), chatPetService.reactions.get()),
			hasMove: text.includes('name: wave'),
			// Storage echoes the pet's own changes back, so lessons may fire more than one change.
			changed: changes.length >= 2 && changes.every(path => path === '/pets.md'),
			missing,
		}, {
			types: [FileType.File, FileType.Directory],
			listing: [['pets.md', FileType.File]],
			later: true,
			text: true,
			hasMove: true,
			changed: true,
			missing: FileSystemProviderErrorCode.FileNotFound,
		});
	});

	test('teaches what is saved, plays the changed move, and refuses a file with mistakes', async () => {
		const { chatPetService, provider, played } = createProvider();
		chatPetService.learnMove(move('wave'));
		chatPetService.learnMove(move('bow'));
		const kept = chatPetService.addReaction({ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' });
		const write = (text: string) => provider.writeFile(CHAT_PET_DOCUMENT_URI, VSBuffer.fromString(text).buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		// The wave stays as it is, the bow gets slower, the nod is new and its reaction with it; the greeting is written back unchanged.
		await write(serializeChatPetDocument([move('wave'), move('bow', 300), move('nod')], [
			{ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' },
			{ trigger: 'click', when: '', phrases: [], play: 'nod' },
		]));
		const afterValid = {
			moves: chatPetService.moves.get().map(serializeChatPetMove),
			reactions: chatPetService.reactions.get().map(reaction => [reaction.id === kept.id, reaction.trigger, reaction.play]),
			played: [...played],
		};
		const failure = await write('```pet\nplay: moonwalk\nphrases: slide\n```\n').then(() => undefined, (error: FileSystemProviderError) => error.message.split('\n'));
		assert.deepStrictEqual({
			afterValid,
			failure,
			unchanged: chatPetService.moves.get().map(move => move.name),
		}, {
			afterValid: {
				moves: [move('wave'), move('bow', 300), move('nod')].map(serializeChatPetMove),
				reactions: [[true, 'message', 'wave'], [false, 'click', 'nod']],
				played: ['nod'],
			},
			failure: ['The pet learned nothing from pets.md; fix these first:', 'Line 1: The pet doesn\'t know a move called "moonwalk" yet.'],
			unchanged: ['wave', 'bow', 'nod'],
		});
	});
});
