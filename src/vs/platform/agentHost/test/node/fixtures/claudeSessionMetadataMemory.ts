/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { ClaudeAgentSdkService, IClaudeSdkBindings } from '../../../node/claude/claudeAgentSdkService.js';

const sessionCount = 256;
const transcriptBytes = 64 * 1024;

function createSessionInfo(index: number): SDKSessionInfo {
	const transcript = Buffer.alloc(transcriptBytes, 65 + index % 26).toString('utf8');
	return {
		sessionId: `session-${index}`,
		summary: transcript.slice(0, 64),
		lastModified: index,
		fileSize: transcriptBytes,
		customTitle: transcript.slice(64, 128),
		firstPrompt: transcript.slice(128, 192),
		gitBranch: transcript.slice(192, 256),
		cwd: transcript.slice(256, 320),
		tag: transcript.slice(320, 384),
		createdAt: index,
	};
}

class TestClaudeSdkBindings extends mock<IClaudeSdkBindings>() {
	override async listSessions(): Promise<SDKSessionInfo[]> {
		return Array.from({ length: sessionCount }, (_, index) => createSessionInfo(index));
	}

	override async getSessionInfo(sessionId: string): Promise<SDKSessionInfo> {
		return createSessionInfo(Number(sessionId.slice('session-'.length)));
	}
}

class TestClaudeAgentSdkService extends ClaudeAgentSdkService {
	protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
		return new TestClaudeSdkBindings();
	}
}

async function retainedHeap(): Promise<number> {
	await new Promise<void>(resolve => setImmediate(resolve));
	assert(global.gc, 'This fixture requires --expose-gc');
	for (let i = 0; i < 3; i++) {
		global.gc();
	}
	return process.memoryUsage().heapUsed;
}

const logService = new NullLogService();
const service = new TestClaudeAgentSdkService(logService, new class extends mock<IAgentSdkDownloader>() { });

async function checkMetadataRetention(load: () => Promise<readonly (SDKSessionInfo | undefined)[]>): Promise<void> {
	const before = await retainedHeap();
	const entries = await load();
	const growth = (await retainedHeap()) - before;
	assert.deepStrictEqual(entries.map(entry => entry?.summary), Array.from({ length: sessionCount }, (_, index) => String.fromCharCode(65 + index % 26).repeat(64)));
	assert(growth < 2 * 1024 * 1024, `Small session metadata retained ${growth} bytes from ${sessionCount * transcriptBytes} bytes of transcripts`);
}

try {
	await checkMetadataRetention(() => service.listSessions());
	await checkMetadataRetention(() => Promise.all(Array.from({ length: sessionCount }, (_, index) => service.getSessionInfo(`session-${index}`))));
} finally {
	logService.dispose();
}
