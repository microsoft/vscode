/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageData } from '../../../../platform/chat/common/sessionTranscriptService';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { SessionTranscriptService } from '../sessionTranscriptService';

// ── Test doubles ──

class TestExtensionContext {
	declare readonly _serviceBrand: undefined;
	readonly storageUri: URI | undefined;

	constructor(storagePath: string | undefined) {
		this.storageUri = storagePath ? URI.file(storagePath) : undefined;
	}
}

class TestFileSystemService {
	declare readonly _serviceBrand: undefined;

	async stat(uri: URI) {
		const stats = await fs.promises.stat(uri.fsPath);
		return { mtime: stats.mtimeMs, ctime: stats.ctimeMs, size: stats.size };
	}

	async readDirectory(uri: URI) {
		const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
		return entries.map(e => [e.name, e.isFile() ? 1 : 2] as [string, number]);
	}

	async createDirectory(uri: URI) {
		await fs.promises.mkdir(uri.fsPath, { recursive: true });
	}

	async delete(uri: URI, options?: { recursive?: boolean }) {
		await fs.promises.rm(uri.fsPath, { recursive: options?.recursive, force: true });
	}
}

class TestLogService {
	declare readonly _serviceBrand: undefined;
	info() { }
	warn() { }
	error() { }
	debug() { }
	trace() { }
}

class TestEnvService {
	declare readonly _serviceBrand: undefined;
	readonly vscodeVersion = '1.99.0-test';
	getVersion() { return '0.0.0-test'; }
}

describe('SessionTranscriptService', () => {
	let disposables: DisposableStore;
	let tmpDir: string;
	let service: SessionTranscriptService;

	beforeEach(async () => {
		disposables = new DisposableStore();
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'transcript-'));
		service = new SessionTranscriptService(
			new TestFileSystemService() as unknown as IFileSystemService,
			new TestExtensionContext(tmpDir) as unknown as IVSCodeExtensionContext,
			new TestEnvService() as unknown as IEnvService,
			new TestLogService() as unknown as ILogService,
		);
	});

	afterEach(async () => {
		disposables.dispose();
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	async function readEntries(sessionId: string): Promise<Record<string, unknown>[]> {
		const transcriptPath = service.getTranscriptPath(sessionId);
		if (!transcriptPath) { return []; }
		const content = await fs.promises.readFile(transcriptPath.fsPath, 'utf-8');
		return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
	}

	const sampleUsage: UsageData = {
		model: 'gpt-4o',
		inputTokens: 1234,
		outputTokens: 567,
		totalTokens: 1801,
		cacheReadTokens: 800,
		cacheCreationInputTokens: 64,
		copilotUsageNanoAiu: 42_000_000,
		parentToolCallId: null,
	};

	it('logAssistantUsage writes a valid assistant.usage JSONL line', async () => {
		await service.startSession('session-1');
		service.logAssistantUsage('session-1', sampleUsage);
		await service.flush('session-1');

		const entries = await readEntries('session-1');
		const usageEntry = entries.find(e => e.type === 'assistant.usage');

		expect(usageEntry).toBeDefined();
		expect(usageEntry!.data).toEqual(sampleUsage);
		// Valid id and timestamp.
		expect(typeof usageEntry!.id).toBe('string');
		expect((usageEntry!.id as string).length).toBeGreaterThan(0);
		expect(() => new Date(usageEntry!.timestamp as string).toISOString()).not.toThrow();
		expect(new Date(usageEntry!.timestamp as string).toISOString()).toBe(usageEntry!.timestamp);
	});

	it('chains parentId from the previous entry', async () => {
		await service.startSession('session-chain');
		service.logUserMessage('session-chain', 'hello');
		service.logAssistantTurnStart('session-chain', 'turn-0');
		service.logAssistantUsage('session-chain', sampleUsage);
		await service.flush('session-chain');

		const entries = await readEntries('session-chain');
		const turnStart = entries.find(e => e.type === 'assistant.turn_start')!;
		const usageEntry = entries.find(e => e.type === 'assistant.usage')!;

		// The usage entry links back to the immediately preceding entry (turn_start).
		expect(usageEntry.parentId).toBe(turnStart.id);
		// The first entry (session.start) has a null parent.
		expect(entries[0].type).toBe('session.start');
		expect(entries[0].parentId).toBeNull();
	});

	it('records a full turn with usage in append-only order', async () => {
		await service.startSession('session-e2e');
		service.logUserMessage('session-e2e', 'What is 2 + 2?');
		service.logAssistantTurnStart('session-e2e', 'turn-0');
		service.logAssistantMessage('session-e2e', '4', []);
		service.logAssistantUsage('session-e2e', sampleUsage);
		service.logAssistantTurnEnd('session-e2e', 'turn-0');
		await service.flush('session-e2e');

		const entries = await readEntries('session-e2e');
		const types = entries.map(e => e.type);

		expect(types).toEqual([
			'session.start',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'assistant.usage',
			'assistant.turn_end',
		]);

		const usageEntry = entries[4];
		expect(usageEntry.data).toEqual(sampleUsage);
	});

	it('is a no-op when the session was never started', async () => {
		// No startSession call — buffering has nowhere to go and must not throw.
		expect(() => service.logAssistantUsage('missing', sampleUsage)).not.toThrow();
		expect(service.getTranscriptPath('missing')).toBeUndefined();
	});
});
