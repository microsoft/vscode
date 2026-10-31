/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESLint, RuleTester } from 'eslint';
import { suite, test } from 'node:test';
import { posix } from 'path';
import tseslint from 'typescript-eslint';
import rule from '../code-agent-host-uri-mapping.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const repositoryRoot = posix.normalize(`${import.meta.dirname.replace(/\\/g, '/')}/../..`);
const featureFiles = [
	'src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/consumer.ts',
	'src/vs/sessions/contrib/providers/remoteAgentHost/browser/consumer.ts',
];
const agentHostFilename = `${repositoryRoot}/${featureFiles[0]}`;
const otherFilename = `${repositoryRoot}/src/vs/workbench/contrib/files/browser/consumer.ts`;

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('code-agent-host-uri-mapping', rule, {
	valid: [
		{
			name: 'owning connection resource mappers',
			filename: agentHostFilename,
			code: 'connection.resourceUris.toAgentHost(uri); connection.resourceUris.fromAgentHost(uri);',
		},
		{
			name: 'unrelated names and content reference wrapping',
			filename: agentHostFilename,
			code: 'fromOtherUri(uri); toOtherUri(uri); toAgentHostContentUri(uri, authority);',
		},
		{
			name: 'imports and references are not conversion calls',
			filename: agentHostFilename,
			code: `import { toAgentHostUri } from './uri.js'; const mapper = toAgentHostUri;`,
		},
		{
			name: 'remote scheme comparisons outside agent-host consumers',
			filename: otherFilename,
			code: `uri.scheme === Schemas.vscodeRemote; 'vscode-remote' !== uri.scheme;`,
		},
		{
			name: 'other schemes and non-strict operators',
			filename: agentHostFilename,
			code: `uri.scheme === Schemas.file; uri.scheme !== other.vscodeRemote; uri.scheme == Schemas.vscodeRemote; uri.scheme != 'vscode-remote';`,
		},
		...[
			'src/vs/workbench/contrib/chat/test/browser/agentHost/consumer.test.ts',
			'src/vs/sessions/contrib/providers/agentHost/test/browser/consumer.test.ts',
			'test/agentHost/consumer.ts',
		].map(filename => ({
			name: `test directory exemption in ${filename}`,
			filename: `${repositoryRoot}/${filename}`,
			code: `fromAgentHostUri(uri); toAgentHostUri(uri, authority); uri.scheme === Schemas.vscodeRemote; uri.scheme !== 'vscode-remote';`,
		})),
		{
			name: 'Windows test directory exemption',
			filename: String.raw`C:\repo\src\vs\sessions\contrib\providers\agentHost\test\browser\consumer.ts`,
			code: `toAgentHostUri(uri, authority); uri.scheme === 'vscode-remote';`,
		},
	],
	invalid: [
		...['fromAgentHostUri', 'toAgentHostUri'].flatMap(name => [
			{
				name: `direct ${name} call`,
				filename: agentHostFilename,
				code: `${name}(uri, authority);`,
				errors: [{ messageId: 'rawConversion' }],
			},
			{
				name: `member ${name} call`,
				filename: agentHostFilename,
				code: `helpers.${name}(uri, authority);`,
				errors: [{ messageId: 'rawConversion' }],
			},
			{
				name: `${name} outside agent-host consumers`,
				filename: otherFilename,
				code: `${name}(uri);`,
				errors: [{ messageId: 'rawConversion' }],
			},
		]),
		...featureFiles.flatMap(filename => ['Schemas.vscodeRemote', `'vscode-remote'`].flatMap(scheme => ['===', '!=='].flatMap(operator => [
			{
				name: `${filename}: scheme on right ${operator} ${scheme}`,
				filename: `${repositoryRoot}/${filename}`,
				code: `uri.scheme ${operator} ${scheme};`,
				errors: [{ messageId: 'remoteSchemeSpecialCase' }],
			},
			{
				name: `${filename}: scheme on left ${scheme} ${operator}`,
				filename: `${repositoryRoot}/${filename}`,
				code: `${scheme} ${operator} uri.scheme;`,
				errors: [{ messageId: 'remoteSchemeSpecialCase' }],
			},
		]))),
		{
			name: 'AgentHost filename and multiline comparison',
			filename: `${repositoryRoot}/src/vs/workbench/services/example/browser/remoteAgentHostConsumer.ts`,
			code: 'uri.scheme\n === "vscode-remote";',
			errors: [{ messageId: 'remoteSchemeSpecialCase' }],
		},
		{
			name: 'Windows agent-host consumer',
			filename: String.raw`C:\repo\src\vs\sessions\contrib\providers\agentHost\browser\consumer.ts`,
			code: 'uri.scheme !== Schemas.vscodeRemote;',
			errors: [{ messageId: 'remoteSchemeSpecialCase' }],
		},
		{
			name: 'test-like directories do not skip enforcement',
			filename: `${repositoryRoot}/src/vs/workbench/contrib/agentHost/contest/consumer.ts`,
			code: 'fromAgentHostUri(uri);',
			errors: [{ messageId: 'rawConversion' }],
		},
	],
});

test('agent-host URI mapping ratchet is scoped to workbench and sessions', async () => {
	const eslint = new ESLint({ cwd: repositoryRoot });
	const filenames = [...featureFiles, 'src/vs/workbench/contrib/files/browser/consumer.ts', 'src/vs/platform/agentHost/common/agentHostUri.ts'];
	const configurations = await Promise.all(filenames.map(filename => eslint.calculateConfigForFile(filename)));
	assert.deepStrictEqual(configurations.map(configuration => configuration.rules['local/code-agent-host-uri-mapping']), [[2], [2], [2], undefined]);
});
