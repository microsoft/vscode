/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import gulp from 'gulp';
import filter from 'gulp-filter';
import path from 'path';
import fs from 'fs';
import pump from 'pump';
import VinylFile from 'vinyl';
import * as bundle from './bundle';
import { gulpPostcss } from './postcss';
import esbuild from 'esbuild';
import sourcemaps from 'gulp-sourcemaps';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';

const REPO_ROOT_PATH = path.join(__dirname, '../..');

export interface IBundleESMTaskOpts {
	/**
	 * The folder to read files from.
	 */
	src: string;
	/**
	 * The entry points to bundle.
	 */
	entryPoints: Array<bundle.IEntryPoint | string>;
	/**
	 * Other resources to consider (svg, etc.)
	 */
	resources?: string[];
	/**
	 * File contents interceptor for a given path.
	 */
	fileContentMapper?: (path: string) => ((contents: string) => Promise<string> | string) | undefined;
	/**
	 * Allows to skip the removal of TS boilerplate. Use this when
	 * the entry point is small and the overhead of removing the
	 * boilerplate makes the file larger in the end.
	 */
	skipTSBoilerplateRemoval?: (entryPointName: string) => boolean;
}

const DEFAULT_FILE_HEADER = [
	'/*!--------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' *--------------------------------------------------------*/'
].join('\n');

function bundleESMTask(opts: IBundleESMTaskOpts): NodeJS.ReadWriteStream {
	const resourcesStream = es.through(); // this stream will contain the resources
	const bundlesStream = es.through(); // this stream will contain the bundled files

	const entryPoints = opts.entryPoints.map(entryPoint => {
		if (typeof entryPoint === 'string') {
			return { name: path.parse(entryPoint).name };
		}

		return entryPoint;
	});

	const allMentionedModules = new Set<string>();
	for (const entryPoint of entryPoints) {
		allMentionedModules.add(entryPoint.name);
		entryPoint.include?.forEach(allMentionedModules.add, allMentionedModules);
		entryPoint.exclude?.forEach(allMentionedModules.add, allMentionedModules);
	}

	const bundleAsync = async () => {
		const files: VinylFile[] = [];
		const tasks: Promise<any>[] = [];

		for (const entryPoint of entryPoints) {
			fancyLog(`Bundled entry point: ${ansiColors.yellow(entryPoint.name)}...`);

			// support for 'dest' via esbuild#in/out
			const dest = entryPoint.dest?.replace(/\.[^/.]+$/, '') ?? entryPoint.name;

			// banner contents
			const banner = {
				js: DEFAULT_FILE_HEADER,
				css: DEFAULT_FILE_HEADER
			};

			// TS Boilerplate
			if (!opts.skipTSBoilerplateRemoval?.(entryPoint.name)) {
				const tslibPath = path.join(require.resolve('tslib'), '../tslib.es6.js');
				banner.js += await fs.promises.readFile(tslibPath, 'utf-8');
			}

			const contentsMapper: esbuild.Plugin = {
				name: 'contents-mapper',
				setup(build) {
					build.onLoad({ filter: /\.js$/ }, async ({ path }) => {
						const contents = await fs.promises.readFile(path, 'utf-8');

						// TS Boilerplate
						let newContents: string;
						if (!opts.skipTSBoilerplateRemoval?.(entryPoint.name)) {
							newContents = bundle.removeAllTSBoilerplate(contents);
						} else {
							newContents = contents;
						}

						// File Content Mapper
						const mapper = opts.fileContentMapper?.(path.replace(/\\/g, '/'));
						if (mapper) {
							newContents = await mapper(newContents);
						}

						return { contents: newContents };
					});
				}
			};

			const externalOverride: esbuild.Plugin = {
				name: 'external-override',
				setup(build) {
					// We inline selected modules that are we depend on on startup without
					// a conditional `await import(...)` by hooking into the resolution.
					build.onResolve({ filter: /^minimist$/ }, () => {
						return { path: path.join(REPO_ROOT_PATH, 'node_modules', 'minimist', 'index.js'), external: false };
					});
				},
			};

			const task = esbuild.build({
				bundle: true,
				external: entryPoint.exclude,
				packages: 'external', // "external all the things", see https://esbuild.github.io/api/#packages
				platform: 'neutral', // makes esm
				format: 'esm',
				sourcemap: 'external',
				plugins: [contentsMapper, externalOverride],
				target: ['es2022'],
				loader: {
					'.ttf': 'file',
					'.svg': 'file',
					'.png': 'file',
					'.sh': 'file',
				},
				assetNames: 'media/[name]', // moves media assets into a sub-folder "media"
				banner: entryPoint.name === 'vs/workbench/workbench.web.main' ? undefined : banner, // TODO@esm remove line when we stop supporting web-amd-esm-bridge
				entryPoints: [
					{
						in: path.join(REPO_ROOT_PATH, opts.src, `${entryPoint.name}.js`),
						out: dest,
					}
				],
				outdir: path.join(REPO_ROOT_PATH, opts.src),
				write: false, // enables res.outputFiles
				metafile: true, // enables res.metafile
				// minify: NOT enabled because we have a separate minify task that takes care of the TSLib banner as well
			}).then(res => {
				for (const file of res.outputFiles) {
					let sourceMapFile: esbuild.OutputFile | undefined = undefined;
					if (file.path.endsWith('.js')) {
						sourceMapFile = res.outputFiles.find(f => f.path === `${file.path}.map`);
					}

					const fileProps = {
						contents: Buffer.from(file.contents),
						sourceMap: sourceMapFile ? JSON.parse(sourceMapFile.text) : undefined, // support gulp-sourcemaps
						path: file.path,
						base: path.join(REPO_ROOT_PATH, opts.src)
					};
					files.push(new VinylFile(fileProps));
				}
			});

			tasks.push(task);
		}

		await Promise.all(tasks);
		return { files };
	};

	bundleAsync().then((output) => {

		// bundle output (JS, CSS, SVG...)
		es.readArray(output.files).pipe(bundlesStream);

		// forward all resources
		gulp.src(opts.resources ?? [], { base: `${opts.src}`, allowEmpty: true }).pipe(resourcesStream);
	});

	const result = es.merge(
		bundlesStream,
		resourcesStream
	);

	return result
		.pipe(sourcemaps.write('./', {
			sourceRoot: undefined,
			addComment: true,
			includeContent: true
		}));
}

export interface IBundleESMTaskOpts {
	/**
	 * Destination folder for the bundled files.
	 */
	out: string;
	/**
	 * Bundle ESM modules (using esbuild).
	*/
	esm: IBundleESMTaskOpts;
}

export function bundleTask(opts: IBundleESMTaskOpts): () => NodeJS.ReadWriteStream {
	return function () {
		return bundleESMTask(opts.esm).pipe(gulp.dest(opts.out));
	};
}

export function minifyTask(src: string, sourceMapBaseUrl?: string): (cb: any) => void {
	const sourceMappingURL = sourceMapBaseUrl ? ((f: any) => `${sourceMapBaseUrl}/${f.relative}.map`) : undefined;

	return cb => {
		const cssnano = require('cssnano') as typeof import('cssnano');
		const svgmin = require('gulp-svgmin') as typeof import('gulp-svgmin');

		const jsFilter = filter('**/*.js', { restore: true });
		const cssFilter = filter('**/*.css', { restore: true });
		const svgFilter = filter('**/*.svg', { restore: true });

		pump(
			gulp.src([src + '/**', '!' + src + '/**/*.map']),
			jsFilter,
			sourcemaps.init({ loadMaps: true }),
			es.map((f: any, cb) => {
				esbuild.build({
					entryPoints: [f.path],
					minify: true,
					sourcemap: 'external',
					outdir: '.',
					packages: 'external', // "external all the things", see https://esbuild.github.io/api/#packages
					platform: 'neutral', // makes esm
					target: ['es2022'],
					write: false
				}).then(res => {
					const jsFile = res.outputFiles.find(f => /\.js$/.test(f.path))!;
					const sourceMapFile = res.outputFiles.find(f => /\.js\.map$/.test(f.path))!;

					const contents = Buffer.from(jsFile.contents);
					const unicodeMatch = contents.toString().match(/[^\x00-\xFF]+/g);
					if (unicodeMatch) {
						cb(new Error(`Found non-ascii character ${unicodeMatch[0]} in the minified output of ${f.path}. Non-ASCII characters in the output can cause performance problems when loading. Please review if you have introduced a regular expression that esbuild is not automatically converting and convert it to using unicode escape sequences.`));
					} else {
						f.contents = contents;
						f.sourceMap = JSON.parse(sourceMapFile.text);

						cb(undefined, f);
					}
				}, cb);
			}),
			jsFilter.restore,
			cssFilter,
			gulpPostcss([cssnano({ preset: 'default' })]),
			cssFilter.restore,
			svgFilter,
			svgmin(),
			svgFilter.restore,
			sourcemaps.write('./', {
				sourceMappingURL,
				sourceRoot: undefined,
				includeContent: true,
				addComment: true
			} as any),
			gulp.dest(src + '-min'),
			(err: any) => cb(err));
	};
}
