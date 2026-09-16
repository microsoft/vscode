/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import glob from 'glob';
import { rewriteSourceMappingURL } from './source-map-url.ts';
import { copyFile } from './transpile.ts';

const globAsync = promisify(glob);

export type BuildTarget = 'desktop' | 'server' | 'server-web' | 'web';

// Common resources needed by all targets
const commonResourcePatterns = [
	// Tree-sitter queries
	'vs/editor/common/languages/highlights/*.scm',
	'vs/editor/common/languages/injections/*.scm',

	// SVGs referenced from CSS (needed for transpile/dev builds where CSS is copied as-is)
	'vs/workbench/browser/media/code-icon.svg',
	'vs/workbench/browser/parts/editor/media/letterpress*.svg',
	'vs/workbench/contrib/chat/browser/widget/media/chatPet/**/*.{gif,png}',
	'vs/sessions/contrib/chat/browser/media/*.svg',
	'vs/sessions/contrib/welcome/browser/media/themePreviews/*.svg'
];

// Resources for desktop target
const desktopResourcePatterns = [
	...commonResourcePatterns,

	// HTML
	'vs/code/electron-browser/workbench/workbench.html',
	'vs/code/electron-browser/workbench/workbench-dev.html',
	'vs/sessions/electron-browser/sessions.html',
	'vs/sessions/electron-browser/sessions-dev.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Shell scripts
	'vs/base/node/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/*.ps1',
	'vs/workbench/contrib/terminal/common/scripts/*.psm1',
	'vs/workbench/contrib/terminal/common/scripts/*.fish',
	'vs/workbench/contrib/terminal/common/scripts/*.zsh',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.psd1',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.psm1',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.dll',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.ps1xml',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/net6plus/*.dll',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/netstd/*.dll',
	'vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',
	'vs/workbench/contrib/agentsVoice/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/welcomeOnboarding/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/{theme-icon.png,language-icon.svg}',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
	'vs/workbench/browser/parts/editor/media/*.png',
	'vs/workbench/contrib/debug/browser/media/*.png',

	// Sessions - built-in prompts and skills
	'vs/sessions/prompts/*.prompt.md',
	'vs/sessions/skills/**/SKILL.md',
];

// Resources for server target (minimal - no UI)
const serverResourcePatterns = [
	// Shell scripts for process monitoring
	'vs/base/node/cpuUsage.sh',
	'vs/base/node/ps.sh',

	// External Terminal
	'vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Terminal shell integration
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1',
	'vs/workbench/contrib/terminal/common/scripts/CodeTabExpansion.psm1',
	'vs/workbench/contrib/terminal/common/scripts/GitTabExpansion.psm1',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-env.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-profile.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-login.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.psd1',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.psm1',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.dll',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/*.ps1xml',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/net6plus/*.dll',
	'vs/workbench/contrib/terminal/common/scripts/psreadline/netstd/*.dll',
];

// Resources for server-web target (server + web UI)
const serverWebResourcePatterns = [
	...serverResourcePatterns,
	...commonResourcePatterns,

	// Web HTML
	'vs/code/browser/workbench/workbench.html',
	'vs/code/browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/callback.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',
	'vs/workbench/contrib/agentsVoice/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/welcomeOnboarding/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.png',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
];

// Resources for standalone web target (browser-only, no server)
const webResourcePatterns = [
	...commonResourcePatterns,

	// Web HTML
	'vs/code/browser/workbench/workbench.html',
	'vs/code/browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/callback.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',
	'vs/workbench/contrib/agentsVoice/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/welcomeOnboarding/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.png',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
];

function getResourcePatternsForTarget(target: BuildTarget): string[] {
	switch (target) {
		case 'desktop':
			return desktopResourcePatterns;
		case 'server':
			return serverResourcePatterns;
		case 'server-web':
			return serverWebResourcePatterns;
		case 'web':
			return webResourcePatterns;
		default:
			throw new Error(`Unknown target: ${target}`);
	}
}

export async function getResourcePaths(srcDir: string, target: BuildTarget): Promise<string[]> {
	const files = new Set<string>();
	for (const pattern of getResourcePatternsForTarget(target)) {
		for (const file of await globAsync(pattern, {
			cwd: srcDir,
			nodir: true,
			ignore: ['**/test/**', '**/*-dev.html'],
		})) {
			files.add(file);
		}
	}
	return [...files].sort();
}

/**
 * Copies curated production resources, minifying JavaScript only when requested.
 * Bundled/generated outputs and development copies never pass through this stage.
 */
export async function copyResources(srcDir: string, outDir: string, target: BuildTarget, minify: boolean, sourceMapBaseUrl?: string): Promise<void> {
	console.log(`[resources] Copying to ${outDir} for target '${target}'...`);
	const files = await getResourcePaths(srcDir, target);
	for (const file of files) {
		try {
			const srcPath = path.resolve(srcDir, file);
			const destPath = path.resolve(outDir, file);
			if (minify && /\.(?:cjs|mjs|js)$/.test(file)) {
				await minifyJavaScriptResource(srcPath, destPath, file, sourceMapBaseUrl);
			} else {
				await copyFile(srcPath, destPath);
			}
		} catch (error) {
			throw new Error(`[resources] Failed to process '${file}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
		}
	}
	console.log(`[resources] Copied ${files.length} files`);
}

async function minifyJavaScriptResource(srcPath: string, destPath: string, relativePath: string, sourceMapBaseUrl?: string): Promise<void> {
	const source = await fs.promises.readFile(srcPath, 'utf8');
	const header = source.match(/^\s*(?:#![^\n]*\n\s*)?(?<header>\/\*[\s\S]*?\*\/)/)?.groups?.header;
	// The standard source copyright header is not an esbuild legal comment.
	const banner = header && /\b(?:copyright|license[ds]?)\b/i.test(header) && !/^\/\*!|@license\b|@preserve\b/.test(header)
		? { js: header }
		: undefined;

	const result = await esbuild.build({
		entryPoints: [srcPath],
		outfile: destPath,
		bundle: false,
		minify: true,
		platform: 'neutral',
		target: ['es2024'],
		treeShaking: false,
		sourcemap: 'linked',
		sourcesContent: true,
		legalComments: 'inline',
		banner,
		tsconfigRaw: {},
		write: false,
		logLevel: 'warning',
		logOverride: {
			'missing-source-map': 'error',
			'unsupported-source-map-comment': 'error',
			'invalid-source-map': 'error',
			'invalid-source-mappings': 'error',
		},
		plugins: [{
			name: 'preserve-resource-script-context',
			setup(build) {
				// Bypass package.json's "type": "module" inference for classic scripts.
				// Keep the file loader so esbuild composes external and inline input maps.
				build.onResolve({ filter: /.*/ }, args => args.kind === 'entry-point' ? { path: srcPath } : undefined);
			},
		}],
	});

	await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
	for (const output of result.outputFiles) {
		await fs.promises.writeFile(output.path, output.path === destPath
			? rewriteSourceMappingURL(output.text, relativePath, sourceMapBaseUrl?.replace(/\/$/, ''))
			: output.contents);
	}
}
