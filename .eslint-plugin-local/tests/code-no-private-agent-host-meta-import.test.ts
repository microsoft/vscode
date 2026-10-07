/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import { posix } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-no-private-agent-host-meta-import.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const repositoryRoot = posix.normalize(`${import.meta.dirname.replace(/\\/g, '/')}/../..`);
const metadataDirectory = 'src/vs/platform/agentHost/common/meta';
const metadataAlias = 'vs/platform/agentHost/common/meta';
const featureFiles = [
	'src/vs/platform/agentHost/node/copilot/copilotAgentSession.ts',
	'src/vs/platform/agentHost/common/state/sessionState.ts',
	'src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts',
	'src/vs/sessions/contrib/providers/agentHost/browser/baseAgentHostSessionsProvider.ts',
	'src/vs/base/common/feature.ts',
];
const privateDirectories = ['copilotd', 'vscode'];
const importForms = [
	{ name: 'value import', code: (source: string) => `import { metadata } from '${source}';` },
	{ name: 'side-effect import', code: (source: string) => `import '${source}';` },
	{ name: 'type-only import', code: (source: string) => `import type { Metadata } from '${source}';` },
	{ name: 'inline type import', code: (source: string) => `import { type Metadata } from '${source}';` },
	{ name: 'namespace import', code: (source: string) => `import * as metadata from '${source}';` },
	{ name: 'type namespace import', code: (source: string) => `import type * as metadata from '${source}';` },
	{ name: 'named re-export', code: (source: string) => `export { metadata } from '${source}';` },
	{ name: 'type re-export', code: (source: string) => `export type { Metadata } from '${source}';` },
	{ name: 'star re-export', code: (source: string) => `export * from '${source}';` },
	{ name: 'namespace re-export', code: (source: string) => `export * as metadata from '${source}';` },
	{ name: 'dynamic import', code: (source: string) => `const metadata = import('${source}');` },
	{ name: 'dynamic import with options', code: (source: string) => `const metadata = import('${source}', { with: { type: 'json' } });` },
	{ name: 'require', code: (source: string) => `const metadata = require('${source}');` },
	{ name: 'import equals', code: (source: string) => `import metadata = require('${source}');` },
	{ name: 'import type expression', code: (source: string) => `type Metadata = import('${source}').Metadata;` },
];

function errors(directory: string): RuleTester.TestCaseError[] {
	return [{ messageId: 'privateMetadata', data: { directory: `${metadataDirectory}/${directory}` } }];
}

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-no-private-agent-host-meta-import', rule, {
	valid: [
		...featureFiles.flatMap(filename => importForms.map(form => ({
			name: `${form.name} through a domain helper from ${filename}`,
			filename: `${repositoryRoot}/${filename}`,
			code: form.code(`${metadataAlias}/agentToolCallMeta.js`),
		}))),
		...privateDirectories.flatMap(directory => [
			...importForms.map(form => ({
				name: `top-level source adapter ${form.name} from ${directory}`,
				filename: `${repositoryRoot}/${metadataDirectory}/agentToolCallMeta.ts`,
				code: form.code(`${metadataAlias}/${directory}/copilotdMetadata.js`),
			})),
			{
				name: `${directory} implementation imports its own generated metadata`,
				filename: `${repositoryRoot}/${metadataDirectory}/${directory}/nested/reader.ts`,
				code: `import type { Metadata } from '../copilotdMetadata.js';`,
			},
			{
				name: `${directory} parsing test`,
				filename: `${repositoryRoot}/src/vs/platform/agentHost/test/common/metadata.test.ts`,
				code: `import { metadata } from '${metadataAlias}/${directory}/copilotdMetadata.js';`,
			},
			{
				name: `${directory} root vector test`,
				filename: `${repositoryRoot}/test/metadata/vectors.ts`,
				code: `import { metadata } from '${metadataAlias}/${directory}/copilotdMetadata.js';`,
			},
			{
				name: `${directory} schema generator`,
				filename: `${repositoryRoot}/build/agentHost/generateCopilotMetadata.ts`,
				code: `import type { Metadata } from '../../${metadataDirectory}/${directory}/copilotdMetadata.ts';`,
			},
		]),
		...[
			`${metadataAlias}/copilotd.ts`,
			`${metadataAlias}/vscode.js`,
			`${metadataAlias}/copilotdata/reader.js`,
			`${metadataAlias}/vscodeExtra/reader.js`,
			'vs/platform/agentHost/node/copilot/provider.js',
			'vs/platform/agentHost/node/vscode/provider.js',
			'vs/workbench/contrib/copilotd/reader.js',
			'vs/workbench/contrib/vscode/reader.js',
			'vs/platform/other/common/meta/copilotd/reader.js',
			'vs/platform/agentHost/common/metadata/vscode/reader.js',
			`${metadataAlias}/copilotd/../agentToolCallMeta.js`,
		].map(source => ({
			name: `unrestricted path ${source}`,
			filename: `${repositoryRoot}/${featureFiles[0]}`,
			code: `import { metadata } from '${source}';`,
		})),
		{
			name: 'relative domain helper',
			filename: `${repositoryRoot}/${featureFiles[0]}`,
			code: `import type { Metadata } from '../../common/meta/agentToolCallMeta.js';`,
		},
		{
			name: 'private implementation imports a domain helper',
			filename: `${repositoryRoot}/${metadataDirectory}/copilotd/reader.ts`,
			code: `import type { Metadata } from '../agentToolCallMeta.js';`,
		},
		{
			name: 'Windows top-level adapter',
			filename: String.raw`C:\repo\src\vs\platform\agentHost\common\meta\agentToolCallMeta.ts`,
			code: `import type { Metadata } from './copilotd/copilotdMetadata.js';`,
		},
		{
			name: 'Windows private implementation',
			filename: String.raw`C:\repo\src\vs\platform\agentHost\common\meta\vscode\reader.ts`,
			code: `import { metadata } from './nested/reader.js';`,
		},
	],
	invalid: [
		...privateDirectories.flatMap(directory => importForms.map(form => ({
			name: `feature ${form.name} from ${directory}`,
			filename: `${repositoryRoot}/${featureFiles[0]}`,
			code: form.code(`${metadataAlias}/${directory}/copilotdMetadata.js`),
			errors: errors(directory),
		}))),
		...privateDirectories.flatMap(directory => featureFiles.slice(1).map(filename => ({
			name: `feature type import from ${directory} in ${filename}`,
			filename: `${repositoryRoot}/${filename}`,
			code: `import type { Metadata } from '${metadataAlias}/${directory}/copilotdMetadata.js';`,
			errors: errors(directory),
		}))),
		...privateDirectories.flatMap(directory => [
			{
				name: `relative ${directory} import`,
				filename: `${repositoryRoot}/${featureFiles[0]}`,
				code: `import type { Metadata } from '../../common/meta/${directory}/copilotdMetadata.js';`,
				errors: errors(directory),
			},
			{
				name: `absolute ${directory} import`,
				filename: `${repositoryRoot}/${featureFiles[0]}`,
				code: `export * from '${repositoryRoot}/${metadataDirectory}/${directory}/nested/reader.js';`,
				errors: errors(directory),
			},
			{
				name: `source-root ${directory} import`,
				filename: `${repositoryRoot}/${featureFiles[0]}`,
				code: `import '${metadataDirectory}/${directory}/copilotdMetadata.ts';`,
				errors: errors(directory),
			},
			{
				name: `exact private ${directory} directory`,
				filename: `${repositoryRoot}/${featureFiles[0]}`,
				code: `import * as metadata from '${metadataAlias}/${directory}';`,
				errors: errors(directory),
			},
			{
				name: `normalized ${directory} alias`,
				filename: `${repositoryRoot}/${featureFiles[0]}`,
				code: `import '${metadataAlias}/nested/../${directory}/reader.js';`,
				errors: errors(directory),
			},
			{
				name: `${directory} cross-private import`,
				filename: `${repositoryRoot}/${metadataDirectory}/${directory === 'vscode' ? 'copilotd' : 'vscode'}/reader.ts`,
				code: `import type { Metadata } from '../${directory}/copilotdMetadata.js';`,
				errors: errors(directory),
			},
			{
				name: `${directory} nested adapter is not a top-level helper`,
				filename: `${repositoryRoot}/${metadataDirectory}/nested/adapter.ts`,
				code: `import { metadata } from '../${directory}/copilotdMetadata.js';`,
				errors: errors(directory),
			},
		]),
		{
			name: 'Windows feature relative import',
			filename: String.raw`C:\repo\src\vs\platform\agentHost\node\copilot\copilotAgentSession.ts`,
			code: `import type { Metadata } from '../../common/meta/copilotd/copilotdMetadata.js';`,
			errors: errors('copilotd'),
		},
		{
			name: 'Windows feature namespace import',
			filename: String.raw`C:\repo\src\vs\sessions\contrib\providers\agentHost\browser\provider.ts`,
			code: `import * as metadata from '${metadataAlias}/vscode/reader.js';`,
			errors: errors('vscode'),
		},
		{
			name: 'Windows separators in relative import',
			filename: String.raw`C:\repo\src\vs\platform\agentHost\node\copilot\copilotAgentSession.ts`,
			code: String.raw`import type { Metadata } from '..\\..\\common\\meta\\copilotd\\copilotdMetadata.js';`,
			errors: errors('copilotd'),
		},
		{
			name: 'Windows absolute import',
			filename: `${repositoryRoot}/${featureFiles[0]}`,
			code: String.raw`import 'C:\\repo\\src\\vs\\platform\\agentHost\\common\\meta\\vscode\\reader.js';`,
			errors: errors('vscode'),
		},
		{
			name: 'test-like directory is not a test exemption',
			filename: `${repositoryRoot}/src/vs/platform/agentHost/contest/reader.ts`,
			code: `import '${metadataAlias}/vscode/reader.js';`,
			errors: errors('vscode'),
		},
		{
			name: 'feature test suffix outside test directory is not an exemption',
			filename: `${repositoryRoot}/src/vs/platform/agentHost/node/feature.test.ts`,
			code: `import '${metadataAlias}/copilotd/copilotdMetadata.js';`,
			errors: errors('copilotd'),
		},
		{
			name: 'other build tooling is not the schema generator',
			filename: `${repositoryRoot}/build/agentHost/feature.ts`,
			code: `import '${metadataAlias}/copilotd/copilotdMetadata.js';`,
			errors: errors('copilotd'),
		},
		{
			name: 'feature import of the private copilotd reader',
			filename: `${repositoryRoot}/${featureFiles[0]}`,
			code: `import { metadata } from '${metadataAlias}/copilotd/copilotdMetadataReader.js';`,
			errors: errors('copilotd'),
		},
	],
});

test('private agent-host metadata boundary is registered for all feature locations', async () => {
	const eslint = new ESLint({ cwd: repositoryRoot });
	const filenames = [...featureFiles, `${metadataDirectory}/agentToolCallMeta.ts`, 'build/agentHost/feature.ts'];
	const configurations = await Promise.all(filenames.map(filename => eslint.calculateConfigForFile(filename)));
	assert.deepStrictEqual(configurations.map(configuration => configuration.rules['local/code-no-private-agent-host-meta-import']), filenames.map(() => [2]));
});
