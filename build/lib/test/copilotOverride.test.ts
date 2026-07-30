/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, suite, test } from 'node:test';
import { isPinnedSourceRequested, overrideBuildTags, parseLsRemoteTagSha, pinnedRuntimeVersion, PINNED_SOURCE, resolveCopilotOverrides, runtimeSourceTag, sourceBuildVersion } from '../../azure-pipelines/common/copilotOverride.ts';
import { redactedError, redactSecrets, gitAuthArgs } from '../copilotRuntimeSource.ts';
import { execFileSync } from 'child_process';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const SDK = '@github/copilot-sdk';
const RUNTIME = '@github/copilot';

const tmpDirs: string[] = [];

/** Writes a throwaway repo root whose package.json carries the given `copilotOverride`. */
function rootWith(copilotOverride: unknown): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-override-'));
	tmpDirs.push(dir);
	const pkg = copilotOverride === undefined ? {} : { copilotOverride };
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
	return dir;
}

afterEach(() => {
	while (tmpDirs.length) {
		fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
	}
});

suite('copilotOverride', () => {
	test('a normal build (absent or empty field) yields no overrides', () => {
		assert.deepStrictEqual(resolveCopilotOverrides(rootWith(undefined), {}), []);
		assert.deepStrictEqual(resolveCopilotOverrides(rootWith({ [SDK]: '', [RUNTIME]: '' }), {}), []);
	});

	test('resolves a feed spec and a bare-commit source override', () => {
		const root = rootWith({ [SDK]: '1.2.3', [RUNTIME]: SHA });
		assert.deepStrictEqual(resolveCopilotOverrides(root, {}), [
			{ pkg: 'sdk', npmName: SDK, kind: 'feed', spec: '1.2.3' },
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: SHA },
		]);
	});

	test('treats non-hex specs (versions, ranges, dist-tags) as feed overrides', () => {
		for (const spec of ['1.2.3', '^1.2.0', 'latest', 'next']) {
			assert.deepStrictEqual(resolveCopilotOverrides(rootWith({ [SDK]: spec }), {}), [
				{ pkg: 'sdk', npmName: SDK, kind: 'feed', spec },
			]);
		}
	});

	test('rejects hex values that are not a full lowercase 40-char commit SHA', () => {
		for (const value of [SHA.slice(0, 7), SHA.slice(0, 39), SHA.toUpperCase()]) {
			assert.throws(() => resolveCopilotOverrides(rootWith({ [RUNTIME]: value }), {}), /full 40-character lowercase SHA/);
		}
	});

	test('rejects an unknown (misspelled) package name', () => {
		assert.throws(() => resolveCopilotOverrides(rootWith({ '@github/copilot-runtime': SHA }), {}), /Unknown package/);
	});

	test('rejects specs npm would resolve as a git or directory dependency', () => {
		// npm resolves each of these as something other than a version: `owner/repo`
		// and `owner/repo#sha` are git installs from an arbitrary repository, `../x`
		// and `..` are local directory installs, `npm:x` is an alias. Accepting one
		// would let an override point a signed release build at other code.
		for (const value of ['evil/malicious-repo', 'evil/repo#deadbeef', '../../etc', '..', '.', 'npm:other@1.0.0', 'https://example.com/x.tgz']) {
			assert.throws(
				() => resolveCopilotOverrides(rootWith({ [SDK]: value }), {}),
				/Refusing unsafe/,
				`accepted dangerous spec: ${value}`,
			);
		}
	});

	test('still accepts every legitimate version, range and dist-tag form', () => {
		for (const value of ['1.2.3', '1.2.3-canary.4.gabc123', '1.2.3+build.5', '^1.2.0', '~1.2', '>=1.2 <2', '1.x', '*', '1.2.3 || 2.0.0', 'latest', 'next', 'insiders_2']) {
			assert.deepStrictEqual(
				resolveCopilotOverrides(rootWith({ [SDK]: value }), {}),
				[{ pkg: 'sdk', npmName: SDK, kind: 'feed', spec: value }],
				`rejected legitimate spec: ${value}`,
			);
		}
	});

	test('a queue-time env override wins; a blank env value falls back to package.json', () => {
		const root = rootWith({ [RUNTIME]: SHA });
		assert.deepStrictEqual(resolveCopilotOverrides(root, { VSCODE_COPILOT_RUNTIME: OTHER_SHA }), [
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: OTHER_SHA },
		]);
		assert.deepStrictEqual(resolveCopilotOverrides(root, { VSCODE_COPILOT_RUNTIME: '   ' }), [
			{ pkg: 'runtime', npmName: RUNTIME, kind: 'git', repo: 'github/copilot-agent-runtime', ref: SHA },
		]);
	});

	test('the committed package.json resolves cleanly', () => {
		// `--detect` runs on every build, so a mismatch between the field keys and
		// the package names would fail normal builds, not just override builds.
		assert.deepStrictEqual(resolveCopilotOverrides(path.join(import.meta.dirname, '../../../'), {}), []);
	});

	test('source build versions are unique per commit', () => {
		// The packed SDK tarball is named after this, and the manifest pins that
		// name — a stable name across commits collides in the node_modules cache key.
		assert.strictEqual(sourceBuildVersion(SHA), `0.0.0-src.g${'a'.repeat(7)}`);
		assert.notStrictEqual(sourceBuildVersion(SHA), sourceBuildVersion(OTHER_SHA));
	});

	test('build tags record what a released build contains', () => {
		const overrides = resolveCopilotOverrides(rootWith({ [SDK]: '^1.2.0', [RUNTIME]: SHA }), {});
		// Values are sanitized because build tags land in a REST URL path.
		assert.deepStrictEqual(overrideBuildTags(overrides), [
			'copilot-sdk=_1.2.0',
			`copilot-runtime=git.${SHA}`,
		]);
		assert.deepStrictEqual(overrideBuildTags([]), []);
	});
});

suite('copilotOverride.pinnedSource', () => {
	test('only the exact sentinel selects a pinned source build', () => {
		assert.strictEqual(isPinnedSourceRequested({ VSCODE_COPILOT_RUNTIME: `  ${PINNED_SOURCE}  ` }), true);
		assert.strictEqual(isPinnedSourceRequested({ VSCODE_COPILOT_RUNTIME: SHA }), false);
		assert.strictEqual(isPinnedSourceRequested({}), false);
	});

	test('reads the concrete installed version from the lockfile', () => {
		const root = rootWith(undefined);
		fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
			packages: { 'node_modules/@github/copilot': { version: '1.0.73' } },
		}));
		assert.strictEqual(pinnedRuntimeVersion(root), '1.0.73');
		assert.strictEqual(runtimeSourceTag('1.0.73'), 'cli-1.0.73');
	});

	test('fails when the lockfile records no runtime version', () => {
		const root = rootWith(undefined);
		fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: {} }));
		assert.throws(() => pinnedRuntimeVersion(root), /records no @github\/copilot version/);
	});

	test('resolves a lightweight tag to its commit', () => {
		const output = `${SHA}\trefs/tags/cli-1.0.73\n`;
		assert.strictEqual(parseLsRemoteTagSha(output, 'cli-1.0.73'), SHA);
	});

	test('prefers the dereferenced commit of an annotated tag', () => {
		// The bare ref of an annotated tag is the tag object, not the commit.
		const output = `${OTHER_SHA}\trefs/tags/cli-1.0.73\n${SHA}\trefs/tags/cli-1.0.73^{}\n`;
		assert.strictEqual(parseLsRemoteTagSha(output, 'cli-1.0.73'), SHA);
	});

	test('fails on a missing or unusable tag rather than guessing', () => {
		assert.throws(() => parseLsRemoteTagSha('', 'cli-9.9.9'), /has no tag cli-9\.9\.9/);
		assert.throws(() => parseLsRemoteTagSha(`${SHA}\trefs/tags/cli-1.0.74\n`, 'cli-1.0.73'), /has no tag cli-1\.0\.73/);
		assert.throws(() => parseLsRemoteTagSha('abc123\trefs/tags/cli-1.0.73\n', 'cli-1.0.73'), /has no tag cli-1\.0\.73/);
	});
});

suite('copilotRuntimeSource.redaction', () => {
	// `execFileSync` embeds the whole argument list in its error message, so an
	// authenticated git call that fails would print a live token into the log.
	const TOKEN = 'x-access-token-SUPERSECRET';

	test('strips the auth header from a failed command message', () => {
		const raw = `Command failed: git -c http.extraheader=AUTHORIZATION: basic ${TOKEN} fetch --depth 1 origin abc`;
		const redacted = redactedError(new Error(raw)).message;
		assert.ok(!redacted.includes(TOKEN), `token leaked: ${redacted}`);
		assert.match(redacted, /basic \*\*\*/);
	});

	test('strips credentials embedded in a remote URL', () => {
		const raw = `fatal: unable to access 'https://${TOKEN}@github.com/owner/repo.git/'`;
		const redacted = redactSecrets(raw);
		assert.ok(!redacted.includes(TOKEN), `token leaked: ${redacted}`);
		assert.match(redacted, /\/\/\*\*\*@github\.com/);
	});

	test('leaves output without credentials untouched', () => {
		assert.strictEqual(redactSecrets('Command failed: git checkout -q abc123'), 'Command failed: git checkout -q abc123');
	});

	test('a real failed authenticated git call throws without the credential', () => {
		// The header carries base64 of `x-access-token:<token>` — trivially
		// decodable, so it is the credential for leak purposes.
		const encoded = Buffer.from(`x-access-token:${TOKEN}`).toString('base64');
		let thrown: unknown;
		try {
			execFileSync('git', [...gitAuthArgs(TOKEN), 'ls-remote', path.join(os.tmpdir(), 'copilot-no-such-repo')], { stdio: ['ignore', 'pipe', 'pipe'] });
		} catch (err) {
			thrown = err;
		}
		assert.ok(thrown, 'expected git to fail against a non-existent remote');
		// Precondition: Node really does embed the argument list in the message. If
		// that ever stops holding, the redaction below is no longer load-bearing.
		assert.ok((thrown as Error).message.includes(encoded), 'raw error unexpectedly hid the credential');
		assert.ok(!redactedError(thrown).message.includes(encoded), 'redactedError leaked the credential');
	});

	test('auth args disable interactive credential fallback', () => {
		// A bad token must fail the build, not block it on a prompt nobody can answer.
		for (const args of [gitAuthArgs(undefined), gitAuthArgs(TOKEN)]) {
			assert.ok(args.includes('credential.helper='), `missing credential.helper in ${args.join(' ')}`);
			assert.ok(args.includes('core.askPass='), `missing core.askPass in ${args.join(' ')}`);
		}
	});
});
