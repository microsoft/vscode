/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RenderManifestFixture {
	readonly fixtureId: string;
	readonly imagePath?: string;
}

interface RenderManifest {
	readonly fixtures: readonly RenderManifestFixture[];
	readonly [key: string]: unknown;
}

const componentFixturesDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(componentFixturesDir, '../..');
const projectPath = join(componentFixturesDir, 'component-explorer.json');
const cliEntry = join(repositoryRoot, 'node_modules/@vscode/component-explorer-cli/dist/index.js');
const outputDir = join(componentFixturesDir, '.screenshots/current');
const shardsDir = join(componentFixturesDir, '.screenshots/.render-shards');

const fixtureShards = [
	'^(?:chat/widget/|sessions/)',
	'^(?!(?:chat/widget/|sessions/))',
] as const;

async function renderShard(index: number, fixtureIdRegex: string): Promise<string> {
	const targetDir = join(shardsDir, String(index));
	const args = [
		cliEntry,
		'render',
		'--project', projectPath,
		'--fixture-id-regex', fixtureIdRegex,
		'--target', targetDir,
	];

	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn(process.execPath, args, {
			cwd: repositoryRoot,
			stdio: 'inherit',
			env: {
				...process.env,
				COMPONENT_EXPLORER_PORT_START: String(5123 + index * 100),
			},
		});
		child.on('error', reject);
		child.on('close', (code, signal) => {
			if (code === 0) {
				resolvePromise();
			} else {
				reject(new Error(`Fixture render shard ${index + 1} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
			}
		});
	});

	return targetDir;
}

async function readManifest(targetDir: string): Promise<RenderManifest> {
	const value = JSON.parse(await readFile(join(targetDir, 'manifest.json'), 'utf8')) as RenderManifest;
	if (!Array.isArray(value.fixtures)) {
		throw new Error(`Fixture render did not produce a valid manifest in ${targetDir}.`);
	}
	return value;
}

function metadataOf(manifest: RenderManifest): Omit<RenderManifest, 'fixtures'> {
	const { fixtures: _, ...metadata } = manifest;
	return metadata;
}

async function mergeShards(targetDirs: readonly string[]): Promise<void> {
	const manifests = await Promise.all(targetDirs.map(readManifest));
	const expectedMetadata = JSON.stringify(metadataOf(manifests[0]));
	for (const manifest of manifests.slice(1)) {
		if (JSON.stringify(metadataOf(manifest)) !== expectedMetadata) {
			throw new Error('Fixture render shards produced incompatible manifests.');
		}
	}

	const fixtureSources = new Map<RenderManifestFixture, string>();
	for (let index = 0; index < manifests.length; index++) {
		for (const fixture of manifests[index].fixtures) {
			fixtureSources.set(fixture, targetDirs[index]);
		}
	}
	const fixtures = [...fixtureSources.keys()].sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
	const fixtureIds = new Set<string>();
	await rm(outputDir, { recursive: true, force: true });
	await mkdir(outputDir, { recursive: true });

	for (let index = 0; index < fixtures.length; index++) {
		const fixture = fixtures[index];
		if (fixtureIds.has(fixture.fixtureId)) {
			throw new Error(`Fixture ${fixture.fixtureId} was rendered by multiple shards.`);
		}
		fixtureIds.add(fixture.fixtureId);

		if (fixture.imagePath) {
			const sourceDir = fixtureSources.get(fixture);
			if (!sourceDir) {
				throw new Error(`Unable to locate rendered image for ${fixture.fixtureId}.`);
			}
			const sourcePath = resolve(sourceDir, fixture.imagePath);
			if (isAbsolute(fixture.imagePath) || relative(sourceDir, sourcePath).startsWith('..')) {
				throw new Error(`Fixture ${fixture.fixtureId} produced an invalid image path.`);
			}
			const destinationPath = resolve(outputDir, fixture.imagePath);
			await mkdir(dirname(destinationPath), { recursive: true });
			await copyFile(sourcePath, destinationPath);
		}
	}

	const mergedManifest = { ...manifests[0], fixtures };
	await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(mergedManifest, null, '\t')}\n`);
}

async function main(): Promise<void> {
	await rm(shardsDir, { recursive: true, force: true });
	await mkdir(shardsDir, { recursive: true });

	const results = await Promise.allSettled(fixtureShards.map((fixtureIdRegex, index) => renderShard(index, fixtureIdRegex)));
	const failures = results.filter(result => result.status === 'rejected');
	if (failures.length > 0) {
		throw new AggregateError(failures.map(failure => failure.reason), 'One or more fixture render shards failed.');
	}

	const targetDirs = results.map(result => {
		if (result.status === 'rejected') {
			throw result.reason;
		}
		return result.value;
	});
	await mergeShards(targetDirs);
	await rm(shardsDir, { recursive: true, force: true });
	console.log(`Merged ${fixtureShards.length} render shards into ${outputDir}.`);
}

await main();
