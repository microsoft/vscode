/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import vfs from 'vinyl-fs';
import filter from 'gulp-filter';
import * as util from './util.ts';
import { getVersion } from './getVersion.ts';
import electron from '@vscode/gulp-electron';
import json from 'gulp-json-editor';

type DarwinDocumentSuffix = 'document' | 'script' | 'file' | 'source code';
type DarwinDocumentType = {
	name: string;
	role: string;
	ostypes: string[];
	extensions: string[];
	iconFile: string;
	utis?: string[];
};
type DarwinUTType = {
	identifier: string;
	description: string;
	conformsTo: string[];
	iconFiles: string[];
	tagSpecification: { 'public.filename-extension': string[] };
};

function isDocumentSuffix(str?: string): str is DarwinDocumentSuffix {
	return str === 'document' || str === 'script' || str === 'file' || str === 'source code';
}

const root = path.dirname(path.dirname(import.meta.dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = getVersion(root);
const useVersionedUpdate = process.platform === 'win32' && (product as typeof product & { win32VersionedUpdate?: boolean })?.win32VersionedUpdate;
const versionedResourcesFolder = useVersionedUpdate ? commit!.substring(0, 10) : '';

function createTemplate(input: string): (params: Record<string, string>) => string {
	return (params: Record<string, string>) => {
		return input.replace(/<%=\s*([^\s]+)\s*%>/g, (match, key) => {
			return params[key] || match;
		});
	};
}

const darwinCreditsTemplate = product.darwinCredits && createTemplate(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));

/**
 * Generate a `DarwinDocumentType` given a list of file extensions, an icon name, and an optional suffix or file type name.
 * @param extensions A list of file extensions, such as `['bat', 'cmd']`
 * @param icon A sentence-cased file type name that matches the lowercase name of a darwin icon resource.
 * For example, `'HTML'` instead of `'html'`, or `'Java'` instead of `'java'`.
 * This parameter is lowercased before it is used to reference an icon file.
 * @param nameOrSuffix An optional suffix or a string to use as the file type. If a suffix is provided,
 * it is used with the icon parameter to generate a file type string. If nothing is provided,
 * `'document'` is used with the icon parameter to generate file type string.
 *
 * For example, if you call `darwinBundleDocumentType(..., 'HTML')`, the resulting file type is `"HTML document"`,
 * and the `'html'` darwin icon is used.
 *
 * If you call `darwinBundleDocumentType(..., 'Javascript', 'file')`, the resulting file type is `"Javascript file"`.
 * and the `'javascript'` darwin icon is used.
 *
 * If you call `darwinBundleDocumentType(..., 'bat', 'Windows command script')`, the file type is `"Windows command script"`,
 * and the `'bat'` darwin icon is used.
 */
function darwinBundleDocumentType(extensions: string[], icon: string, nameOrSuffix?: string | DarwinDocumentSuffix, utis?: string[]): DarwinDocumentType {
	// If given a suffix, generate a name from it. If not given anything, default to 'document'
	if (isDocumentSuffix(nameOrSuffix) || !nameOrSuffix) {
		nameOrSuffix = icon.charAt(0).toUpperCase() + icon.slice(1) + ' ' + (nameOrSuffix ?? 'document');
	}

	return {
		name: nameOrSuffix,
		role: 'Editor',
		ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
		extensions,
		iconFile: 'resources/darwin/' + icon.toLowerCase() + '.icns',
		utis
	};
}

/**
 * Generate several `DarwinDocumentType`s with unique names and a shared icon.
 * @param types A map of file type names to their associated file extensions.
 * @param icon A darwin icon resource to use. For example, `'HTML'` would refer to `resources/darwin/html.icns`
 *
 * Examples:
 * ```
 * darwinBundleDocumentTypes({ 'C header file': 'h', 'C source code': 'c' },'c')
 * darwinBundleDocumentTypes({ 'React source code': ['jsx', 'tsx'] }, 'react')
 * ```
 */
function darwinBundleDocumentTypes(types: { [name: string]: string | string[] }, icon: string, utisMap?: { [name: string]: string[] }): DarwinDocumentType[] {
	return Object.keys(types).map((name: string): DarwinDocumentType => {
		const extensions = types[name];
		return {
			name,
			role: 'Editor',
			ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
			extensions: Array.isArray(extensions) ? extensions : [extensions],
			iconFile: 'resources/darwin/' + icon + '.icns',
			utis: utisMap?.[name]
		};
	});
}

/**
 * Build the unique bundle identifier for a VS Code custom UTI.
 */
function vscodeUTI(suffix: string): string {
	return product.darwinBundleIdentifier + '.' + suffix;
}

/**
 * Create a `DarwinUTType` declaration for use in `UTImportedTypeDeclarations` or `UTExportedTypeDeclarations`.
 */
function darwinUTType(identifier: string, description: string, conformsTo: string[], iconFile: string, extensions: string[]): DarwinUTType {
	return {
		identifier,
		description,
		conformsTo,
		iconFiles: [path.basename(iconFile)],
		tagSpecification: { 'public.filename-extension': extensions }
	};
}

const { electronVersion, msBuildId } = util.getElectronVersion();

export const config = {
	version: electronVersion,
	tag: product.electronRepository ? `v${electronVersion}-${msBuildId}` : undefined,
	productAppName: product.nameLong,
	companyName: 'Microsoft Corporation',
	copyright: 'Copyright (C) 2026 Microsoft. All rights reserved',
	darwinExecutable: product.nameShort,
	darwinIcon: 'resources/darwin/code.icns',
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: 'public.app-category.developer-tools',
	darwinHelpBookFolder: 'VS Code HelpBook',
	darwinHelpBookName: 'VS Code HelpBook',
	darwinBundleDocumentTypes: [
		...darwinBundleDocumentTypes({ 'C header file': 'h', 'C source code': 'c' }, 'c', {
			'C header file': ['public.c-header'],
			'C source code': ['public.c-source']
		}),
		...darwinBundleDocumentTypes({ 'Git configuration file': ['gitattributes', 'gitconfig', 'gitignore'] }, 'config', {
			'Git configuration file': [vscodeUTI('git-config')]
		}),
		...darwinBundleDocumentTypes({ 'HTML template document': ['asp', 'aspx', 'cshtml', 'jshtm', 'jsp', 'phtml', 'shtml'] }, 'html', {
			'HTML template document': [vscodeUTI('html-template')]
		}),
		darwinBundleDocumentType(['bat', 'cmd'], 'bat', 'Windows command script', [vscodeUTI('bat')]),
		darwinBundleDocumentType(['bowerrc'], 'Bower', undefined, [vscodeUTI('bower')]),
		darwinBundleDocumentType(['config', 'editorconfig', 'ini', 'cfg'], 'config', 'Configuration file', [vscodeUTI('config')]),
		darwinBundleDocumentType(['hh', 'hpp', 'hxx', 'h++'], 'cpp', 'C++ header file', ['public.c-plus-plus-header']),
		darwinBundleDocumentType(['cc', 'cpp', 'cxx', 'c++'], 'cpp', 'C++ source code', ['public.c-plus-plus-source']),
		darwinBundleDocumentType(['m'], 'default', 'Objective-C source code', ['public.objective-c-source']),
		darwinBundleDocumentType(['mm'], 'cpp', 'Objective-C++ source code', ['public.objective-c-plus-plus-source']),
		darwinBundleDocumentType(['cs', 'csx'], 'csharp', 'C# source code', [vscodeUTI('csharp')]),
		darwinBundleDocumentType(['css'], 'css', 'CSS', ['public.css']),
		darwinBundleDocumentType(['go'], 'go', 'Go source code', [vscodeUTI('go')]),
		darwinBundleDocumentType(['htm', 'html', 'xhtml'], 'HTML', undefined, ['public.html']),
		darwinBundleDocumentType(['jade'], 'Jade', undefined, [vscodeUTI('jade')]),
		darwinBundleDocumentType(['jav', 'java'], 'Java', undefined, ['com.sun.java-source']),
		darwinBundleDocumentType(['js', 'jscsrc', 'jshintrc', 'mjs', 'cjs'], 'Javascript', 'file', ['com.netscape.javascript-source']),
		darwinBundleDocumentType(['json'], 'JSON', undefined, ['public.json']),
		darwinBundleDocumentType(['less'], 'Less', undefined, [vscodeUTI('less')]),
		darwinBundleDocumentType(['markdown', 'md', 'mdoc', 'mdown', 'mdtext', 'mdtxt', 'mdwn', 'mkd', 'mkdn'], 'Markdown', undefined, ['net.daringfireball.markdown']),
		darwinBundleDocumentType(['php'], 'PHP', 'source code', ['public.php-script']),
		darwinBundleDocumentType(['ps1', 'psd1', 'psm1'], 'Powershell', 'script', [vscodeUTI('powershell')]),
		darwinBundleDocumentType(['py', 'pyi'], 'Python', 'script', ['public.python-script']),
		darwinBundleDocumentType(['gemspec', 'rb', 'erb'], 'Ruby', 'source code', ['public.ruby-script']),
		darwinBundleDocumentType(['scss', 'sass'], 'SASS', 'file', [vscodeUTI('sass')]),
		darwinBundleDocumentType(['sql'], 'SQL', 'script', [vscodeUTI('sql')]),
		darwinBundleDocumentType(['ts'], 'TypeScript', 'file', [vscodeUTI('typescript')]),
		darwinBundleDocumentType(['tsx', 'jsx'], 'React', 'source code', [vscodeUTI('react')]),
		darwinBundleDocumentType(['vue'], 'Vue', 'source code', [vscodeUTI('vue')]),
		darwinBundleDocumentType(['ascx', 'csproj', 'dtd', 'plist', 'wxi', 'wxl', 'wxs', 'xml', 'xaml'], 'XML', undefined, ['public.xml']),
		darwinBundleDocumentType(['eyaml', 'eyml', 'yaml', 'yml'], 'YAML', undefined, ['public.yaml']),
		darwinBundleDocumentType([
			'bash', 'bash_login', 'bash_logout', 'bash_profile', 'bashrc',
			'profile', 'rhistory', 'rprofile', 'sh', 'zlogin', 'zlogout',
			'zprofile', 'zsh', 'zshenv', 'zshrc'
		], 'Shell', 'script', ['public.shell-script']),
		// VS Code workspace uses the product icon, not the default icon
		darwinBundleDocumentType(['code-workspace'], 'code', 'VS Code workspace file', [vscodeUTI('code-workspace')]),
		// Default icon with specified names
		...darwinBundleDocumentTypes({
			'Clojure source code': ['clj', 'cljs', 'cljx', 'clojure'],
			'CoffeeScript source code': 'coffee',
			'Comma Separated Values': 'csv',
			'CMake script': 'cmake',
			'Dart script': 'dart',
			'Diff file': 'diff',
			'Dockerfile': 'dockerfile',
			'Gradle file': 'gradle',
			'Groovy script': 'groovy',
			'Makefile': ['makefile', 'mk'],
			'Lua script': 'lua',
			'Pug document': 'pug',
			'Jupyter': 'ipynb',
			'Lockfile': 'lock',
			'Log file': 'log',
			'Plain Text File': 'txt',
			'Xcode project file': 'xcodeproj',
			'Xcode workspace file': 'xcworkspace',
			'Visual Basic script': 'vb',
			'R source code': 'r',
			'Rust source code': 'rs',
			'Restructured Text document': 'rst',
			'LaTeX document': ['tex', 'cls'],
			'F# source code': 'fs',
			'F# signature file': 'fsi',
			'F# script': ['fsx', 'fsscript'],
			'SVG document': ['svg'],
			'TOML document': 'toml',
			'Swift source code': 'swift',
		}, 'default', {
			'Clojure source code': [vscodeUTI('clojure')],
			'CoffeeScript source code': [vscodeUTI('coffeescript')],
			'Comma Separated Values': ['public.comma-separated-values-text'],
			'CMake script': [vscodeUTI('cmake')],
			'Dart script': [vscodeUTI('dart')],
			'Diff file': [vscodeUTI('diff')],
			'Dockerfile': [vscodeUTI('dockerfile')],
			'Gradle file': [vscodeUTI('gradle')],
			'Groovy script': [vscodeUTI('groovy')],
			'Makefile': [vscodeUTI('makefile')],
			'Lua script': [vscodeUTI('lua')],
			'Pug document': [vscodeUTI('pug')],
			'Jupyter': [vscodeUTI('jupyter')],
			'Lockfile': [vscodeUTI('lockfile')],
			'Log file': [vscodeUTI('log')],
			'Plain Text File': ['public.plain-text'],
			'Visual Basic script': [vscodeUTI('vb')],
			'R source code': [vscodeUTI('r')],
			'Rust source code': [vscodeUTI('rust')],
			'Restructured Text document': [vscodeUTI('rst')],
			'LaTeX document': [vscodeUTI('latex')],
			'F# source code': [vscodeUTI('fsharp')],
			'F# signature file': [vscodeUTI('fsharp-signature')],
			'F# script': [vscodeUTI('fsharp-script')],
			'SVG document': ['public.svg-image'],
			'TOML document': [vscodeUTI('toml')],
			'Swift source code': ['public.swift-source'],
		}),
		// Default icon with default name
		darwinBundleDocumentType([
			'containerfile', 'ctp', 'dot', 'edn', 'handlebars', 'hbs', 'ml', 'mli',
			'pl', 'pl6', 'pm', 'pm6', 'pod', 'pp', 'properties', 'psgi', 'rt', 't'
		], 'default', product.nameLong + ' document'),
		// Folder support ()
		darwinBundleDocumentType([], 'default', 'Folder', ['public.folder'])
	],
	darwinBundleURLTypes: [{
		role: 'Viewer',
		name: product.nameLong,
		urlSchemes: [product.urlProtocol]
	}],
	darwinBundleUTExportedTypes: [
		darwinUTType(vscodeUTI('code-workspace'), 'VS Code workspace file', ['public.data'], 'resources/darwin/code.icns', ['code-workspace']),
	],
	darwinBundleUTImportedTypes: [
		// Types with well-known Apple UTIs
		darwinUTType('public.c-header', 'C header file', ['public.source-code'], 'resources/darwin/c.icns', ['h']),
		darwinUTType('public.c-source', 'C source code', ['public.source-code'], 'resources/darwin/c.icns', ['c']),
		darwinUTType('public.c-plus-plus-header', 'C++ header file', ['public.source-code'], 'resources/darwin/cpp.icns', ['hh', 'hpp', 'hxx', 'h++']),
		darwinUTType('public.c-plus-plus-source', 'C++ source code', ['public.source-code'], 'resources/darwin/cpp.icns', ['cc', 'cpp', 'cxx', 'c++']),
		darwinUTType('public.objective-c-source', 'Objective-C source code', ['public.source-code'], 'resources/darwin/default.icns', ['m']),
		darwinUTType('public.objective-c-plus-plus-source', 'Objective-C++ source code', ['public.source-code'], 'resources/darwin/cpp.icns', ['mm']),
		darwinUTType('public.css', 'CSS', ['public.text'], 'resources/darwin/css.icns', ['css']),
		darwinUTType('public.html', 'HTML document', ['public.text'], 'resources/darwin/html.icns', ['htm', 'html', 'xhtml']),
		darwinUTType('public.json', 'JSON', ['public.text'], 'resources/darwin/json.icns', ['json']),
		darwinUTType('public.xml', 'XML document', ['public.text'], 'resources/darwin/xml.icns', ['xml', 'ascx', 'csproj', 'dtd', 'plist', 'wxi', 'wxl', 'wxs', 'xaml']),
		darwinUTType('public.yaml', 'YAML document', ['public.text'], 'resources/darwin/yaml.icns', ['yaml', 'yml', 'eyaml', 'eyml']),
		darwinUTType('public.python-script', 'Python script', ['public.script'], 'resources/darwin/python.icns', ['py', 'pyi']),
		darwinUTType('public.ruby-script', 'Ruby source code', ['public.script'], 'resources/darwin/ruby.icns', ['rb', 'gemspec', 'erb']),
		darwinUTType('public.shell-script', 'Shell script', ['public.script'], 'resources/darwin/shell.icns', ['sh', 'bash', 'zsh', 'bash_login', 'bash_logout', 'bash_profile', 'bashrc', 'profile', 'zlogin', 'zlogout', 'zprofile', 'zshenv', 'zshrc', 'rhistory', 'rprofile']),
		darwinUTType('public.php-script', 'PHP source code', ['public.script'], 'resources/darwin/php.icns', ['php']),
		darwinUTType('public.swift-source', 'Swift source code', ['public.source-code'], 'resources/darwin/default.icns', ['swift']),
		darwinUTType('public.plain-text', 'Plain text file', ['public.text'], 'resources/darwin/default.icns', ['txt']),
		darwinUTType('public.comma-separated-values-text', 'Comma separated values', ['public.text'], 'resources/darwin/default.icns', ['csv']),
		darwinUTType('public.svg-image', 'SVG document', ['public.image', 'public.xml'], 'resources/darwin/default.icns', ['svg']),
		darwinUTType('com.sun.java-source', 'Java source code', ['public.source-code'], 'resources/darwin/java.icns', ['java', 'jav']),
		darwinUTType('com.netscape.javascript-source', 'JavaScript file', ['public.source-code'], 'resources/darwin/javascript.icns', ['js', 'jscsrc', 'jshintrc', 'mjs', 'cjs']),
		darwinUTType('net.daringfireball.markdown', 'Markdown document', ['public.text'], 'resources/darwin/markdown.icns', ['md', 'markdown', 'mdoc', 'mdown', 'mdtext', 'mdtxt', 'mdwn', 'mkd', 'mkdn']),

		// Custom VS Code UTIs for types without well-known Apple UTIs
		darwinUTType(vscodeUTI('git-config'), 'Git configuration file', ['public.text'], 'resources/darwin/config.icns', ['gitattributes', 'gitconfig', 'gitignore']),
		darwinUTType(vscodeUTI('html-template'), 'HTML template document', ['public.html'], 'resources/darwin/html.icns', ['asp', 'aspx', 'cshtml', 'jshtm', 'jsp', 'phtml', 'shtml']),
		darwinUTType(vscodeUTI('bat'), 'Windows command script', ['public.script'], 'resources/darwin/bat.icns', ['bat', 'cmd']),
		darwinUTType(vscodeUTI('bower'), 'Bower document', ['public.text'], 'resources/darwin/bower.icns', ['bowerrc']),
		darwinUTType(vscodeUTI('config'), 'Configuration file', ['public.text'], 'resources/darwin/config.icns', ['config', 'editorconfig', 'ini', 'cfg']),
		darwinUTType(vscodeUTI('csharp'), 'C# source code', ['public.source-code'], 'resources/darwin/csharp.icns', ['cs', 'csx']),
		darwinUTType(vscodeUTI('go'), 'Go source code', ['public.source-code'], 'resources/darwin/go.icns', ['go']),
		darwinUTType(vscodeUTI('jade'), 'Jade document', ['public.text'], 'resources/darwin/jade.icns', ['jade']),
		darwinUTType(vscodeUTI('less'), 'Less document', ['public.text'], 'resources/darwin/less.icns', ['less']),
		darwinUTType(vscodeUTI('powershell'), 'PowerShell script', ['public.script'], 'resources/darwin/powershell.icns', ['ps1', 'psd1', 'psm1']),
		darwinUTType(vscodeUTI('sass'), 'Sass file', ['public.text'], 'resources/darwin/sass.icns', ['scss', 'sass']),
		darwinUTType(vscodeUTI('sql'), 'SQL script', ['public.text'], 'resources/darwin/sql.icns', ['sql']),
		darwinUTType(vscodeUTI('typescript'), 'TypeScript file', ['public.source-code'], 'resources/darwin/typescript.icns', ['ts']),
		darwinUTType(vscodeUTI('react'), 'React source code', ['public.source-code'], 'resources/darwin/react.icns', ['tsx', 'jsx']),
		darwinUTType(vscodeUTI('vue'), 'Vue source code', ['public.source-code'], 'resources/darwin/vue.icns', ['vue']),

		// Default icon types
		darwinUTType(vscodeUTI('clojure'), 'Clojure source code', ['public.source-code'], 'resources/darwin/default.icns', ['clj', 'cljs', 'cljx', 'clojure']),
		darwinUTType(vscodeUTI('coffeescript'), 'CoffeeScript source code', ['public.source-code'], 'resources/darwin/default.icns', ['coffee']),
		darwinUTType(vscodeUTI('cmake'), 'CMake script', ['public.script'], 'resources/darwin/default.icns', ['cmake']),
		darwinUTType(vscodeUTI('dart'), 'Dart script', ['public.source-code'], 'resources/darwin/default.icns', ['dart']),
		darwinUTType(vscodeUTI('diff'), 'Diff file', ['public.text'], 'resources/darwin/default.icns', ['diff']),
		darwinUTType(vscodeUTI('dockerfile'), 'Dockerfile', ['public.text'], 'resources/darwin/default.icns', ['dockerfile']),
		darwinUTType(vscodeUTI('gradle'), 'Gradle file', ['public.text'], 'resources/darwin/default.icns', ['gradle']),
		darwinUTType(vscodeUTI('groovy'), 'Groovy script', ['public.source-code'], 'resources/darwin/default.icns', ['groovy']),
		darwinUTType(vscodeUTI('makefile'), 'Makefile', ['public.script'], 'resources/darwin/default.icns', ['makefile', 'mk']),
		darwinUTType(vscodeUTI('lua'), 'Lua script', ['public.source-code'], 'resources/darwin/default.icns', ['lua']),
		darwinUTType(vscodeUTI('pug'), 'Pug document', ['public.text'], 'resources/darwin/default.icns', ['pug']),
		darwinUTType(vscodeUTI('jupyter'), 'Jupyter notebook', ['public.data'], 'resources/darwin/default.icns', ['ipynb']),
		darwinUTType(vscodeUTI('lockfile'), 'Lockfile', ['public.text'], 'resources/darwin/default.icns', ['lock']),
		darwinUTType(vscodeUTI('log'), 'Log file', ['public.text'], 'resources/darwin/default.icns', ['log']),
		darwinUTType(vscodeUTI('vb'), 'Visual Basic script', ['public.source-code'], 'resources/darwin/default.icns', ['vb']),
		darwinUTType(vscodeUTI('r'), 'R source code', ['public.source-code'], 'resources/darwin/default.icns', ['r']),
		darwinUTType(vscodeUTI('rust'), 'Rust source code', ['public.source-code'], 'resources/darwin/default.icns', ['rs']),
		darwinUTType(vscodeUTI('rst'), 'Restructured Text document', ['public.text'], 'resources/darwin/default.icns', ['rst']),
		darwinUTType(vscodeUTI('latex'), 'LaTeX document', ['public.text'], 'resources/darwin/default.icns', ['tex', 'cls']),
		darwinUTType(vscodeUTI('fsharp'), 'F# source code', ['public.source-code'], 'resources/darwin/default.icns', ['fs']),
		darwinUTType(vscodeUTI('fsharp-signature'), 'F# signature file', ['public.source-code'], 'resources/darwin/default.icns', ['fsi']),
		darwinUTType(vscodeUTI('fsharp-script'), 'F# script', ['public.source-code'], 'resources/darwin/default.icns', ['fsx', 'fsscript']),
		darwinUTType(vscodeUTI('toml'), 'TOML document', ['public.text'], 'resources/darwin/default.icns', ['toml']),
	],
	darwinForceDarkModeSupport: true,
	darwinCredits: darwinCreditsTemplate ? Buffer.from(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : undefined,
	linuxExecutableName: product.applicationName,
	winIcon: 'resources/win32/code.ico',
	token: process.env['GITHUB_TOKEN'],
	repo: product.electronRepository || undefined,
	validateChecksum: true,
	checksumFile: path.join(root, 'build', 'checksums', 'electron.txt'),
	createVersionedResources: useVersionedUpdate,
	productVersionString: versionedResourcesFolder,
};

function getElectron(arch: string): () => NodeJS.ReadWriteStream {
	return () => {
		const electronOpts = {
			...config,
			platform: process.platform,
			arch: arch === 'armhf' ? 'arm' : arch,
			ffmpegChromium: false,
			keepDefaultApp: true
		};

		return vfs.src('package.json')
			.pipe(json({ name: product.nameShort }))
			.pipe(electron(electronOpts))
			.pipe(filter(['**', '!**/app/package.json']))
			.pipe(vfs.dest('.build/electron'));
	};
}

async function main(arch: string = process.arch): Promise<void> {
	const electronPath = path.join(root, '.build', 'electron');
	await util.rimraf(electronPath)();
	await util.streamToPromise(getElectron(arch)());
}

if (import.meta.main) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
