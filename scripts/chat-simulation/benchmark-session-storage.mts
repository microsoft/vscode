/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run after build-fast: node --expose-gc scripts/chat-simulation/benchmark-session-storage.mts
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import type { URI as ResourceURI } from '../../src/vs/base/common/uri.js';
import type { IReadFileOptions } from '../../src/vs/platform/files/common/files.js';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const directory = path.join(root, '.build', 'binary-session-benchmark');
const baselineDirectory = path.join(root, '.build', 'binary-session-baseline');
const baseline = process.argv[2] === '--baseline' ? process.argv[3] : undefined;
const comparisonPath = process.argv[2] === '--compare' ? process.argv[3] : undefined;
if (baseline) {
	assert.match(baseline, /^[a-f0-9]{40}$/);
	const { transform } = createRequire(path.join(root, 'build', 'package.json'))('esbuild');
	const changed = execFileSync('git', ['--no-pager', 'diff', '--name-only', '--diff-filter=M', baseline, '--', '*.ts'], { cwd: root, encoding: 'utf8' })
		.trim().split('\n').filter(file => file.startsWith('src/vs/') && !file.includes('/test/'));
	const replacements = new Map<string, string>();
	for (const file of changed) {
		const source = execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' });
		const output = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
		const relative = file.slice('src/'.length).replace(/\.ts$/, '.js');
		const target = path.join(baselineDirectory, relative);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, output.code);
		replacements.set(path.join(root, 'out', relative), target);
	}
	registerHooks({
		resolve(specifier, context, nextResolve) {
			if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(baselineDirectory + path.sep).href)) {
				const absolute = fileURLToPath(new URL(specifier, context.parentURL));
				const relative = path.relative(baselineDirectory, absolute);
				const current = path.join(root, 'out', relative);
				return nextResolve(pathToFileURL(replacements.get(current) ?? current).href, context);
			}
			const resolved = nextResolve(specifier, context);
			if (resolved.url.startsWith('file:')) {
				const replacement = replacements.get(fileURLToPath(resolved.url));
				if (replacement) {
					return { ...resolved, url: pathToFileURL(replacement).href };
				}
			}
			return resolved;
		},
	});
}

const { Event } = await import('../../out/vs/base/common/event.js');
const { DisposableStore } = await import('../../out/vs/base/common/lifecycle.js');
const { revive } = await import('../../out/vs/base/common/marshalling.js');
const { URI } = await import('../../out/vs/base/common/uri.js');
const { FileService } = await import('../../out/vs/platform/files/common/fileService.js');
const { DiskFileSystemProvider } = await import('../../out/vs/platform/files/node/diskFileSystemProvider.js');
const { NullLogService } = await import('../../out/vs/platform/log/common/log.js');
const { InMemoryStorageService } = await import('../../out/vs/platform/storage/common/storage.js');
const { ChatModel } = await import('../../out/vs/workbench/contrib/chat/common/model/chatModel.js');
const { MarkdownString } = await import('../../out/vs/base/common/htmlContent.js');
const { ChatSessionStore } = await import('../../out/vs/workbench/contrib/chat/common/model/chatSessionStore.js');
const { createTestChatSessionResourceLocks } = await import('../../out/vs/workbench/contrib/chat/test/common/model/chatSessionResourceLocks.js');
const imageCount = 8;
const imageBytes = 2 * 1024 * 1024;
const runs = 5;

function fixture() {
	const images = Array.from({ length: imageCount }, (_, index) => {
		const bytes = Buffer.alloc(imageBytes);
		for (let offset = 0; offset < bytes.length; offset++) {
			bytes[offset] = (offset * 31 + index * 17) & 255;
		}
		return bytes.toString('base64');
	});
	return {
		version: 3,
		responderUsername: 'benchmark',
		sessionId: 'binary-benchmark',
		creationDate: 1,
		requests: images.map((data, index) => ({
			requestId: `request-${index}`,
			timestamp: index + 1,
			message: `Describe screenshot ${index}`,
			variableData: { variables: [{ kind: 'image', id: `image-${index}`, name: `screenshot-${index}.png`, mimeType: 'image/png', value: { $base64: data } }] },
			response: [{
				kind: 'toolInvocationSerialized', toolId: 'view_image', toolCallId: `tool-${index}`,
				invocationMessage: 'View image', isComplete: true,
				resultDetails: { input: '{}', output: [{ type: 'embed', mimeType: 'image/png', value: data }] },
			}],
			result: { metadata: { toolCallResults: { [`tool-${index}`]: { content: [{ $mid: 24, mimeType: 'image/png', data }] } } } },
		})),
		inputState: {
			attachments: images.map((data, index) => ({ kind: 'image', id: `draft-${index}`, name: `screenshot-${index}.png`, mimeType: 'image/png', value: { $base64: data } })),
			inputText: 'Compare these screenshots', mode: { id: 'agent', kind: 'agent' }, selections: [],
		},
	};
}

async function size(directory: string): Promise<number> {
	let total = 0;
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const child = path.join(directory, entry.name);
		total += entry.isDirectory() ? await size(child) : (await fs.stat(child)).size;
	}
	return total;
}

interface Measurements {
	saveMs: number;
	unchangedSaveMs: number;
	reloadMs: number;
	metadataBytes: number;
	persistedBytes: number;
	unchangedGrowthBytes: number;
	restoredUnchangedSaveMs: number;
	restoredUnchangedGrowthBytes: number;
	blobCount: number;
	binaryReadsAtHydration: number;
	retainedHeapBytes: number;
	retainedArrayBufferBytes: number;
	textSmallUnchangedSaveMs: number;
	textLargeUnchangedSaveMs: number;
}

async function measure(run: number): Promise<Measurements> {
	const runDirectory = path.join(directory, String(run));
	await fs.mkdir(runDirectory, { recursive: true });
	const disposables = new DisposableStore();
	const errors: string[] = [];
	const log = new NullLogService();
	log.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
	const files = disposables.add(new class extends FileService {
		readonly reads: string[] = [];
		override async readFile(resource: ResourceURI, options?: IReadFileOptions) {
			this.reads.push(resource.path);
			return super.readFile(resource, options);
		}
	}(log));
	disposables.add(files.registerProvider('file', disposables.add(new DiskFileSystemProvider(log))));
	const storage = disposables.add(new InMemoryStorageService());
	const store = disposables.add(new ChatSessionStore(
		files, { workspaceStorageHome: URI.file(runDirectory) }, log,
		{ getWorkspace: () => ({ id: 'workspace', folders: [{ uri: URI.file(root) }] }) },
		{ publicLog2() { } }, storage, { onWillShutdown: Event.None },
		{ defaultProfile: { globalStorageHome: URI.file(runDirectory) } },
		{ getValue() { return undefined; } }, { onDidEnterWorkspace: Event.None },
		{ prompt() { throw new Error('Serialization failed'); } }, { open() { throw new Error('Unexpected opener'); } },
		createTestChatSessionResourceLocks(),
	));
	const model = new ChatModel({ value: revive(fixture()) }, { initialLocation: 'panel', canUseTools: true }, log, { getDefaultAgent() { } }, {}, {});
	const start = performance.now();
	await store.storeSessions([model]);
	const saveMs = performance.now() - start;
	assert.deepEqual(errors, []);
	const folder = path.join(runDirectory, 'workspace', 'chatSessions');
	const metadataBytes = (await fs.stat(path.join(folder, 'binary-benchmark.jsonl'))).size;
	const persistedBytes = await size(folder);
	const unchangedStart = performance.now();
	for (let save = 0; save < 10; save++) {
		await store.storeSessions([model]);
	}
	const unchangedSaveMs = (performance.now() - unchangedStart) / 10;
	const unchangedGrowthBytes = await size(folder) - persistedBytes;
	let blobCount = 0;
	for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.endsWith('.resources')) {
			blobCount += (await fs.readdir(path.join(folder, entry.name))).filter(name => /^[a-f0-9]{64}$/.test(name)).length;
		}
	}
	model.dispose();
	globalThis.gc?.();
	const before = process.memoryUsage();
	files.reads.length = 0;
	const reloadStart = performance.now();
	const restored = await store.readSession('binary-benchmark');
	assert.ok(restored);
	const loaded = new ChatModel(restored, { initialLocation: 'panel', canUseTools: true }, log, { getDefaultAgent() { } }, {}, {});
	const reloadMs = performance.now() - reloadStart;
	const binaryReadsAtHydration = files.reads.filter(resource => resource.includes('.resources/')).length;
	globalThis.gc?.();
	const after = process.memoryUsage();
	assert.equal(loaded.getRequests().length, imageCount);
	assert.deepEqual(errors, []);
	const restoredSaveStart = performance.now();
	for (let save = 0; save < 10; save++) {
		await store.storeSessions([loaded]);
	}
	const restoredUnchangedSaveMs = (performance.now() - restoredSaveStart) / 10;
	const restoredUnchangedGrowthBytes = await size(folder) - persistedBytes;
	assert.deepEqual(errors, []);
	if (!baseline) {
		assert.deepEqual({ blobCount, binaryReadsAtHydration, unchangedGrowthBytes, restoredUnchangedGrowthBytes }, { blobCount: imageCount, binaryReadsAtHydration: 0, unchangedGrowthBytes: 0, restoredUnchangedGrowthBytes: 0 });
	}
	const textSaveTimes: number[] = [];
	for (const characters of [20 * 1024, 200 * 1024]) {
		const paragraph = '# Result\n\n- **Verified** output\n- Preserved behavior\n\n```typescript\nconst data: Record<string, unknown> = {};\nfunction parse(data: string) { return { data: JSON.parse(data) }; }\n```\n\n';
		const text = paragraph.repeat(Math.ceil(characters / paragraph.length)).slice(0, characters);
		const textModel = new ChatModel({
			value: {
				version: 3, sessionId: `text-save-${characters}`, creationDate: 1, responderUsername: '',
				requests: Array.from({ length: 300 }, (_, index) => ({ requestId: `text-${index}`, message: `request ${index}`, variableData: { variables: [] }, response: [{ value: text }], modelState: { value: 1 } })),
			},
		}, { initialLocation: 'panel', canUseTools: true, disableBackgroundKeepAlive: true }, log, { getDefaultAgent() { } }, {}, {});
		await store.storeSessions([textModel]);
		const unchanged = performance.now();
		for (let save = 0; save < 3; save++) {
			await store.storeSessions([textModel]);
		}
		textSaveTimes.push((performance.now() - unchanged) / 3);
		textModel.dispose();
	}
	assert.deepEqual(errors, []);
	const result = {
		saveMs, unchangedSaveMs, reloadMs, metadataBytes, persistedBytes, unchangedGrowthBytes,
		restoredUnchangedSaveMs, restoredUnchangedGrowthBytes, blobCount, binaryReadsAtHydration,
		retainedHeapBytes: after.heapUsed - before.heapUsed,
		retainedArrayBufferBytes: after.arrayBuffers - before.arrayBuffers,
		textSmallUnchangedSaveMs: textSaveTimes[0],
		textLargeUnchangedSaveMs: textSaveTimes[1],
	};
	loaded.dispose();
	disposables.dispose();
	await fs.rm(runDirectory, { recursive: true });
	return result;
}
const results: Measurements[] = [];
for (let run = 0; run < runs; run++) {
	results.push(await measure(run));
}
await fs.rmdir(directory);
if (baseline) {
	await fs.rm(baselineDirectory, { recursive: true });
}
const streaming: { chunkMs: number; addRequestMs: number }[] = [];
for (let run = 0; run < runs; run++) {
	const requests = Array.from({ length: 300 }, (_, index) => ({
		requestId: `text-${index}`, message: `request ${index}`, variableData: { variables: [] },
		response: [{ value: 'x'.repeat(200 * 1024) }], modelState: { value: 1 },
	}));
	const log = new NullLogService();
	const model = new ChatModel({ value: { version: 3, sessionId: 'text-benchmark', creationDate: 1, responderUsername: '', requests } },
		{ initialLocation: 'panel', canUseTools: true, disableBackgroundKeepAlive: true }, log, { getDefaultAgent() { } }, {}, {});
	const adding = performance.now();
	const request = model.addRequest({ text: 'stream', parts: [] }, { variables: [] }, 0);
	const addRequestMs = performance.now() - adding;
	for (let index = 0; index < 60; index++) {
		model.acceptResponseProgress(request, {
			kind: 'toolInvocationSerialized', toolId: 'read', toolCallId: `read-${index}`, invocationMessage: 'Read',
			isComplete: true, resultDetails: { input: '{}', output: [{ type: 'embed', isText: true, value: 'z'.repeat(80 * 1024) }] },
		});
	}
	const streamingStart = performance.now();
	for (let chunk = 0; chunk < 500; chunk++) {
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(' word') });
	}
	streaming.push({ chunkMs: (performance.now() - streamingStart) / 500, addRequestMs });
	model.dispose();
}
const median = (key: keyof Measurements) => results.map(result => result[key]).sort((a, b) => a - b)[Math.floor(runs / 2)];
const keys = ['saveMs', 'unchangedSaveMs', 'restoredUnchangedSaveMs', 'reloadMs', 'metadataBytes', 'persistedBytes', 'unchangedGrowthBytes', 'restoredUnchangedGrowthBytes', 'blobCount', 'binaryReadsAtHydration', 'retainedHeapBytes', 'retainedArrayBufferBytes', 'textSmallUnchangedSaveMs', 'textLargeUnchangedSaveMs'] as const;
const report = {
	baseline, imageCount, imageBytes, uniquePayloadBytes: imageCount * imageBytes, copiesPerImage: 4, runs,
	median: Object.fromEntries(keys.map(key => [key, median(key)])),
	samples: results,
	textOnly: {
		historyTurns: 300, charactersPerHistoryTurn: 200 * 1024, toolCalls: 60, charactersPerTool: 80 * 1024, streamedChunks: 500,
		median: {
			chunkMs: streaming.map(result => result.chunkMs).sort((a, b) => a - b)[Math.floor(runs / 2)],
			addRequestMs: streaming.map(result => result.addRequestMs).sort((a, b) => a - b)[Math.floor(runs / 2)],
		},
		samples: streaming,
	},
};
if (comparisonPath) {
	const previous = JSON.parse(await fs.readFile(comparisonPath, 'utf8'));
	assert.ok(report.median.metadataBytes < previous.median.metadataBytes * 0.01, 'Metadata must remain below 1% of the measured baseline');
	for (const metric of ['textSmallUnchangedSaveMs', 'textLargeUnchangedSaveMs'] as const) {
		assert.ok(report.median[metric] <= previous.median[metric] * 2, `${metric} exceeded twice the measured baseline`);
	}
}
console.log(JSON.stringify(report, null, 2));
