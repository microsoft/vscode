/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ToolResultCompressorService } from '../../../browser/tools/toolResultCompressorService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { LanguageModelPartAudience } from '../../../common/languageModels.js';
import { IToolResult, IToolResultDataPart, IToolResultTextPart } from '../../../common/tools/languageModelToolsService.js';
import { IToolResultFilter } from '../../../common/tools/toolResultCompressor.js';

const TOOL = 'run_in_terminal';

class CapturingLogService extends NullLogService {
	public readonly warnings: string[] = [];
	override warn(msg: string): void { this.warnings.push(msg); }
}

function makeService(opts: { enabled: boolean; log?: ILogService }): ToolResultCompressorService {
	const config = new TestConfigurationService({ chat: { tools: { compressOutput: { enabled: opts.enabled } } } });
	// Also register raw key so getValue<boolean>(key) returns the value.
	config.setUserConfiguration(ChatConfiguration.CompressOutputEnabled, opts.enabled);
	return new ToolResultCompressorService(config, NullTelemetryService, opts.log ?? new NullLogService());
}

function longText(prefix: string): string {
	// Must exceed MIN_COMPRESSIBLE_LENGTH (80) so filters get a chance to run.
	return prefix + ' ' + 'x'.repeat(200);
}

const replaceWithFooFilter: IToolResultFilter = {
	id: 'test.replaceWithFoo',
	toolIds: [TOOL],
	matches: () => true,
	apply: () => ({ text: 'foo', compressed: true }),
};

function textResult(...values: string[]): IToolResult {
	return { content: values.map(value => ({ kind: 'text' as const, value })) };
}

suite('ToolResultCompressorService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const make = (opts: { enabled: boolean; log?: ILogService }) => store.add(makeService(opts));

	test('returns undefined when disabled', () => {
		const svc = make({ enabled: false });
		svc.registerFilter(replaceWithFooFilter);
		strictEqual(svc.maybeCompress(TOOL, {}, textResult(longText('hello'))), undefined);
	});

	test('returns undefined when no filters registered', () => {
		const svc = make({ enabled: true });
		strictEqual(svc.maybeCompress(TOOL, {}, textResult(longText('hello'))), undefined);
	});

	test('returns undefined when no filters match', () => {
		const svc = make({ enabled: true });
		svc.registerFilter({
			id: 'no-match',
			toolIds: [TOOL],
			matches: () => false,
			apply: () => ({ text: 'foo', compressed: true }),
		});
		strictEqual(svc.maybeCompress(TOOL, {}, textResult(longText('hello'))), undefined);
	});

	test('disables a throwing filter for the rest of the pass and warns once', () => {
		const log = new CapturingLogService();
		const svc = make({ enabled: true, log });
		let calls = 0;
		svc.registerFilter({
			id: 'thrower',
			toolIds: [TOOL],
			matches: () => true,
			apply: () => { calls++; throw new Error('boom'); },
		});
		svc.registerFilter(replaceWithFooFilter);
		const out = svc.maybeCompress(TOOL, {}, textResult(longText('a'), longText('b'), longText('c')));
		ok(out);
		// Throwing filter is invoked exactly once on the first text part, then disabled.
		strictEqual(calls, 1);
		strictEqual(log.warnings.length, 1);
		ok(log.warnings[0].includes('thrower'));
		// The other filter still rewrites every text part. Each emitted part starts
		// with the compression banner and ends with the filter's replacement text.
		for (const part of out!.content) {
			strictEqual(part.kind, 'text');
			const value = (part as { value: string }).value;
			ok(/^\[Output compressed by test\.replaceWithFoo /.test(value));
			ok(value.endsWith('\nfoo'));
		}
	});

	test('preserves non-text parts unchanged', () => {
		const svc = make({ enabled: true });
		svc.registerFilter(replaceWithFooFilter);
		const dataPart: IToolResultDataPart = { kind: 'data', value: { mimeType: 'application/octet-stream', data: VSBuffer.wrap(new Uint8Array([1, 2, 3])) } };
		const result: IToolResult = { content: [dataPart, { kind: 'text', value: longText('hello') }] };
		const out = svc.maybeCompress(TOOL, {}, result);
		ok(out);
		strictEqual(out!.content[0], dataPart);
		strictEqual(out!.content[1].kind, 'text');
		const value = (out!.content[1] as IToolResultTextPart).value;
		ok(/^\[Output compressed by test\.replaceWithFoo /.test(value));
		ok(value.endsWith('\nfoo'));
	});

	test('preserves text part audience metadata when rewriting', () => {
		const svc = make({ enabled: true });
		svc.registerFilter(replaceWithFooFilter);
		const audience = [LanguageModelPartAudience.Assistant, LanguageModelPartAudience.User];
		const result: IToolResult = { content: [{ kind: 'text', value: longText('hello'), audience }] };
		const out = svc.maybeCompress(TOOL, {}, result);
		ok(out);
		strictEqual(out!.content[0].kind, 'text');
		const part = out!.content[0] as IToolResultTextPart;
		ok(/^\[Output compressed by test\.replaceWithFoo /.test(part.value));
		ok(part.value.endsWith('\nfoo'));
		strictEqual(part.audience, audience);
	});

	test('skips text parts shorter than the minimum compressible length', () => {
		const svc = make({ enabled: true });
		svc.registerFilter(replaceWithFooFilter);
		// Nothing was compressed because the part was below the threshold.
		strictEqual(svc.maybeCompress(TOOL, {}, textResult('tiny')), undefined);
	});
});
