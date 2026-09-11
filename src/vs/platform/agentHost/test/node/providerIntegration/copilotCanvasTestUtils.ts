/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { CopilotRequestHandler } from '@github/copilot-sdk';
import { timeout } from '../../../../../base/common/async.js';
import { join } from '../../../../../base/common/path.js';
import { hasKey } from '../../../../../base/common/types.js';

export async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
	let value = await read();
	for (let i = 0; i < 200 && !predicate(value); i++) {
		await timeout(50);
		value = await read();
	}
	assert.ok(predicate(value), `Timed out: ${JSON.stringify(value)}`);
	return value;
}

function hasAuditKeys(value: unknown): value is { kind: unknown; data: unknown } {
	return typeof value === 'object' && value !== null && hasKey(value, { kind: true, data: true });
}

export async function readCanvasFixtureAudit(directory: string, kind: string): Promise<unknown[]> {
	const path = join(directory, 'audit.jsonl');
	if (!existsSync(path)) {
		return [];
	}
	const content = await readFile(path, 'utf8');
	return content.trim().split('\n').map(line => {
		const record: unknown = JSON.parse(line);
		assert.ok(hasAuditKeys(record) && typeof record.kind === 'string');
		return record;
	}).filter(record => record.kind === kind).map(record => record.data);
}

export class NoModelRequests extends CopilotRequestHandler {
	readonly requests: string[] = [];

	protected override async sendRequest(request: Request): Promise<Response> {
		this.requests.push(request.url);
		throw new Error('Canvas contract tests must not make model requests');
	}

	protected override async openWebSocket(): Promise<never> {
		this.requests.push('websocket');
		throw new Error('Canvas contract tests must not make WebSocket model requests');
	}
}
