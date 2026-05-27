/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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

	test('registry-style names are normalized so context is preserved', () => {
		const gen = new McpPrefixGenerator();
		// Used to truncate to `mcp_io_github_ups_` (see #299749). With the announced
		// title (e.g. "Context7") it now starts from a clean short name.
		const refLong = gen.take('io.github.upstash/context7');
		assert.ok(refLong.object.startsWith(McpToolName.Prefix));
		assert.ok(refLong.object.length <= McpToolName.MaxPrefixLen);
		refLong.dispose();

		const refTitle = gen.take('Context7');
		assert.strictEqual(refTitle.object, `${McpToolName.Prefix}context7_`);
		refTitle.dispose();
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
});
