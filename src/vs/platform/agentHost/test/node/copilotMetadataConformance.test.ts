/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isCopilotMessageInternal, readCopilotAttachmentDetail, readCopilotAutoTierSwitchFailure, readCopilotContext, readCopilotErrorDetail, readCopilotMessageSource, readCopilotModelCallFailure, readCopilotModelCategory, readCopilotToolAvailability, readCopilotToolDefer, readCopilotToolOrigin, readCopilotToolOutputDelta, readCopilotToolTelemetry, readCopilotUsageDetail, readCopilotUsageInfo, withCopilotToolPreferences } from '../../common/meta/copilotd/copilotdMetadataReader.js';
import type { ToolDefinition } from '../../common/state/sessionState.js';

interface Vector {
	readonly name: string;
	readonly op: string;
	readonly input: Record<string, unknown>;
	readonly expected: Record<string, unknown>;
}

interface VectorFile {
	readonly key: string;
	readonly tests: readonly Vector[];
}

const hostOnlyOperations = new Set(['projectFromSdk', 'projectToSdk', 'projectCompaction', 'permitsScope']);
const directory = fileURLToPath(new URL('./fixtures/copilotdMetadata/', import.meta.url));

function record(value: unknown): Record<string, unknown> {
	assert(value !== null && typeof value === 'object' && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function source(input: Record<string, unknown>): { readonly _meta?: Record<string, unknown> } {
	const carrier = input.message ?? input.attachment ?? input.tool ?? input.delta ?? input.model;
	if (carrier !== undefined) {
		const value = record(carrier);
		return { _meta: value._meta === undefined ? undefined : record(value._meta) };
	}
	return { _meta: input.meta === undefined ? undefined : record(input.meta) };
}

function extract(key: string, input: Record<string, unknown>): unknown {
	const value = source(input);
	switch (key) {
		case 'copilot.source': return readCopilotMessageSource(value);
		case 'copilot.visibility': return isCopilotMessageInternal(value) ? 'internal' : undefined;
		case 'copilot.attachmentDetail': return readCopilotAttachmentDetail(value)?.raw;
		case 'copilot.modelPickerCategory': return readCopilotModelCategory(value);
		case 'copilot.errorDetail': return readCopilotErrorDetail(value);
		case 'copilot.usageDetail': return readCopilotUsageDetail(value);
		case 'copilot.usageInfo': return readCopilotUsageInfo(value);
		case 'copilot.modelCallFailure': return readCopilotModelCallFailure(value);
		case 'copilot.autoTierSwitchFailure': return readCopilotAutoTierSwitchFailure(value);
		case 'copilot.context': return readCopilotContext(value);
		case 'copilot.toolOrigin': return readCopilotToolOrigin(value);
		case 'copilot.toolTelemetry': return readCopilotToolTelemetry(value);
		case 'copilot.toolOutputDelta': return readCopilotToolOutputDelta(value)?.output;
		case 'copilot.toolDefer': return readCopilotToolDefer(value);
		case 'copilot.toolAvailability': return readCopilotToolAvailability(value);
		default: throw new Error(`No reader for ${key}`);
	}
}

function write(key: string, input: Record<string, unknown>): unknown {
	const raw = record(input.tool);
	assert.strictEqual(typeof raw.name, 'string');
	const tool: ToolDefinition = { ...raw, name: String(raw.name), ...source(input) };
	if (key === 'copilot.toolDefer') {
		assert(input.defer === 'auto' || input.defer === 'never' || input.defer === undefined || input.defer === null);
		return withCopilotToolPreferences(tool, { defer: input.defer ?? undefined });
	}
	assert(input.availability === 'session' || input.availability === 'userChats' || input.availability === undefined);
	return withCopilotToolPreferences(tool, { availability: input.availability });
}

suite('Copilot metadata conformance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const files = readdirSync(directory).filter(file => file.endsWith('-vectors.json')).sort();
	assert.strictEqual(files.length, 15);
	for (const name of files) {
		const vectors = JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')) as VectorFile;
		assert(Array.isArray(vectors.tests) && vectors.tests.length > 0);
		const hasWriter = ['copilot.toolDefer', 'copilot.toolAvailability'].includes(vectors.key);
		let executed = 0;
		for (const vector of vectors.tests) {
			if (hostOnlyOperations.has(vector.op) || (!hasWriter && (vector.op === 'set' || vector.op === 'wireShape'))) {
				continue;
			}
			assert(['extract', 'set', 'wireShape'].includes(vector.op), `Unknown operation ${name}: ${vector.op}`);
			executed++;
			test(`${name}: ${vector.name}`, () => {
				let actual: unknown;
				if (vector.op === 'extract') {
					assert.strictEqual(Object.keys(vector.expected).length, 1);
					actual = extract(vectors.key, vector.input) ?? null;
				} else {
					actual = write(vectors.key, vector.input);
				}
				if (vector.op === 'wireShape') {
					actual = JSON.parse(JSON.stringify(actual));
				}
				assert.deepStrictEqual(actual, Object.values(vector.expected)[0]);
			});
		}
		assert(executed > 0, `${name} executed no client cases`);
	}
});
