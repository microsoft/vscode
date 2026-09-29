/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpPrefixGenerator } from '../../common/mcpServer.js';
import { McpToolName } from '../../common/mcpTypes.js';

suite('McpPrefixGenerator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('basic prefix uses mcp_ + safe lower-case name', () => {
		const gen = new McpPrefixGenerator();
		const ref = gen.take('Context7');
		assert.strictEqual(ref.object, `${McpToolName.Prefix}context7_`);
		ref.dispose();
	});

	test('long registry-style names are clamped to MaxPrefixLen', () => {
		const gen = new McpPrefixGenerator();
		// Repro for #299749: a long registry-style key should at least produce a
		// valid (length-bounded) prefix. The actual readability fix comes from
		// callers taking with the announced server title instead of this key.
		const ref = gen.take('io.github.upstash/context7');
		assert.ok(ref.object.startsWith(McpToolName.Prefix));
		assert.ok(ref.object.length <= McpToolName.MaxPrefixLen);
		ref.dispose();
	});

	test('collisions add numeric suffixes', () => {
		const gen = new McpPrefixGenerator();
		const a = gen.take('foo');
		const b = gen.take('foo');
		const c = gen.take('foo');
		assert.strictEqual(a.object, `${McpToolName.Prefix}foo_`);
		assert.strictEqual(b.object, `${McpToolName.Prefix}foo2_`);
		assert.strictEqual(c.object, `${McpToolName.Prefix}foo3_`);
		a.dispose();
		b.dispose();
		c.dispose();
	});

	test('dispose releases the slot and the next take reuses the lowest index', () => {
		const gen = new McpPrefixGenerator();
		const a = gen.take('foo');
		const b = gen.take('foo');
		const c = gen.take('foo');
		assert.strictEqual(b.object, `${McpToolName.Prefix}foo2_`);

		b.dispose();
		const d = gen.take('foo');
		assert.strictEqual(d.object, `${McpToolName.Prefix}foo2_`, 'reuses freed slot');

		a.dispose();
		c.dispose();
		d.dispose();
	});

	test('disposing only consumer cleans up the bucket so the next take starts at index 1', () => {
		const gen = new McpPrefixGenerator();
		const a = gen.take('foo');
		const b = gen.take('foo');
		a.dispose();
		b.dispose();

		const c = gen.take('foo');
		assert.strictEqual(c.object, `${McpToolName.Prefix}foo_`);
		c.dispose();
	});

	test('different names live in independent buckets', () => {
		const gen = new McpPrefixGenerator();
		const a = gen.take('foo');
		const b = gen.take('bar');
		assert.strictEqual(a.object, `${McpToolName.Prefix}foo_`);
		assert.strictEqual(b.object, `${McpToolName.Prefix}bar_`);
		a.dispose();
		b.dispose();
	});

	test('names are sanitized and lower-cased the same way before bucketing', () => {
		const gen = new McpPrefixGenerator();
		const a = gen.take('My Server');
		const b = gen.take('my server');
		const c = gen.take('my/server');
		// All collapse to the same safe name `my_server`, so they collide.
		assert.strictEqual(a.object, `${McpToolName.Prefix}my_server_`);
		assert.strictEqual(b.object, `${McpToolName.Prefix}my_server2_`);
		assert.strictEqual(c.object, `${McpToolName.Prefix}my_server3_`);
		a.dispose();
		b.dispose();
		c.dispose();
	});

	test('prefix length never exceeds MaxPrefixLen, including for multi-digit collision suffixes', () => {
		const gen = new McpPrefixGenerator();
		// Pick a name that, once sanitized, sits right at the per-bucket length cap
		// so that adding a numeric suffix would otherwise blow past MaxPrefixLen.
		const longName = 'a'.repeat(McpToolName.MaxPrefixLen);
		const refs: IReference<string>[] = [];
		for (let i = 0; i < 12; i++) {
			refs.push(gen.take(longName));
		}
		for (const ref of refs) {
			assert.ok(ref.object.startsWith(McpToolName.Prefix));
			assert.ok(ref.object.endsWith('_'));
			assert.ok(ref.object.length <= McpToolName.MaxPrefixLen, `prefix ${ref.object} (length ${ref.object.length}) exceeds MaxPrefixLen ${McpToolName.MaxPrefixLen}`);
		}
		// All 12 must be unique so they remain distinguishable.
		assert.strictEqual(new Set(refs.map(r => r.object)).size, refs.length);
		for (const ref of refs) {
			ref.dispose();
		}
	});
});
