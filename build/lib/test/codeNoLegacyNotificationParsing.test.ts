/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import * as path from 'path';
import tseslint from 'typescript-eslint';
import rule from '../../../.eslint-plugin-local/code-no-legacy-notification-parsing.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const root = path.resolve(import.meta.dirname, '../../..');
const allowedFiles = [
	'src/vs/workbench/api/browser/mainThreadMessageService.ts',
	'src/vs/workbench/api/browser/mainThreadProgress.ts',
	'src/vs/workbench/test/common/notifications.test.ts',
];
const coreFile = path.join(root, 'src/vs/workbench/contrib/example/browser/example.ts');
const source = '../../../../platform/notification/common/notificationLegacy.js';
const bridgeSource = '../../../platform/notification/common/notificationLegacy.js';
const options = [{ allowedFiles }];

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-legacy-notification-parsing', rule, {
	valid: [
		...allowedFiles.map(filename => ({
			filename: path.join(root, filename),
			options,
			code: `import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; const options = { legacyExtensionLinkParsing: capability };`,
		})),
		...[
			`import type { LegacyExtensionLinkParsing } from '${source}';`,
			`import { type LegacyExtensionLinkParsing } from '${source}';`,
			`import type * as legacy from '${source}';`,
			`import { isLegacyExtensionLinkParsing } from '${source}';`,
			`export type { LegacyExtensionLinkParsing } from '${source}';`,
			`export { type LegacyExtensionLinkParsing } from '${source}';`,
			`export type * from '${source}';`,
			`import { NotificationText } from '../../../../platform/notification/common/notificationMessage.js'; const message = NotificationText.link('Logs', 'command:showLogs');`,
			`const message = { isTrusted: true };`,
			`import { legacyExtensionLinkParsing } from './unrelated.js';`,
		].map(code => ({ filename: coreFile, options, code })),
	],
	invalid: [
		...[
			`import { legacyExtensionLinkParsing } from '${source}';`,
			`import { legacyExtensionLinkParsing as harmless } from '${source}';`,
			`import { legacyExtensionLinkParsing } from 'vs/platform/notification/common/notificationLegacy.js';`,
			`import { legacyExtensionLinkParsing } from '${source.replace('.js', '.ts')}';`,
		].map(code => ({ filename: coreFile, options, code, errors: [{ messageId: 'restrictedCapability' }] })),
		{
			name: 'does not exempt arbitrary core tests',
			filename: path.join(root, 'src/vs/workbench/test/common/another.test.ts'),
			options,
			code: `import { legacyExtensionLinkParsing } from '${bridgeSource}';`,
			errors: [{ messageId: 'restrictedCapability' }],
		},
		...[
			`import * as legacy from '${source}';`,
			`import legacy from '${source}';`,
			`const legacy = await import('${source}');`,
			`const legacy = await import(\`${source}\`);`,
			`const legacy = require('${source}');`,
			`import legacy = require('${source}');`,
		].map(code => ({ filename: coreFile, options, code, errors: [{ messageId: 'explicitImport' }] })),
		...[
			`export { legacyExtensionLinkParsing } from '${source}';`,
			`export { legacyExtensionLinkParsing as other } from '${source}';`,
			`export * from '${source}';`,
			`export * as legacy from '${source}';`,
		].map(code => ({ filename: coreFile, options, code, errors: [{ messageId: 'restrictedExport' }] })),
		...[
			`export { legacyExtensionLinkParsing } from '${bridgeSource}';`,
			`import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; export { capability };`,
			`export { capability }; import { legacyExtensionLinkParsing as capability } from '${bridgeSource}';`,
			`import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; export default capability;`,
			`import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; export const compatibility = capability;`,
			`import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; export default { capability };`,
			`import { legacyExtensionLinkParsing as capability } from '${bridgeSource}'; export const compatibility = () => capability;`,
		].map(code => ({
			filename: path.join(root, allowedFiles[0]),
			options,
			code,
			errors: [{ messageId: 'restrictedExport' }],
		})),
	],
});

test('notification capability restriction is enabled for core in the repository config', async () => {
	const linter = new ESLint({ cwd: root });
	const code = `import { legacyExtensionLinkParsing } from '${bridgeSource}';`;
	const filenames = [
		allowedFiles[0],
		allowedFiles[1],
		'src/vs/workbench/api/browser/mainThreadSomethingElse.ts',
		'src/vs/workbench/test/common/another.test.ts',
	];
	const results = await Promise.all(filenames.map(filePath => linter.lintText(code, { filePath: path.join(root, filePath) })));
	assert.deepStrictEqual(results.map(result => result.flatMap(file => file.messages
		.filter(message => message.ruleId === 'local/code-no-legacy-notification-parsing')
		.map(message => ({ id: message.messageId, severity: message.severity })))), [
		[],
		[],
		[{ id: 'restrictedCapability', severity: 2 }],
		[{ id: 'restrictedCapability', severity: 2 }],
	]);
});
