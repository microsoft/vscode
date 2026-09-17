/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CodexImageGenerationToolName, GenerateImageToolReferenceName } from '../../common/imageGenerationConstants.js';
import { ToolCallConfirmationReason } from '../../common/state/protocol/state.js';
import { MessageKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type Turn } from '../../common/state/sessionState.js';
import { persistCopilotImageToolResult, restoreCopilotImageToolResults } from '../../node/copilot/copilotImageToolResults.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';

function sdkHistory(toolName = GenerateImageToolReferenceName): Turn[] {
	return [{
		id: 'restored-sdk-turn',
		state: TurnState.Complete,
		message: { text: 'Draw a tree', origin: { kind: MessageKind.User } },
		usage: undefined,
		responseParts: [{
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId: 'generated-image-call',
				toolName,
				displayName: 'Generate Image',
				invocationMessage: 'Generating an image',
				pastTenseMessage: 'Generated an image',
				success: true,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				content: [{ type: ToolResultContentType.Text, text: 'Generated an image in chat.' }],
			},
		}],
	}];
}

suite('Copilot generated image persistence', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let database: SessionDatabase;
	const image = { type: 'image' as const, mimeType: 'image/png', data: 'cG5nLWJ5dGVz' };
	const metadataKey = 'copilot.generatedImage.generated-image-call';

	setup(async () => {
		directory = await fs.mkdtemp(join(tmpdir(), 'copilot-generated-image-'));
		database = new SessionDatabase(join(directory, 'session.db'));
		await database.setTurnEventId('generation-turn', 'restored-sdk-turn');
	});

	teardown(async () => {
		await database.close();
		await fs.rm(directory, { recursive: true, force: true });
	});

	for (const saveFailed of [false, true]) {
		test(`restores user-only images after closing and reopening the database (save failed: ${saveFailed})`, async () => {
			const error = saveFailed ? 'The image was generated, but the project file could not be saved.' : undefined;
			await persistCopilotImageToolResult(database, 'generation-turn', 'generated-image-call', {
				textResultForLlm: 'Generated an image in chat.',
				resultType: saveFailed ? 'failure' : 'success',
				error,
				binaryResultsForLlm: [image],
			});
			await database.close();
			database = new SessionDatabase(join(directory, 'session.db'));
			const before = sdkHistory();
			const originalPart = before[0].responseParts[0];
			assert.ok(originalPart.kind === ResponsePartKind.ToolCall && originalPart.toolCall.status === ToolCallStatus.Completed);
			const restored = await restoreCopilotImageToolResults(database, before, store.add(new NullLogService()));
			const part = restored[0].responseParts[0];
			assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
			assert.deepStrictEqual({
				message: restored[0].message,
				content: part.toolCall.content,
				success: part.toolCall.success,
				error: part.toolCall.error?.message,
				originalUnchanged: originalPart.toolCall.content?.length,
			}, {
				message: before[0].message,
				content: [
					{ type: ToolResultContentType.Text, text: 'Generated an image in chat.' },
					{ type: ToolResultContentType.EmbeddedResource, contentType: 'image/png', data: image.data },
				],
				success: !saveFailed,
				error,
				originalUnchanged: 1,
			});
			assert.deepStrictEqual(await restoreCopilotImageToolResults(database, restored, store.add(new NullLogService())), restored);
		});
	}

	test('does not alter native Codex or unrelated tool history', async () => {
		await persistCopilotImageToolResult(database, 'generation-turn', 'generated-image-call', {
			textResultForLlm: 'Generated an image in chat.',
			resultType: 'success',
			binaryResultsForLlm: [image],
		});
		for (const name of [CodexImageGenerationToolName, 'screenshot_page']) {
			const turns = sdkHistory(name);
			assert.deepStrictEqual(await restoreCopilotImageToolResults(database, turns, store.add(new NullLogService())), turns);
		}
	});

	test('preserves text-only history when there is no persisted image', async () => {
		const turns = sdkHistory();
		assert.deepStrictEqual(await restoreCopilotImageToolResults(database, turns, store.add(new NullLogService())), turns);
	});

	test('reports a corrupt image cache without losing the conversation', async () => {
		const corruptDatabase = new class extends TestSessionDatabase {
			override async getMetadata(): Promise<string> { return '{'; }
		}();
		const warnings: string[] = [];
		const logService = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const before = sdkHistory();
		const restored = await restoreCopilotImageToolResults(corruptDatabase, before, logService);
		const part = restored[0].responseParts[0];
		assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
		assert.deepStrictEqual({
			message: restored[0].message,
			success: part.toolCall.success,
			retainsText: part.toolCall.content?.[0],
			errorVisible: typeof part.toolCall.pastTenseMessage === 'string' && part.toolCall.pastTenseMessage.includes('could not be restored'),
			warnings: warnings.length,
		}, {
			message: before[0].message,
			success: true,
			retainsText: { type: ToolResultContentType.Text, text: 'Generated an image in chat.' },
			errorVisible: true,
			warnings: 1,
		});
	});

	test('propagates persistence failures instead of dropping the image silently', async () => {
		const failingDatabase = new class extends TestSessionDatabase {
			override async setMetadata(): Promise<void> { throw new Error('disk full'); }
		}();
		await assert.rejects(persistCopilotImageToolResult(failingDatabase, 'generation-turn', 'generated-image-call', {
			textResultForLlm: 'Generated an image in chat.',
			resultType: 'success',
			binaryResultsForLlm: [image],
		}), /disk full/);
	});

	for (const operation of ['delete', 'truncate', 'clear', 'fork']) {
		test(`prunes image metadata with its owning turn on ${operation}`, async () => {
			await database.setMetadata('session.setting', 'keep');
			await database.createTurn('later-turn');
			await persistCopilotImageToolResult(database, 'later-turn', 'generated-image-call', {
				resultType: 'success', textResultForLlm: 'Generated', binaryResultsForLlm: [image],
			});
			switch (operation) {
				case 'delete': await database.deleteTurn('later-turn'); break;
				case 'truncate': await database.truncateFromTurn('later-turn'); break;
				case 'clear': await database.deleteAllTurns(); break;
				case 'fork': await database.remapTurnIds(new Map([['generation-turn', 'fork-turn']])); break;
			}
			assert.deepStrictEqual({
				image: await database.getMetadata(metadataKey),
				setting: await database.getMetadata('session.setting'),
			}, { image: undefined, setting: 'keep' });
		});
	}

	test('keeps a retained image owned by its remapped fork turn', async () => {
		await persistCopilotImageToolResult(database, 'generation-turn', 'generated-image-call', {
			resultType: 'success', textResultForLlm: 'Generated', binaryResultsForLlm: [image],
		});
		await database.remapTurnIds(new Map([['generation-turn', 'fork-turn']]));
		assert.ok(await database.getMetadata(metadataKey));
		await database.deleteTurn('fork-turn');
		assert.strictEqual(await database.getMetadata(metadataKey), undefined);
	});

	test('adopts older preview metadata using the restored SDK turn id', async () => {
		await database.setMetadata(metadataKey, JSON.stringify({ images: [{ data: image.data, contentType: 'image/png' }] }));
		const restored = await restoreCopilotImageToolResults(database, sdkHistory(), store.add(new NullLogService()));
		const part = restored[0].responseParts[0];
		assert.ok(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed);
		assert.strictEqual(part.toolCall.content?.length, 2);
		await database.deleteTurn('generation-turn');
		assert.strictEqual(await database.getMetadata(metadataKey), undefined);
	});
});
