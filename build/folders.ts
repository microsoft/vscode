/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';

/**
 * Folder and file paths (relative to the repository root) used by the build
 * pipeline. Centralizing them avoids string duplication and makes the build's
 * inputs/outputs discoverable.
 *
 * Every node exposes both forms of the path so call sites can pick the one
 * that fits the consumer (gulp/glob patterns want `rootRelPath`, fs/path APIs
 * usually want `absPath`).
 *
 * The `*Dir` variants additionally carry provenance back to the `Path` node
 * they came from. Functions that want to track where a path string originated
 * can accept `DirString` instead of `string` and pass through `.path` at
 * runtime — so nothing changes in behavior, only the type carries metadata.
 */
export interface Path {
	/** Path relative to the repository root, using forward slashes. */
	readonly rootRelPath: string;
	/** Absolute path on the local file system. */
	readonly absPath: string;
	/** {@link rootRelPath} wrapped as a `DirString` (carries back-reference to this node). */
	readonly rootRelPathDir: DirString;
	/** {@link absPath} wrapped as a `DirString` (carries back-reference to this node). */
	readonly absPathDir: DirString;
}

/**
 * A string path with provenance: `.path` is the runtime value to use, while
 * `.source` identifies which `Path` entry in the centralized tree the value
 * came from. Construct via {@link dirStr} or via `Path.absPathDir` /
 * `Path.rootRelPathDir`.
 */
export interface DirString {
	readonly path: string;
	readonly source: Path;
}

/** Create a `DirString` bound to a `Path` source. */
export function dirStr(p: string, source: Path): DirString {
	return { path: p, source };
}

const REPO_ROOT = path.dirname(import.meta.dirname);

function f(rootRelPath: string): Path {
	const absPath = path.join(REPO_ROOT, rootRelPath);
	const p = {
		rootRelPath,
		absPath,
		rootRelPathDir: undefined as unknown as DirString,
		absPathDir: undefined as unknown as DirString,
	};
	p.rootRelPathDir = { path: rootRelPath, source: p };
	p.absPathDir = { path: absPath, source: p };
	return p;
}

export const paths = {
	src: {
		...f('src'),
		tsconfig: f('src/tsconfig.json'),
		tsconfigBase: f('src/tsconfig.base.json'),
		tsconfigMonaco: f('src/tsconfig.monaco.json'),
		monacoDts: f('src/vs/monaco.d.ts'),
		markedCgmanifest: f('src/vs/base/common/marked/cgmanifest.json'),
		dompurifyCgmanifest: f('src/vs/base/browser/dompurify/cgmanifest.json'),
		standaloneEnums: f('src/vs/editor/common/standalone/standaloneEnums.ts'),
		codiconTtf: f('src/vs/base/browser/ui/codicons/codicon/codicon.ttf'),
	},
	extensions: f('extensions'),
	remote: {
		...f('remote'),
		web: {
			...f('remote/web'),
			packageJson: f('remote/web/package.json'),
		},
		license: f('remote/LICENSE'),
		npmrc: f('remote/.npmrc'),
	},
	resources: {
		...f('resources'),
		darwin: {
			...f('resources/darwin'),
			codeIcns: f('resources/darwin/code.icns'),
		},
		win32: {
			...f('resources/win32'),
			codeIco: f('resources/win32/code.ico'),
		},
		server: {
			...f('resources/server'),
			favicon: f('resources/server/favicon.ico'),
			manifest: f('resources/server/manifest.json'),
			code192Png: f('resources/server/code-192.png'),
			code512Png: f('resources/server/code-512.png'),
		},
	},

	out: f('out'),
	outBuild: {
		...f('out-build'),
		date: f('out-build/date'),
	},

	outVscode: f('out-vscode'),
	outVscodeMin: f('out-vscode-min'),
	outVscodeReh: f('out-vscode-reh'),
	outVscodeRehMin: f('out-vscode-reh-min'),
	outVscodeRehWeb: f('out-vscode-reh-web'),
	outVscodeRehWebMin: f('out-vscode-reh-web-min'),
	outVscodeWeb: f('out-vscode-web'),
	outVscodeWebMin: f('out-vscode-web-min'),

	outEditorSrc: f('out-editor-src'),
	outMonacoEditorCore: f('out-monaco-editor-core'),

	dotBuild: {
		...f('.build'),
		extensions: f('.build/extensions'),
		web: {
			...f('.build/web'),
			extensions: f('.build/web/extensions'),
		},
		builtInExtensions: f('.build/builtInExtensions'),
		electron: f('.build/electron'),
		node: f('.build/node'),
		telemetry: f('.build/telemetry'),
		policies: {
			...f('.build/policies'),
			linux: f('.build/policies/linux'),
			darwin: f('.build/policies/darwin'),
			win32: f('.build/policies/win32'),
		},
		linux: {
			...f('.build/linux'),
			deb: f('.build/linux/deb'),
			rpm: f('.build/linux/rpm'),
			snap: f('.build/linux/snap'),
		},
		win32: f('.build/win32'),
		distro: {
			...f('.build/distro'),
			npm: {
				...f('.build/distro/npm'),
				remote: {
					...f('.build/distro/npm/remote'),
					web: f('.build/distro/npm/remote/web'),
				},
			},
		},
	},

	build: {
		...f('build'),
		npmrc: f('build/.npmrc'),
		moduleignore: f('build/.moduleignore'),
		cachesalt: f('build/.cachesalt'),
		webignore: f('build/.webignore'),
		gypNodeGyp: f('build/gyp/node_modules/.bin/node-gyp'),
		gypNodeGypCmd: f('build/gyp/node_modules/.bin/node-gyp.cmd'),
		azurePipelines: {
			...f('build/azure-pipelines'),
			common: {
				...f('build/azure-pipelines/common'),
				signWin32: f('build/azure-pipelines/common/sign-win32.ts'),
				telemetryConfig: f('build/azure-pipelines/common/telemetry-config.json'),
			},
			darwin: {
				...f('build/azure-pipelines/darwin'),
				helperGpuEntitlementsPlist: f('build/azure-pipelines/darwin/helper-gpu-entitlements.plist'),
				helperRendererEntitlementsPlist: f('build/azure-pipelines/darwin/helper-renderer-entitlements.plist'),
				helperPluginEntitlementsPlist: f('build/azure-pipelines/darwin/helper-plugin-entitlements.plist'),
				helperEntitlementsPlist: f('build/azure-pipelines/darwin/helper-entitlements.plist'),
				appEntitlementsPlist: f('build/azure-pipelines/darwin/app-entitlements.plist'),
				serverEntitlementsPlist: f('build/azure-pipelines/darwin/server-entitlements.plist'),
			},
		},
		checksums: {
			...f('build/checksums'),
			electronTxt: f('build/checksums/electron.txt'),
			nodejsTxt: f('build/checksums/nodejs.txt'),
			vscodeSysrootTxt: f('build/checksums/vscode-sysroot.txt'),
		},
		monaco: {
			...f('build/monaco'),
			usageRecipe: f('build/monaco/monaco.usage.recipe'),
			license: f('build/monaco/LICENSE'),
			thirdPartyNotices: f('build/monaco/ThirdPartyNotices.txt'),
			packageJson: f('build/monaco/package.json'),
			versionTxt: f('build/monaco/version.txt'),
			readmeNpm: f('build/monaco/README-npm.md'),
		},
	},

	openssl: {
		...f('cli/openssl'),
		packageOut: f('cli/openssl/package/out'),
	},

	nodeModules: {
		...f('node_modules'),
		vscodeCodiconsTtf: f('node_modules/@vscode/codicons/dist/codicon.ttf'),
		vscodeCodicons: f('node_modules/@vscode/codicons'),
		telemetryExtractor: f('node_modules/@vscode/telemetry-extractor/out/extractor.js'),
		minimist: f('node_modules/minimist/index.js'),
		tslibEs6: f('node_modules/tslib/tslib.es6.js'),
		postinstallState: f('node_modules/.postinstall-state'),
	},

	productJson: f('product.json'),
	packageJson: f('package.json'),
	npmrc: f('.npmrc'),
	gitRebaseApply: f('.git/rebase-apply'),
} as const;
