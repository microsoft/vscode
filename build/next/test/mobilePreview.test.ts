/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import {
	checkMobilePreviewBudgets, checkMobilePreviewDependencies, checkMobilePreviewPath, mobilePreviewDirectory,
	mobilePreviewEntryPoint, mobilePreviewManifestName, mobilePreviewPlugin, mobilePreviewQuality,
	packageMobilePreviewExtensions, prepareMobilePreview, readMobilePreviewExtensions,
	writeMobilePreviewManifest, type MobilePreviewAsset,
} from '../mobilePreview.ts';
import { getBundleOptions } from '../bundle.ts';
import { getBootstrapEntryPointsForTarget } from '../../lib/esbuild.ts';
import { getResourcePaths } from '../resources.ts';
import policy from '../mobilePreviewPolicy.json' with { type: 'json' };
import packageJson from '../../../package.json' with { type: 'json' };

const entrypoints = {
	workbench: `out/${mobilePreviewEntryPoint}.js`,
	stylesheet: `out/${mobilePreviewEntryPoint}.css`,
	nls: 'out/nls.messages.js',
};
const build = { commit: '0123456789abcdef0123456789abcdef01234567', version: '1.0.0', date: '2026-10-05T00:00:00Z', quality: 'dev' as const };

async function createFixture(t: TestContext) {
	const directory = path.resolve(import.meta.dirname, '../../../.build/mobile-preview-tests');
	await fs.mkdir(directory, { recursive: true });
	// npm 11 redacts UUID path segments even in --parseable dependency output.
	const root = await fs.mkdtemp(path.join(directory, 'fixture-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const write = async (file: string, contents: string) => {
		await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await fs.writeFile(path.join(root, file), contents);
	};
	const preview = path.join(root, mobilePreviewDirectory);
	const out = `${mobilePreviewDirectory}/out`;
	return { root, preview, out, write };
}

function asset(file: string, gzipBytes = 1): MobilePreviewAsset {
	return { path: file, bytes: gzipBytes, gzipBytes, sha256: '0'.repeat(64) };
}

suite('isolated mobile preview', () => {
	test('preview bootstrap excludes native entries without changing standard targets', () => {
		assert.deepStrictEqual(['desktop', 'server', 'server-web', 'web', 'mobile-preview'].map(target =>
			getBootstrapEntryPointsForTarget(target as Parameters<typeof getBootstrapEntryPointsForTarget>[0])), [
			['main', 'mainImpl', 'cli', 'bootstrap-fork'],
			['server-main', 'server-cli', 'bootstrap-fork'],
			['server-main', 'server-cli', 'bootstrap-fork'],
			[],
			[],
		]);
	});

	test('refuses alternate output paths before changing any files', async t => {
		const { root, write } = await createFixture(t);
		await write('out/keep', 'normal output');
		for (const out of ['out', 'out-build', 'out-vscode-web', '.', '../out', `${mobilePreviewDirectory}/out/../other`]) {
			await assert.rejects(prepareMobilePreview(root, out), /output must be/);
		}
		assert.equal(await fs.readFile(path.join(root, 'out/keep'), 'utf8'), 'normal output');
	});

	test('refuses an existing directory without its ownership marker', async t => {
		const { root, out, write } = await createFixture(t);
		await write(`${mobilePreviewDirectory}/unrelated.txt`, 'keep');
		await assert.rejects(prepareMobilePreview(root, out), /unowned/);
		assert.equal(await fs.readFile(path.join(root, mobilePreviewDirectory, 'unrelated.txt'), 'utf8'), 'keep');
	});

	test('does not follow a symlinked ownership marker', { skip: process.platform === 'win32' ? 'File symlinks require elevated privileges' : false }, async t => {
		const { root, out, preview, write } = await createFixture(t);
		await write('marker.json', '{"schemaVersion":1,"kind":"sessions-mobile-preview"}');
		await fs.mkdir(preview);
		await fs.symlink(path.join(root, 'marker.json'), path.join(preview, '.mobile-preview-build.json'));
		await assert.rejects(prepareMobilePreview(root, out), /unowned/);
		assert.equal(await fs.readFile(path.join(root, 'marker.json'), 'utf8'), '{"schemaVersion":1,"kind":"sessions-mobile-preview"}');
	});

	for (const location of ['', 'out', 'node_modules', 'extensions']) {
		test(`refuses a symlink at the ${location || 'package root'} boundary`, async t => {
			const { root, out, preview } = await createFixture(t);
			const other = path.join(root, 'elsewhere');
			await fs.mkdir(other);
			if (location) {
				await prepareMobilePreview(root, out);
			}
			await fs.symlink(other, path.join(preview, location), 'junction');
			await assert.rejects(prepareMobilePreview(root, out), /regular directory/);
		});
	}

	test('invalidates completed output before a rebuild and clears only owned libraries', async t => {
		const { root, out, write, preview } = await createFixture(t);
		const release = await prepareMobilePreview(root, out);
		await write(`${mobilePreviewDirectory}/${mobilePreviewManifestName}`, '{}');
		await write(`${mobilePreviewDirectory}/node_modules/old.js`, 'old');
		await write(`${mobilePreviewDirectory}/extensions/old/package.json`, '{}');
		await write('out-build/nls.messages.json', 'original');
		await release();
		const releaseRebuild = await prepareMobilePreview(root, out);
		await releaseRebuild();
		assert.deepStrictEqual({
			contents: (await fs.readdir(preview)).sort(),
			normalNls: await fs.readFile(path.join(root, 'out-build/nls.messages.json'), 'utf8'),
		}, { contents: ['.mobile-preview-build.json'], normalNls: 'original' });
	});

	test('concurrent builds cannot invalidate each other or publish mixed artifacts', async t => {
		const { root, out, write, preview } = await createFixture(t);
		const release = await prepareMobilePreview(root, out);
		await write(`${mobilePreviewDirectory}/${mobilePreviewManifestName}`, 'first build');
		await assert.rejects(prepareMobilePreview(root, out), /build lock/);
		assert.equal(await fs.readFile(path.join(preview, mobilePreviewManifestName), 'utf8'), 'first build');
		await release();
		const releaseNext = await prepareMobilePreview(root, out);
		await release();
		await assert.rejects(prepareMobilePreview(root, out), /build lock/);
		await releaseNext();
		await assert.rejects(fs.access(path.join(preview, mobilePreviewManifestName)), { code: 'ENOENT' });
	});

	test('blocks full entries, native code, test fixtures and unreviewed transitive contributions', () => {
		for (const file of [
			'src/vs/sessions/sessions.common.main.ts',
			'src/vs/workbench/workbench.web.main.internal.ts',
			'src/vs/base/node/terminal.ts',
			'src/vs/sessions/electron-browser/sessions.ts',
			'src/vs/sessions/test/web.test.ts',
			'src/vs/workbench/contrib/newFeature/browser/newFeature.contribution.ts',
			'src\\vs\\sessions\\contrib\\chat\\browser\\chat.desktop.contribution.ts',
		]) {
			assert.throws(() => checkMobilePreviewDependencies([file]), /boundary failed/);
		}
		assert.deepStrictEqual(checkMobilePreviewDependencies([
			'src/vs/workbench/contrib/chat/common/model/chatModel.ts',
			'src/vs/sessions/contrib/mobile/browser/mobile.contribution.ts',
		]), ['src/vs/sessions/contrib/mobile/browser/mobile.contribution.ts']);
	});

	test('dependency checks inspect transitive esbuild inputs, not just entry imports', async t => {
		const { root, write } = await createFixture(t);
		await write('src/entry.ts', 'import \'./bridge.js\';');
		await write('src/bridge.ts', 'import \'./vs/sessions/contrib/accidental/browser/accidental.contribution.js\';');
		await write('src/vs/sessions/contrib/accidental/browser/accidental.contribution.ts', 'console.log("unexpected registration");');
		await assert.rejects(esbuild.build({
			...getBundleOptions(true, 'neutral'),
			absWorkingDir: root, entryPoints: ['src/entry.ts'], outfile: path.join(root, 'out/entry.js'),
			metafile: true, plugins: [mobilePreviewPlugin(root)], logLevel: 'silent',
		}), /Unreviewed contribution/);
	});

	test('the measured contribution baseline has no duplicates or forbidden modules', () => {
		assert.equal(new Set(policy.contributions).size, policy.contributions.length);
		assert.deepStrictEqual(checkMobilePreviewDependencies(policy.contributions), [...policy.contributions].sort());
	});

	test('copied runtime libraries are repository dependencies, not implicit installs', () => {
		assert.deepStrictEqual(Object.keys(policy.libraries).filter(name => !Object.hasOwn(packageJson.dependencies, name)), []);
	});

	test('quality defaults to dev locally but requires the matching product mixin in CI', () => {
		assert.deepStrictEqual([
			mobilePreviewQuality(undefined),
			mobilePreviewQuality('insider', 'insider'),
			mobilePreviewQuality('stable', 'stable'),
			mobilePreviewQuality('exploration', 'exploration'),
		], ['dev', 'insider', 'stable', 'exploration']);
		assert.throws(() => mobilePreviewQuality('preview'), /Invalid.*quality/);
		assert.throws(() => mobilePreviewQuality(undefined, 'insider'), /matching product.json mixin/);
	});

	test('artifact paths support source grammar filenames without URL escapes or traversal', () => {
		checkMobilePreviewPath('extensions/javascript/syntaxes/Regular Expressions (JavaScript).tmLanguage');
		for (const file of ['../outside', 'out/../outside', 'out//file', 'out/file.', 'out/file ', 'out/%20file', 'out/file?query']) {
			assert.throws(() => checkMobilePreviewPath(file), /Invalid mobile preview relative path/);
		}
	});

	test('curated extensions contain only GitHub authentication and static language/theme contributions', async () => {
		const root = path.resolve(import.meta.dirname, '../../..');
		const manifests = await Promise.all(policy.extensions.map(async name => JSON.parse(await fs.readFile(path.join(root, 'extensions', name, 'package.json'), 'utf8'))));
		assert.deepStrictEqual({
			code: manifests.filter(manifest => manifest.main || manifest.browser).map(manifest => manifest.name),
			required: manifests.filter(manifest => ['github-authentication', 'theme-defaults', 'vscode-theme-seti'].includes(manifest.name)).map(manifest => `${manifest.publisher}.${manifest.name}`).sort(),
		}, { code: ['github-authentication'], required: ['vscode.github-authentication', 'vscode.theme-defaults', 'vscode.vscode-theme-seti'] });
	});

	test('extension packaging builds fresh browser output and preserves explicit dependencies and licenses', async t => {
		const { root, preview, write } = await createFixture(t);
		await write('LICENSE.txt', 'MIT license');
		await write('extensions/auth/package.json', JSON.stringify({
			name: 'auth', publisher: 'vscode', version: '1.0.0', license: 'MIT', engines: { vscode: '^1.0.0' },
			main: './out/extension.js', browser: './dist/browser/extension.js',
			activationEvents: [], extensionDependencies: ['vscode.grammar'], scripts: { build: 'unused' }, dependencies: { unused: '*' },
		}));
		await write('extensions/auth/.vscodeignore', 'esbuild.browser.mts\nout/**\n');
		await write('extensions/auth/esbuild.browser.mts', `
			import { mkdir, writeFile } from 'node:fs/promises';
			import path from 'node:path';
			const output = path.join(process.argv[process.argv.indexOf('--outputRoot') + 1], 'browser');
			await mkdir(output, { recursive: true });
			await writeFile(path.join(output, 'extension.js'), 'fresh browser build');
		`);
		await write('extensions/auth/dist/browser/extension.js', 'stale watcher output');
		await write('extensions/auth/dist/node/extension.js', 'desktop output');
		await write('extensions/auth/out/unrelated.js', 'old output');
		await write('extensions/auth/ThirdPartyNotices.txt', 'Extension notices');
		await write('extensions/auth/node_modules/unused/package.json', '{"name":"unused","version":"1.0.0","license":"MIT"}');
		await write('extensions/auth/node_modules/unused/LICENSE', 'Dependency license text');
		await write('extensions/grammar/package.json', '{"name":"grammar","publisher":"vscode","version":"1.0.0","license":"MIT","engines":{"vscode":"^1.0.0"}}');
		await packageMobilePreviewExtensions(root, ['auth', 'grammar']);
		const manifest = JSON.parse(await fs.readFile(path.join(preview, 'extensions/auth/package.json'), 'utf8'));
		assert.deepStrictEqual({
			manifest,
			browser: await fs.readFile(path.join(preview, 'extensions/auth/dist/browser/extension.js'), 'utf8'),
			license: await fs.readFile(path.join(preview, 'extensions/auth/LICENSE.txt'), 'utf8'),
			directories: (await fs.readdir(path.join(preview, 'extensions/auth/dist'))).sort(),
			checkout: await fs.readFile(path.join(root, 'extensions/auth/dist/browser/extension.js'), 'utf8'),
			notices: await fs.readFile(path.join(preview, 'extensions/auth/ThirdPartyNotices.txt'), 'utf8'),
		}, {
			manifest: { name: 'auth', publisher: 'vscode', version: '1.0.0', license: 'MIT', engines: { vscode: '^1.0.0' }, browser: './dist/browser/extension.js', activationEvents: [], extensionDependencies: ['vscode.grammar'] },
			browser: 'fresh browser build', license: 'MIT license', directories: ['browser'], checkout: 'stale watcher output',
			notices: 'Extension notices\n\nunused@1.0.0\nLicense: MIT\n\nDependency license text\n',
		});
	});

	test('missing extension sources, browser build inputs and required dependencies fail explicitly', async t => {
		const { root, write } = await createFixture(t);
		await assert.rejects(packageMobilePreviewExtensions(root, ['missing']), /ENOENT/);
		await write('extensions/auth/package.json', '{"name":"auth","publisher":"vscode","version":"1.0.0","browser":"./dist/browser/extension.js"}');
		await assert.rejects(packageMobilePreviewExtensions(root, ['auth']), /esbuild.browser.mts/);
		await write('extensions/auth/package.json', '{"name":"auth","publisher":"vscode","version":"1.0.0","extensionDependencies":["vscode.missing"]}');
		await assert.rejects(packageMobilePreviewExtensions(root, ['auth']), /Required extension vscode.missing/);
	});

	test('packaged theme fonts and browser entries cannot point outside their extension', async t => {
		const { preview, write } = await createFixture(t);
		const manifest = { name: 'theme', publisher: 'vscode', version: '1.0.0', contributes: { iconThemes: [{ path: './icons/theme.json' }] } };
		await write(`${mobilePreviewDirectory}/extensions/theme/package.json`, JSON.stringify(manifest));
		await write(`${mobilePreviewDirectory}/extensions/theme/icons/theme.json`, '{"fonts":[{"src":[{"path":"font.woff"}]}]}');
		const assets = new Set(['extensions/theme/package.json', 'extensions/theme/icons/theme.json']);
		await assert.rejects(readMobilePreviewExtensions(preview, assets), /Missing packaged extension resource: .*font.woff/);
		await write(`${mobilePreviewDirectory}/extensions/theme/package.json`, JSON.stringify({ ...manifest, browser: '../../../checkout.js' }));
		await assert.rejects(readMobilePreviewExtensions(preview, assets), /Invalid mobile preview relative path|Missing packaged extension resource/);
	});

	test('retained terminal-output rendering has every string-loaded xterm runtime dependency', async () => {
		const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
		const libraries: Record<string, readonly string[]> = policy.libraries;
		const missing: string[] = [];
		let found = 0;
		for (const file of [
			'src/vs/workbench/contrib/terminal/browser/terminalInstance.ts',
			'src/vs/workbench/contrib/terminal/browser/xterm/xtermAddonImporter.ts',
		]) {
			const source = ts.createSourceFile(file, await fs.readFile(path.join(repositoryRoot, file), 'utf8'), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node) => {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'importAMDNodeModule') {
					const [module, resource] = node.arguments;
					if (module && resource && ts.isStringLiteral(module) && ts.isStringLiteral(resource) && module.text.startsWith('@xterm/')) {
						found++;
						if (!libraries[module.text]?.includes(resource.text)) {
							missing.push(`${module.text}/${resource.text}`);
						}
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
		assert.ok(found > 0, 'Inspect the retained output renderer if its runtime loading pattern changes');
		assert.deepStrictEqual(missing, []);
	});

	test('new bare runtime imports cannot rely on the normal workbench import map', async t => {
		const { root, write } = await createFixture(t);
		await write('src/entry.ts', 'import { show } from \'desktop-widget\'; show();');
		await assert.rejects(esbuild.build({
			...getBundleOptions(true, 'neutral'),
			absWorkingDir: root, entryPoints: ['src/entry.ts'], outfile: path.join(root, 'out/entry.js'),
			metafile: true, plugins: [mobilePreviewPlugin(root)], logLevel: 'silent',
		}), /Unpackaged mobile preview dependency: desktop-widget/);
	});

	test('budgets accept the exact limit and fail one byte over it', () => {
		const assets = [asset(entrypoints.workbench, 10), asset(entrypoints.stylesheet, 4), asset(entrypoints.nls, 3), asset('node_modules/runtime.js', 5), asset('extensions/example/runtime.js', 7)];
		const budgets = { workbenchJavaScriptGzipBytes: 10, workbenchCssGzipBytes: 4, initialGzipBytes: 17, runtimeGzipBytes: 22, extensionsGzipBytes: 7 };
		assert.deepStrictEqual(checkMobilePreviewBudgets(assets, budgets), { initialGzipBytes: 17, runtimeGzipBytes: 22, extensionsGzipBytes: 7 });
		for (const key of Object.keys(budgets) as (keyof typeof budgets)[]) {
			assert.throws(() => checkMobilePreviewBudgets(assets, { ...budgets, [key]: budgets[key] - 1 }), new RegExp(key));
		}
	});

	test('debug maps and localization metadata are inventoried but not counted as runtime downloads', () => {
		assert.deepStrictEqual(checkMobilePreviewBudgets([
			...Object.values(entrypoints).map(file => asset(file)),
			asset('out/nls.metadata.json', 100000000), asset(`${entrypoints.workbench}.map`, 100000000),
		]), { initialGzipBytes: 3, runtimeGzipBytes: 3, extensionsGzipBytes: 0 });
		assert.throws(() => checkMobilePreviewBudgets([asset(entrypoints.workbench)]), /missing .*\.css/);
	});

	test('publishes only a completed package with its own asset and localization inventory', async t => {
		const { root, out, preview, write } = await createFixture(t);
		await prepareMobilePreview(root, out);
		const files: Record<string, string> = {
			[entrypoints.workbench]: 'export const example = 1;',
			[entrypoints.stylesheet]: '.mobile-workbench { display: block; }',
			[entrypoints.nls]: 'globalThis._VSCODE_NLS_MESSAGES=["Mobile"];',
			'out/nls.messages.json': '["Mobile"]',
			'out/nls.keys.json': '[["vs/sessions/contrib/mobile/browser/example",["title"]]]',
			'out/nls.metadata.json': '{"keys":{},"messages":{}}',
			'node_modules/example/runtime.js': 'example();',
			'extensions/example/package.json': '{"name":"example","publisher":"vscode","version":"1.0.0"}',
		};
		for (const [file, contents] of Object.entries(files)) {
			await write(`${mobilePreviewDirectory}/${file}`, contents);
		}
		await write('out-build/nls.messages.json', '["Normal"]');
		const manifest = await writeMobilePreviewManifest(root, build, []);
		assert.deepStrictEqual({
			schemaVersion: manifest.schemaVersion, kind: manifest.kind, entrypoints: manifest.entrypoints,
			preload: manifest.preload, extensions: manifest.extensions, normalNls: await fs.readFile(path.join(root, 'out-build/nls.messages.json'), 'utf8'),
			assets: manifest.assets, stored: JSON.parse(await fs.readFile(path.join(preview, mobilePreviewManifestName), 'utf8')),
		}, {
			schemaVersion: 2, kind: 'sessions-mobile-preview', entrypoints, preload: Object.values(entrypoints),
			extensions: [{ id: 'vscode.example', path: 'extensions/example' }], normalNls: '["Normal"]',
			assets: Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([file, contents]) => ({
				path: file, bytes: Buffer.byteLength(contents), gzipBytes: gzipSync(contents).byteLength,
				sha256: createHash('sha256').update(contents).digest('hex'),
			})),
			stored: manifest,
		});
	});

	test('an unresolved localization placeholder prevents publication', async t => {
		const { root, out, preview, write } = await createFixture(t);
		await prepareMobilePreview(root, out);
		await write(`${out}/broken.js`, 'localize("%%NLS:example:title%%", "Title");');
		await fs.mkdir(path.join(preview, 'node_modules'));
		await assert.rejects(writeMobilePreviewManifest(root, build, []), /Unresolved localization/);
		await assert.rejects(fs.access(path.join(preview, mobilePreviewManifestName)), { code: 'ENOENT' });
	});

	test('does not publish a package containing an asset symlink', { skip: process.platform === 'win32' ? 'File symlinks require elevated privileges' : false }, async t => {
		const { root, out, preview, write } = await createFixture(t);
		await prepareMobilePreview(root, out);
		await write('external.js', 'outside();');
		await fs.mkdir(path.join(preview, 'out'));
		await fs.symlink(path.join(root, 'external.js'), path.join(preview, 'out', 'linked.js'));
		await assert.rejects(writeMobilePreviewManifest(root, build, []), /Symlinks are not allowed/);
		await assert.rejects(fs.access(path.join(preview, mobilePreviewManifestName)), { code: 'ENOENT' });
	});

	test('preview resources keep worker frames and accessibility audio without shipping a full workbench shell', async t => {
		const { root, write } = await createFixture(t);
		for (const file of [
			'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
			'vs/platform/accessibilitySignal/browser/media/error.mp3',
			'vs/code/browser/workbench/workbench.html',
			'vs/sessions/browser/mobile/media/mobileWorkbench.css',
			'vs/sessions/test/fixture.html',
		]) {
			await write(file, '');
		}
		assert.deepStrictEqual(await getResourcePaths(root, 'mobile-preview'), [
			'vs/platform/accessibilitySignal/browser/media/error.mp3',
			'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
		]);
	});
});
