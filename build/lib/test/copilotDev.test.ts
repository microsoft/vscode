/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, suite, test } from 'node:test';
import {
	collectStatus,
	formatStatus,
	isSdkLinked,
	linkSdk,
	parseArgs,
	readProductOverrides,
	setCopilotCliPath,
	unlinkSdk,
	writeCopilotOverride,
} from '../copilotDev.ts';

const SHA = 'a'.repeat(40);
const RUNTIME = '@github/copilot';
const SDK = '@github/copilot-sdk';

const tmpDirs: string[] = [];

/** A throwaway repo root with the manifest shape `copilot-dev` operates on. */
function fakeRoot(copilotOverride: Record<string, string> = { [SDK]: '', [RUNTIME]: '' }): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-dev-'));
	tmpDirs.push(dir);
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'code-oss-dev', copilotOverride }, null, 2));
	return dir;
}

afterEach(() => {
	while (tmpDirs.length) {
		fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
	}
});

suite('copilotDev.parseArgs', () => {
	test('defaults to status on both packages with sibling checkouts', () => {
		const options = parseArgs([], {});
		assert.strictEqual(options.command, 'status');
		assert.strictEqual(options.runtime, true);
		assert.strictEqual(options.sdk, true);
		assert.strictEqual(options.runtimeRepo, '../copilot-agent-runtime');
		assert.strictEqual(options.sdkRepo, '../copilot-sdk');
	});

	test('environment variables override the default checkouts', () => {
		const options = parseArgs([], { COPILOT_RUNTIME_REPO: '/rt', COPILOT_SDK_REPO: '/sdk' });
		assert.strictEqual(options.runtimeRepo, '/rt');
		assert.strictEqual(options.sdkRepo, '/sdk');
	});

	test('a package flag narrows the command and can carry a path', () => {
		const options = parseArgs(['link', '--runtime=/elsewhere'], {});
		assert.strictEqual(options.command, 'link');
		assert.strictEqual(options.runtime, true);
		assert.strictEqual(options.sdk, false);
		assert.strictEqual(options.runtimeRepo, '/elsewhere');
	});

	test('passing both package flags acts on both', () => {
		const options = parseArgs(['link', '--runtime', '--sdk'], {});
		assert.strictEqual(options.runtime, true);
		assert.strictEqual(options.sdk, true);
	});

	test('collects pin arguments and build flags', () => {
		const options = parseArgs(['pin', SHA, '1.2.3', '--native', '--skip-build'], {});
		assert.deepStrictEqual(options.pins, [SHA, '1.2.3']);
		assert.strictEqual(options.native, true);
		assert.strictEqual(options.skipBuild, true);
	});

	test('rejects unknown commands and options', () => {
		assert.throws(() => parseArgs(['frobnicate'], {}), /Unknown command/);
		assert.throws(() => parseArgs(['link', '--turbo'], {}), /Unknown option/);
	});

	test('treats a bare dash as pin\'s skip sentinel, not an option', () => {
		assert.deepStrictEqual(parseArgs(['pin', SHA, '-'], {}).pins, [SHA, '-']);
	});
});

suite('copilotDev.productOverrides', () => {
	test('setting the CLI path preserves unrelated override keys', () => {
		const root = fakeRoot();
		fs.writeFileSync(path.join(root, 'product.overrides.json'), JSON.stringify({ quality: 'stable' }));

		setCopilotCliPath(root, '/local/dist-cli/index.js');

		assert.deepStrictEqual(readProductOverrides(root), { quality: 'stable', copilotCliPath: '/local/dist-cli/index.js' });
	});

	test('clearing the CLI path keeps other keys but removes an emptied file', () => {
		const root = fakeRoot();
		setCopilotCliPath(root, '/local/dist-cli/index.js');
		setCopilotCliPath(root, undefined);
		assert.strictEqual(fs.existsSync(path.join(root, 'product.overrides.json')), false);

		fs.writeFileSync(path.join(root, 'product.overrides.json'), JSON.stringify({ quality: 'stable' }));
		setCopilotCliPath(root, '/local/dist-cli/index.js');
		setCopilotCliPath(root, undefined);
		assert.deepStrictEqual(readProductOverrides(root), { quality: 'stable' });
	});
});

suite('copilotDev.writeCopilotOverride', () => {
	test('writes pins that the pipeline resolver accepts', () => {
		const root = fakeRoot();
		writeCopilotOverride(root, { [RUNTIME]: SHA, [SDK]: '1.2.3' });

		const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
		assert.deepStrictEqual(manifest.copilotOverride, { [SDK]: '1.2.3', [RUNTIME]: SHA });
	});

	test('rolls back a pin the pipeline resolver would reject', () => {
		const root = fakeRoot();
		const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

		// A short hash is rejected by resolveCopilotOverrides; `pin` must not
		// leave behind a value that would later fail the product build.
		assert.throws(() => writeCopilotOverride(root, { [RUNTIME]: SHA.slice(0, 7) }), /40-character lowercase SHA/);
		assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), before);
	});
});

suite('copilotDev.sdkLink', () => {
	test('linking parks the real package and unlinking restores it', () => {
		const root = fakeRoot();
		const installed = path.join(root, 'node_modules', '@github', 'copilot-sdk');
		fs.mkdirSync(installed, { recursive: true });
		fs.writeFileSync(path.join(installed, 'marker.txt'), 'published');

		const checkout = path.join(root, 'checkout', 'nodejs');
		fs.mkdirSync(checkout, { recursive: true });

		linkSdk(root, checkout);
		assert.strictEqual(isSdkLinked(root), true);
		assert.strictEqual(fs.realpathSync(installed), fs.realpathSync(checkout));

		assert.strictEqual(unlinkSdk(root), true);
		assert.strictEqual(isSdkLinked(root), false);
		assert.strictEqual(fs.readFileSync(path.join(installed, 'marker.txt'), 'utf8'), 'published');
	});

	test('re-linking does not destroy the parked package', () => {
		const root = fakeRoot();
		const installed = path.join(root, 'node_modules', '@github', 'copilot-sdk');
		fs.mkdirSync(installed, { recursive: true });
		fs.writeFileSync(path.join(installed, 'marker.txt'), 'published');

		const first = path.join(root, 'a', 'nodejs');
		const second = path.join(root, 'b', 'nodejs');
		fs.mkdirSync(first, { recursive: true });
		fs.mkdirSync(second, { recursive: true });

		linkSdk(root, first);
		linkSdk(root, second);
		unlinkSdk(root);

		assert.strictEqual(fs.readFileSync(path.join(installed, 'marker.txt'), 'utf8'), 'published');
	});

	test('unlinking an unlinked checkout is a no-op', () => {
		assert.strictEqual(unlinkSdk(fakeRoot()), false);
	});
});

suite('copilotDev.status', () => {
	test('reports the bundled packages for an untouched checkout', () => {
		const root = fakeRoot();
		const status = collectStatus(root, parseArgs([], {}));

		assert.strictEqual(status.cliPathOverride, undefined);
		assert.strictEqual(status.sdkLinked, false);
		assert.deepStrictEqual(status.pinned, {});

		const text = formatStatus(status);
		assert.match(text, /bundled/);
		assert.match(text, /none {7}normal build/);
	});

	test('reports a linked runtime, a linked SDK and active pins', () => {
		const root = fakeRoot({ [RUNTIME]: SHA });
		const checkout = path.join(root, 'checkout', 'nodejs');
		fs.mkdirSync(checkout, { recursive: true });
		linkSdk(root, checkout);
		setCopilotCliPath(root, path.join(root, 'missing', 'index.js'));

		const status = collectStatus(root, parseArgs([], {}));
		assert.strictEqual(status.sdkLinked, true);
		assert.strictEqual(status.cliPathOverrideExists, false);
		assert.deepStrictEqual(status.pinned, { [RUNTIME]: SHA });

		// A stale link is the most likely local failure, so it must be called out.
		assert.match(formatStatus(status), /MISSING - run link/);
	});
});
