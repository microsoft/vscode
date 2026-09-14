/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { getLineInfo, parse, tokTypes } from 'acorn';
import { SourceMapConsumer, SourceMapGenerator, type RawSourceMap } from 'source-map';
import * as esbuild from 'esbuild';
import { escapeJavaScriptBuildOutput, escapeJavaScriptOutput } from '../escapeJavaScriptOutput.ts';
import { adjustSourceMap } from '../../next/private-to-property.ts';
import { runBuild } from '../../../extensions/esbuild-common.mts';

async function fixture(context: TestContext): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-unicode-output-'));
	context.after(() => fs.rm(directory, { recursive: true, force: true }));
	return directory;
}

function identityMap(code: string): RawSourceMap {
	const generator = new SourceMapGenerator({ file: 'output.js' });
	generator.setSourceContent('input.js', code);
	parse(code, {
		ecmaVersion: 'latest',
		onToken(token) {
			if (token.type !== tokTypes.eof) {
				const position = getLineInfo(code, token.start);
				generator.addMapping({ generated: position, original: position, source: 'input.js' });
			}
		},
	});
	return JSON.parse(generator.toString());
}

function mappedMarker(code: string, map: RawSourceMap) {
	const consumer = new SourceMapConsumer(map);
	const marker = getLineInfo(code, code.indexOf('marker'));
	const original = consumer.originalPositionFor(marker);
	return {
		position: { line: original.line, column: original.column, source: original.source },
		source: consumer.sourceContentFor('input.js'),
	};
}

suite('escapeJavaScriptOutput', () => {
	test('processes nested JS variants but not assets, strings, or notices', async context => {
		const directory = await fixture(context);
		await fs.mkdir(path.join(directory, 'nested'));
		await fs.writeFile(path.join(directory, 'a.js'), 'const pattern=/\u2014/;');
		await fs.writeFile(path.join(directory, 'nested', 'b.mjs'), '/* \u03c0 */ const value=1;');
		await fs.writeFile(path.join(directory, 'nested', 'c.cjs'), 'module.exports=/\u6f22/;');
		await fs.writeFile(path.join(directory, 'asset.txt'), '\u6f22');
		await fs.writeFile(path.join(directory, 'protected.js'), '/*! \u6f22 */ const value=String.raw`\u6f22`;');
		const result = await escapeJavaScriptOutput(directory);
		assert.deepStrictEqual({
			result,
			again: await escapeJavaScriptOutput(directory),
			asset: await fs.readFile(path.join(directory, 'asset.txt'), 'utf8'),
			protected: await fs.readFile(path.join(directory, 'protected.js'), 'utf8'),
		}, {
			result: { files: 3, regularExpressions: 2, comments: 1 },
			again: { files: 0, regularExpressions: 0, comments: 0 },
			asset: '\u6f22',
			protected: '/*! \u6f22 */ const value=String.raw`\u6f22`;',
		});
	});

	for (const reference of ['', '\n//# sourceMappingURL=output.js.map', '\n//# sourceMappingURL=https://cdn.example/revision/output.js.map']) {
		test(`preserves ${reference || 'unlinked'} external source maps`, async context => {
			const directory = await fixture(context);
			const code = `const pattern=/\u2014/; const marker=1;${reference}`;
			const original = identityMap(code);
			await fs.writeFile(path.join(directory, 'output.js'), code);
			await fs.writeFile(path.join(directory, 'output.js.map'), JSON.stringify(original));
			await escapeJavaScriptOutput(directory);
			const output = await fs.readFile(path.join(directory, 'output.js'), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.readFile(path.join(directory, 'output.js.map'), 'utf8'));
			assert.deepStrictEqual(mappedMarker(output, map), mappedMarker(code, original));
		});
	}

	test('preserves terminal inline base64 source maps', async context => {
		const directory = await fixture(context);
		const code = 'const pattern=/\u2014/; const marker=1;';
		const original = identityMap(code);
		const inline = `data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(original)).toString('base64')}`;
		await fs.writeFile(path.join(directory, 'output.js'), `${code}\n//# sourceMappingURL=${inline}\n`);
		await escapeJavaScriptOutput(directory);
		const output = await fs.readFile(path.join(directory, 'output.js'), 'utf8');
		const data = /base64,(?<data>[a-z0-9+/=]+)/i.exec(output)?.groups?.data;
		assert.ok(data);
		const map: RawSourceMap = JSON.parse(Buffer.from(data, 'base64').toString());
		assert.deepStrictEqual(mappedMarker(output, map), mappedMarker(code, original));
	});

	test('rejects non-terminal inline maps without writing changed JavaScript', async context => {
		const directory = await fixture(context);
		const code = 'const pattern=/\u2014/;';
		const original = identityMap(code);
		const input = `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(original)).toString('base64')}\nconst marker=1;`;
		await fs.writeFile(path.join(directory, 'output.js'), input);
		await assert.rejects(escapeJavaScriptOutput(directory), /non-terminal/);
		assert.strictEqual(await fs.readFile(path.join(directory, 'output.js'), 'utf8'), input);
	});

	test('rejects a missing referenced map without writing changed JavaScript', async context => {
		const directory = await fixture(context);
		const input = 'const pattern=/\u2014/;\n//# sourceMappingURL=missing.js.map';
		await fs.writeFile(path.join(directory, 'output.js'), input);
		await assert.rejects(escapeJavaScriptOutput(directory), /Cannot preserve the source map/);
		assert.strictEqual(await fs.readFile(path.join(directory, 'output.js'), 'utf8'), input);
	});

	test('rejects map paths outside the output root', async context => {
		const directory = await fixture(context);
		await fs.writeFile(path.join(directory, 'output.js'), 'const pattern=/\u2014/;\n//# sourceMappingURL=../outside.map');
		await assert.rejects(escapeJavaScriptOutput(directory), /outside its output directory/);
	});

	test('fails on missing output directories', async context => {
		const directory = await fixture(context);
		await assert.rejects(escapeJavaScriptOutput(path.join(directory, 'missing')), /ENOENT/);
	});

	test('checks only the selected build outputs, not stale sibling files', async context => {
		const directory = await fixture(context);
		const source = path.join(directory, 'input.js');
		const output = path.join(directory, 'out');
		await fs.writeFile(source, 'const pattern=/\u2014/;');
		await fs.mkdir(output);
		const stale = 'const pattern=/\u6f22/;\n//# sourceMappingURL=missing.map';
		await fs.writeFile(path.join(output, 'stale.js'), stale);
		const result = await esbuild.build({
			entryPoints: [source], outdir: output, metafile: true, sourcemap: true,
		});
		await escapeJavaScriptBuildOutput(output, [result]);
		assert.deepStrictEqual({
			wide: /[^\x00-\xFF]/.test(await fs.readFile(path.join(output, 'input.js'), 'utf8')),
			stale: await fs.readFile(path.join(output, 'stale.js'), 'utf8'),
		}, { wide: false, stale });
	});

	test('an explicit standalone output does not rewrite neighboring transpiled modules', async context => {
		const directory = await fixture(context);
		const output = path.join(directory, 'devTunnelsModule.js');
		const sibling = path.join(directory, 'remoteHost.js');
		const stale = 'const pattern=/\u03c0/;\n//# sourceMappingURL=missing.map';
		await fs.writeFile(output, 'const pattern=/\u2014/;');
		await fs.writeFile(sibling, stale);
		const result = await escapeJavaScriptOutput(directory, [output]);
		assert.deepStrictEqual({
			files: result.files,
			sibling: await fs.readFile(sibling, 'utf8'),
			wide: /[^\x00-\xFF]/.test(await fs.readFile(output, 'utf8')),
		}, { files: 1, sibling: stale, wide: false });
	});

	test('the shared extension emitter normalizes minified and deliberately unminified outputs', async context => {
		const directory = await fixture(context);
		const source = path.join(directory, 'input.js');
		await fs.writeFile(source, '/* \u2014 */ const pattern=/\u6f22/; console.log(pattern);');
		await Promise.all([false, true].map(minify => runBuild({
			srcDir: directory,
			outdir: path.join(directory, String(minify)),
			entryPoints: [source],
		}, { minify, sourcemap: 'linked', sourcesContent: true }, [])));
		const outputs = await Promise.all([false, true].map(minify => fs.readFile(path.join(directory, String(minify), 'input.js'), 'utf8')));
		assert.deepStrictEqual(outputs.map(output => /[^\x00-\xFF]/.test(output)), [false, false]);
	});

	test('a nested worker emit composes maps instead of copying a dangling map reference', async context => {
		const directory = await fixture(context);
		const extension = path.join(directory, 'extension.js');
		const worker = path.join(directory, 'worker.js');
		const outdir = path.join(directory, 'dist');
		const workerCode = '/* \u2014 */ const marker=1; console.log(marker);\n//# sourceMappingURL=missing.js.map';
		await fs.writeFile(extension, 'console.log(/\u6f22/);');
		await fs.writeFile(worker, workerCode);
		await runBuild({
			srcDir: directory, outdir, entryPoints: { extension },
		}, { sourcemap: 'linked' }, [], async () => {
			await runBuild({
				srcDir: directory, outdir, entryPoints: { serverWorkerMain: worker },
			}, { bundle: false, minify: false, platform: 'neutral', sourcemap: 'linked', sourcesContent: true }, []);
		});
		const output = await fs.readFile(path.join(outdir, 'serverWorkerMain.js'), 'utf8');
		const map: RawSourceMap = JSON.parse(await fs.readFile(path.join(outdir, 'serverWorkerMain.js.map'), 'utf8'));
		assert.deepStrictEqual({
			wide: /[^\x00-\xFF]/.test(output),
			mapReference: output.includes('sourceMappingURL=serverWorkerMain.js.map'),
			originalSource: map.sourcesContent,
		}, { wide: false, mapReference: true, originalSource: [workerCode] });
	});

	for (const newline of ['\r', '\r\n', '\u2028', '\u2029']) {
		test(`preserves source-map lines with ${JSON.stringify(newline)}`, async context => {
			const directory = await fixture(context);
			const code = `/* a${newline}\u2014 */ const marker=1;`;
			const original = identityMap(code);
			await fs.writeFile(path.join(directory, 'output.js'), code);
			await fs.writeFile(path.join(directory, 'output.js.map'), JSON.stringify(original));
			await escapeJavaScriptOutput(directory);
			const output = await fs.readFile(path.join(directory, 'output.js'), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.readFile(path.join(directory, 'output.js.map'), 'utf8'));
			assert.deepStrictEqual(mappedMarker(output, map), mappedMarker(code, original));
		});
	}

	test('handles CRLF split across source-map edit segments', () => {
		const code = '/* a\r\nb */ const marker=1;';
		const original = identityMap(code);
		const start = code.indexOf('\n');
		const map = adjustSourceMap(original, code, [{ start, end: start + 1, newText: '\n' }]);
		assert.deepStrictEqual(mappedMarker(code, map), mappedMarker(code, original));
	});
});
