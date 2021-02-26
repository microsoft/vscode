/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vfs from 'vinyl-fs';
import * as filter from 'gulp-filter';
import * as _ from 'underscore';
import * as util from './util';

type DarwinDocumentSuffix = 'document' | 'script' | 'file' | 'source code';
type DarwinDocumentType = {
	name: string,
	role: string,
	ostypes: string[],
	extensions: string[],
	iconFile: string,
};

function isDocumentSuffix(str?: string): str is DarwinDocumentSuffix {
	return str != undefined && (
		str === 'document' || str === 'script' || str === 'file' || str === 'source code'
	);
}

const root = path.dirname(path.dirname(__dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = util.getVersion(root);

const darwinCreditsTemplate = product.darwinCredits && _.template(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));

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
function darwinBundleDocumentType(extensions: string[], icon: string, nameOrSuffix?: string | DarwinDocumentSuffix): DarwinDocumentType {
	// If given a suffix, generate a name from it. If not given anything, default to 'document'
	if (isDocumentSuffix(nameOrSuffix) || !nameOrSuffix) {
		nameOrSuffix = icon.charAt(0).toUpperCase() + icon.slice(1) + ' ' + (nameOrSuffix ?? 'document');
	}

	return {
		name: nameOrSuffix,
		role: 'Editor',
		ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
		extensions: extensions,
		iconFile: 'resources/darwin/' + icon + '.icns'
	};
}

export const config = {
	version: util.getElectronVersion(),
	productAppName: product.nameLong,
	companyName: 'Microsoft Corporation',
	copyright: 'Copyright (C) 2021 Microsoft. All rights reserved',
	darwinIcon: 'resources/darwin/code.icns',
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: 'public.app-category.developer-tools',
	darwinHelpBookFolder: 'VS Code HelpBook',
	darwinHelpBookName: 'VS Code HelpBook',
	darwinBundleDocumentTypes: [
		darwinBundleDocumentType(['bat', 'cmd'], 'bat'),
		darwinBundleDocumentType(['bowerrc'], 'bower'),
		darwinBundleDocumentType(['c', 'h'], 'c'),
		darwinBundleDocumentType(['config', 'editorconfig', 'gitattributes', 'gitconfig', 'gitignore', 'ini'], 'config'),
		darwinBundleDocumentType(['cc', 'cpp', 'cxx', 'c++', 'hh', 'hpp', 'hxx', 'h++'], 'cpp'),
		darwinBundleDocumentType(['cs', 'csx'], 'csharp'),
		darwinBundleDocumentType(['css'], 'css'),
		darwinBundleDocumentType(['go'], 'go'),
		darwinBundleDocumentType(['asp', 'aspx', 'cshtml', 'htm', 'html', 'jshtm', 'jsp', 'phtml', 'shtml'], 'html'),
		darwinBundleDocumentType(['jade'], 'jade'),
		darwinBundleDocumentType(['jav', 'java'], 'java'),
		darwinBundleDocumentType(['js', 'jscsrc', 'jshintrc', 'mjs', 'cjs'], 'javascript'),
		darwinBundleDocumentType(['json'], 'json'),
		darwinBundleDocumentType(['less'], 'less'),
		darwinBundleDocumentType(['markdown', 'md', 'mdoc', 'mdown', 'mdtext', 'mdtxt', 'mdwn', 'mkd', 'mkdn'], 'markdown'),
		darwinBundleDocumentType(['php'], 'php'),
		darwinBundleDocumentType(['ps1', 'psd1', 'psm1'], 'powershell'),
		darwinBundleDocumentType(['py'], 'python'),
		darwinBundleDocumentType(['gemspec', 'rb'], 'ruby'),
		darwinBundleDocumentType(['scss'], 'sass'),
		darwinBundleDocumentType(['bash', 'bash_login', 'bash_logout', 'bash_profile', 'bashrc', 'profile', 'rhistory', 'rprofile', 'sh', 'zlogin', 'zlogout', 'zprofile', 'zsh', 'zshenv', 'zshrc'], 'shell'),
		darwinBundleDocumentType(['sql'], 'sql'),
		darwinBundleDocumentType(['ts'], 'typescript'),
		darwinBundleDocumentType(['tsx', 'jsx'], 'react'),
		darwinBundleDocumentType(['vue'], 'vue'),
		darwinBundleDocumentType(['ascx', 'csproj', 'dtd', 'wxi', 'wxl', 'wxs', 'xml', 'xaml'], 'xml'),
		darwinBundleDocumentType(['eyaml', 'eyml', 'yaml', 'yml'], 'yaml'),
		darwinBundleDocumentType(['clj', 'cljs', 'cljx', 'clojure', 'code-workspace', 'coffee', 'containerfile', 'ctp', 'dockerfile', 'dot', 'edn', 'fs', 'fsi', 'fsscript', 'fsx', 'handlebars', 'hbs', 'lua', 'm', 'makefile', 'ml', 'mli', 'pl', 'pl6', 'pm', 'pm6', 'pod', 'pp', 'properties', 'psgi', 'pug', 'r', 'rs', 'rt', 'svg', 'svgz', 't', 'txt', 'vb', 'xcodeproj', 'xcworkspace'], 'default')
	],
	darwinBundleURLTypes: [{
		role: 'Viewer',
		name: product.nameLong,
		urlSchemes: [product.urlProtocol]
	}],
	darwinForceDarkModeSupport: true,
	darwinCredits: darwinCreditsTemplate ? Buffer.from(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : undefined,
	linuxExecutableName: product.applicationName,
	winIcon: 'resources/win32/code.ico',
	token: process.env['VSCODE_MIXIN_PASSWORD'] || process.env['GITHUB_TOKEN'] || undefined,
	repo: product.electronRepository || undefined
};

function getElectron(arch: string): () => NodeJS.ReadWriteStream {
	return () => {
		const electron = require('gulp-atom-electron');
		const json = require('gulp-json-editor') as typeof import('gulp-json-editor');

		const electronOpts = _.extend({}, config, {
			platform: process.platform,
			arch: arch === 'armhf' ? 'arm' : arch,
			ffmpegChromium: true,
			keepDefaultApp: true
		});

		return vfs.src('package.json')
			.pipe(json({ name: product.nameShort }))
			.pipe(electron(electronOpts))
			.pipe(filter(['**', '!**/app/package.json']))
			.pipe(vfs.dest('.build/electron'));
	};
}

async function main(arch = process.arch): Promise<void> {
	const version = util.getElectronVersion();
	const electronPath = path.join(root, '.build', 'electron');
	const versionFile = path.join(electronPath, 'version');
	const isUpToDate = fs.existsSync(versionFile) && fs.readFileSync(versionFile, 'utf8') === `${version}`;

	if (!isUpToDate) {
		await util.rimraf(electronPath)();
		await util.streamToPromise(getElectron(arch)());
	}
}

if (require.main === module) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
