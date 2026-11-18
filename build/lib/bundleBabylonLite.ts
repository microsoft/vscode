/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageMetadata {
	readonly name: string;
	readonly version: string;
	readonly license: string;
	readonly repository: {
		readonly url: string;
	};
	readonly babylonLiteRelease: {
		readonly sourceVersion: string;
	};
}

interface BundleDefinition {
	readonly fileName: string;
	readonly packageName: string;
	readonly entry: string;
	readonly declarations: string;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(repositoryRoot, 'src/vs/base/browser/babylonLite');
const bundles: readonly BundleDefinition[] = [
	{
		fileName: 'lite-webgpu',
		packageName: '@babylonjs/lite',
		entry: `export {
	addSprite2DIndex,
	clearSprite2DLayer,
	createEngine,
	createSprite2DLayer,
	createSpriteAtlasFromFrames,
	createSpriteRenderer,
	disposeEngine,
	disposeSpriteAtlas,
	disposeSpriteRenderer,
	onEngineDeviceLost,
	onEngineGpuError,
	registerSpriteRenderer,
	renderFrame,
	setEngineSize,
} from '@babylonjs/lite';`,
		declarations: `export {
	addSprite2DIndex,
	clearSprite2DLayer,
	createEngine,
	createSprite2DLayer,
	createSpriteAtlasFromFrames,
	createSpriteRenderer,
	disposeEngine,
	disposeSpriteAtlas,
	disposeSpriteRenderer,
	onEngineDeviceLost,
	onEngineGpuError,
	registerSpriteRenderer,
	renderFrame,
	setEngineSize,
} from '@babylonjs/lite';
`,
	},
];

async function readPackageMetadata(packageName: string): Promise<PackageMetadata> {
	const packagePath = path.join(repositoryRoot, 'node_modules', ...packageName.split('/'), 'package.json');
	return JSON.parse(await readFile(packagePath, 'utf8')) as PackageMetadata;
}

async function bundle(definition: BundleDefinition, metadata: PackageMetadata): Promise<void> {
	const result = await esbuild.build({
		stdin: {
			contents: definition.entry,
			resolveDir: repositoryRoot,
			sourcefile: `${definition.fileName}.entry.js`,
			loader: 'js',
		},
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		minify: true,
		treeShaking: true,
		pure: ['console.log'],
		legalComments: 'none',
		write: false,
		banner: {
			js: `/*! @license ${metadata.name} ${metadata.version} | Apache-2.0 | https://github.com/BabylonJS/Babylon-Lite */`,
		},
	});
	if (result.outputFiles.length !== 1) {
		throw new Error(`Expected one ${definition.fileName} output file, received ${result.outputFiles.length}.`);
	}
	await writeFile(path.join(outputDirectory, `${definition.fileName}.js`), result.outputFiles[0].contents);
	await writeFile(path.join(outputDirectory, `${definition.fileName}.d.ts`), definition.declarations);
}

async function main(): Promise<void> {
	await mkdir(outputDirectory, { recursive: true });
	const metadata = await Promise.all(bundles.map(definition => readPackageMetadata(definition.packageName)));
	for (let index = 0; index < bundles.length; index++) {
		await bundle(bundles[index], metadata[index]);
	}

	const license = await readFile(path.join(repositoryRoot, 'node_modules/@babylonjs/lite/LICENSE'));
	await Promise.all(bundles.map(definition => writeFile(path.join(outputDirectory, `${definition.fileName}.license.txt`), license)));

	const registrations = metadata.map(packageMetadata => ({
		component: {
			type: 'git',
			git: {
				name: packageMetadata.name,
				repositoryUrl: packageMetadata.repository.url.replace(/\.git$/, ''),
				commitHash: packageMetadata.babylonLiteRelease.sourceVersion,
			},
		},
		license: packageMetadata.license,
		version: packageMetadata.version,
	}));
	await writeFile(path.join(outputDirectory, 'cgmanifest.json'), `${JSON.stringify({ registrations, version: 1 }, null, '\t')}\n`);
}

await main();
