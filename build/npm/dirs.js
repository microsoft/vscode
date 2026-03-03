/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');

// Complete list of directories where npm should be executed to install node modules
const dirs = [
	'',
	'build',
	'extensions',
	'extensions/configuration-editing',
	'extensions/css-language-features',
	'extensions/css-language-features/server',
	'extensions/debug-auto-launch',
	'extensions/debug-server-ready',
	'extensions/emmet',
	'extensions/extension-editing',
	'extensions/git',
	'extensions/git-base',
	'extensions/html-language-features',
	'extensions/html-language-features/server',
	'extensions/json-language-features',
	'extensions/json-language-features/server',
	'extensions/markdown-language-features',
	'extensions/markdown-math',
	'extensions/media-preview',
	'extensions/merge-conflict',
	'extensions/notebook-renderers',
	'extensions/npm',
	'extensions/references-view',
	'extensions/search-result',
	'extensions/simple-browser',
	'extensions/typescript-language-features',
	'remote',
	'remote/web',
	'test/automation',
	'test/integration/browser',
	'test/monaco',
	'test/smoke',
	'.vscode/extensions/vscode-selfhost-import-aid',
	'.vscode/extensions/vscode-selfhost-test-provider',
	'extensions/autothropic-agents',
	'extensions/autothropic-graph',
	'extensions/autothropic-preview',
];

if (fs.existsSync(`${__dirname}/../../.build/distro/npm`)) {
	dirs.push('.build/distro/npm');
	dirs.push('.build/distro/npm/remote');
	dirs.push('.build/distro/npm/remote/web');
}

exports.dirs = dirs;
