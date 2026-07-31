/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { builtinModules } from 'node:module';
import {
	buildRuntimeTarget,
	clearRuntimeSourceMarker,
	downloadedRuntimeArtifact,
	hostTarget,
	materializeRuntimeSourcePackage,
	runtimeArtifactDir,
	runtimeArtifactName,
	runtimeSourceRef,
	withGitHubRetries,
	writeRuntimeSourceMarker,
} from '../copilotRuntimeSource.ts';
import { copilotPlatforms } from '../copilotPlatforms.ts';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REPO = 'github/copilot-agent-runtime';
const TARGET = 'linuxmusl-arm64';
const PIPELINES = path.join(import.meta.dirname, '../../azure-pipelines/copilot');

/**
 * The module keys its scratch directories off the process working directory
 * (gulp's cwd is the repo root), so each test runs in a throwaway root.
 */
let cwd: string;
let workspace: string;

beforeEach(() => {
	cwd = process.cwd();
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-runtime-artifact-'));
	process.chdir(workspace);
});

afterEach(() => {
	process.chdir(cwd);
	fs.rmSync(workspace, { recursive: true, force: true });
});

/** Writes a finished package, as the build stage's artifact would arrive. */
function writeArtifact(target: string, ref: string): string {
	const dir = path.resolve(runtimeArtifactDir(target));
	fs.mkdirSync(path.join(dir, 'sdk'), { recursive: true });
	fs.writeFileSync(path.join(dir, 'index.js'), '// built from source\n');
	fs.writeFileSync(path.join(dir, 'sdk', 'index.js'), '// sdk\n');
	fs.writeFileSync(path.join(dir, '.copilot-source-complete'), `${ref}\n`);
	return dir;
}

suite('copilot runtime artifact', () => {

	test('artifact names are derived from the target', () => {
		assert.strictEqual(runtimeArtifactName('linuxmusl-arm64'), 'copilot_runtime_linuxmusl_arm64');
		assert.strictEqual(runtimeArtifactName('win32-x64'), 'copilot_runtime_win32_x64');
	});

	test('every platform target yields a distinct, ADO-safe artifact name', () => {
		const names = copilotPlatforms.map(runtimeArtifactName);
		assert.strictEqual(new Set(names).size, copilotPlatforms.length);
		for (const name of names) {
			assert.match(name, /^[\w]+$/, `${name} must not need escaping in a pipeline artifact name`);
		}
	});

	test('no downloaded artifact means the caller must build the target itself', () => {
		assert.strictEqual(downloadedRuntimeArtifact(SHA, TARGET), undefined);
	});

	test('a partially downloaded artifact is not used', () => {
		const dir = path.resolve(runtimeArtifactDir(TARGET));
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'index.js'), '// truncated download\n');

		assert.strictEqual(downloadedRuntimeArtifact(SHA, TARGET), undefined);
	});

	test('a downloaded artifact built from the requested commit is used', () => {
		const dir = writeArtifact(TARGET, SHA);

		assert.strictEqual(downloadedRuntimeArtifact(SHA, TARGET), dir);
	});

	test('an artifact built from another commit fails the build rather than being rebuilt', () => {
		writeArtifact(TARGET, OTHER_SHA);

		assert.throws(
			() => downloadedRuntimeArtifact(SHA, TARGET),
			/was built from b{40}, but this build requires a{40}/,
		);
	});

	test('materialize prefers the downloaded artifact over building', () => {
		writeRuntimeSourceMarker(REPO, SHA);
		writeArtifact(TARGET, SHA);
		const packageDir = path.join(workspace, 'node_modules', '@github', `copilot-${TARGET}`);

		// There is no runtime checkout here, so a build would fail: reaching the
		// assertions below proves the artifact was consumed instead.
		materializeRuntimeSourcePackage(packageDir, TARGET);

		assert.strictEqual(fs.readFileSync(path.join(packageDir, 'index.js'), 'utf8'), '// built from source\n');
		assert.ok(fs.existsSync(path.join(packageDir, 'sdk', 'index.js')));
	});

	test('materialize replaces whatever the published package left behind', () => {
		writeRuntimeSourceMarker(REPO, SHA);
		writeArtifact(TARGET, SHA);
		const packageDir = path.join(workspace, 'node_modules', '@github', `copilot-${TARGET}`);
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(path.join(packageDir, 'stale.js'), '// from the published package\n');

		materializeRuntimeSourcePackage(packageDir, TARGET);

		assert.strictEqual(fs.existsSync(path.join(packageDir, 'stale.js')), false);
	});

	test('materialize is a no-op for a normal build', () => {
		clearRuntimeSourceMarker();
		const packageDir = path.join(workspace, 'node_modules', '@github', `copilot-${TARGET}`);

		materializeRuntimeSourcePackage(packageDir, TARGET);

		assert.strictEqual(fs.existsSync(packageDir), false);
		assert.strictEqual(runtimeSourceRef(), undefined);
	});

	test('building a target without an override is refused', () => {
		clearRuntimeSourceMarker();

		assert.throws(() => buildRuntimeTarget(TARGET), /No runtime source override is active/);
	});

	test('the host target names a package the runtime publishes', () => {
		assert.strictEqual(hostTarget(), `${process.platform}-${process.arch}`);
	});

	test('a transient GitHub failure is retried, and its credentials stay redacted', () => {
		let attempts = 0;
		const log: string[] = [];
		const original = console.log;
		console.log = (message: string) => void log.push(message);
		try {
			const result = withGitHubRetries('ls-remote', () => {
				if (++attempts < 3) {
					throw new Error('fatal: could not read Username for https://x-access-token:ghs_secret@github.com');
				}
				return 'ok';
			}, [0, 0, 0]);
			assert.strictEqual(result, 'ok');
		} finally {
			console.log = original;
		}

		assert.strictEqual(attempts, 3);
		assert.strictEqual(log.length, 2, 'each failed attempt should be reported');
		assert.ok(!log.join('\n').includes('ghs_secret'), 'retry logging must not leak the token');
	});

	test('a persistent GitHub failure still fails the build', () => {
		const original = console.log;
		console.log = () => { };
		try {
			assert.throws(() => withGitHubRetries('ls-remote', () => {
				throw new Error('Repository not found.');
			}, [0, 0]), /Repository not found/);
		} finally {
			console.log = original;
		}
	});
});

/**
 * The producing job, the consuming job and the code that reads the result each
 * name the artifact independently, in two YAML files and one TypeScript module.
 * A mismatch would not fail either job: the consumer's download is conditional,
 * so packaging would quietly fall back to building the runtime in place and ship
 * a package built by the wrong path. These keep the three in agreement.
 */
suite('copilot runtime artifact pipeline wiring', () => {

	/** Applies the template expressions the pipeline would expand for `target`. */
	function render(text: string, target: string): string {
		return text
			.replace(/\$\{\{\s*replace\(parameters\.VSCODE_COPILOT_TARGET,\s*'-',\s*'_'\)\s*\}\}/g, target.replace(/-/g, '_'))
			.replace(/\$\{\{\s*parameters\.VSCODE_COPILOT_TARGET\s*\}\}/g, target)
			.replace(/\$\(ARTIFACT_PREFIX\)/g, '')
			.replace(/\$\(Build\.SourcesDirectory\)\//g, '');
	}

	function valueOf(file: string, key: string, target: string): string {
		const text = render(fs.readFileSync(path.join(PIPELINES, file), 'utf8'), target);
		const value = new RegExp(`^\\s*${key}:\\s*(\\S+)\\s*$`, 'm').exec(text)?.[1];
		assert.ok(value, `${file} declares no ${key}`);
		return value;
	}

	test('the publishing job and the downloading step name the same artifact', () => {
		for (const target of copilotPlatforms) {
			const published = valueOf('runtime-source-build-job.yml', 'artifactName', target);
			const downloaded = valueOf('download-runtime-artifact.yml', 'artifact', target);

			assert.strictEqual(published, runtimeArtifactName(target), `producer artifact name for ${target}`);
			assert.strictEqual(downloaded, runtimeArtifactName(target), `consumer artifact name for ${target}`);
		}
	});

	test('the download lands where the packaging code looks for it', () => {
		for (const target of copilotPlatforms) {
			const downloadPath = valueOf('download-runtime-artifact.yml', 'path', target);

			assert.strictEqual(path.normalize(downloadPath), path.normalize(runtimeArtifactDir(target)), `download path for ${target}`);
		}
	});

	test('every platform target has a build job', () => {
		const fanOut = fs.readFileSync(path.join(PIPELINES, 'runtime-source-build.yml'), 'utf8');
		const targets = [...fanOut.matchAll(/^\s*VSCODE_COPILOT_TARGET:\s*(\S+)\s*$/gm)].map(match => match[1]);

		assert.deepStrictEqual([...targets].sort(), [...copilotPlatforms].sort());
	});

	test('the canary runs on a schedule that exists', () => {
		const productBuild = fs.readFileSync(path.join(PIPELINES, '../product-build.yml'), 'utf8');
		const cron = /^\s*-\s*name:\s*VSCODE_COPILOT_RUNTIME_CANARY_CRON\s*\n\s*value:\s*"([^"]+)"/m.exec(productBuild)?.[1];
		assert.ok(cron, 'product-build.yml declares no VSCODE_COPILOT_RUNTIME_CANARY_CRON');

		// The canary job keys off the cron's display name, so renaming the schedule
		// without updating this would silently stop it running.
		const schedules = [...productBuild.matchAll(/^\s*displayName:\s*(.+?)\s*$/gm)].map(match => match[1]);
		assert.ok(schedules.includes(cron), `no schedule in product-build.yml is named "${cron}"`);
	});

	/**
	 * The runtime build jobs never run `npm ci` — installing VS Code's
	 * dependencies to cross-compile Rust would be pure cost, and the packages the
	 * job produces are what those dependencies would be installed to package. So
	 * the entry point has to run on a bare checkout, and a single import reaching
	 * a node_modules package fails all eight jobs a minute in.
	 */
	test('the build entry point runs without node_modules', () => {
		const entry = path.join(import.meta.dirname, '../../azure-pipelines/common/build-copilot-runtime-target.ts');
		const seen = new Set<string>();
		const offenders: string[] = [];

		const visit = (file: string): void => {
			if (seen.has(file)) {
				return;
			}
			seen.add(file);
			const source = fs.readFileSync(file, 'utf8');
			for (const [, specifier] of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]/g)) {
				if (specifier.startsWith('.')) {
					visit(path.resolve(path.dirname(file), specifier));
				} else if (!builtinModules.includes(specifier.replace(/^node:/, ''))) {
					offenders.push(`${path.relative(process.cwd(), file)} imports '${specifier}'`);
				}
			}
		};
		visit(entry);

		assert.deepStrictEqual(offenders, [], 'only Node builtins and relative imports are reachable from the entry point');
		assert.ok(seen.size > 2, 'the import graph should have been walked');
	});
});
