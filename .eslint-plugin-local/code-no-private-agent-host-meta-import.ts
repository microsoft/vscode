/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as eslint from 'eslint';
import type { TSESTree } from '@typescript-eslint/utils';
import { posix } from 'path';
import { createImportRuleListener } from './utils.ts';

const metadataDirectory = 'src/vs/platform/agentHost/common/meta';
const metadataPathPattern = new RegExp(`(?:^|/)${metadataDirectory}/(.*)$`);
const privateDirectories = new Set(['copilotd', 'vscode']);
const repositoryRoot = normalizePath(`${import.meta.dirname}/..`);

function normalizePath(value: string): string {
	return posix.normalize(value.replace(/\\/g, '/'));
}

function getMetadataPath(value: string): string | undefined {
	return metadataPathPattern.exec(value)?.[1];
}

export default new class NoPrivateAgentHostMetaImport implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			privateMetadata: 'Host-specific metadata in `{{directory}}` is private. Import domain helpers and portable types from top-level `src/vs/platform/agentHost/common/meta/*.ts` modules instead.',
		},
		docs: {
			description: 'Keep host-specific metadata implementations behind top-level domain helpers.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const filename = normalizePath(context.filename);
		const relativeFilename = posix.relative(repositoryRoot, filename);
		const importerMetadataPath = getMetadataPath(filename);
		const importerPrivateDirectory = importerMetadataPath?.split('/')[0];

		// Raw parsing/vector tests and the schema generator exercise the private wire format.
		if (/(?:^|\/)test\//.test(relativeFilename)
			|| relativeFilename === 'build/agentHost/generateCopilotMetadata.ts'
			|| (importerMetadataPath !== undefined && !importerMetadataPath.includes('/') && importerMetadataPath.endsWith('.ts'))) {
			return {};
		}

		const checkImport = (node: TSESTree.Literal, value: string): void => {
			let importedPath = value.replace(/\\/g, '/');
			if (importedPath.startsWith('.')) {
				importedPath = posix.join(posix.dirname(filename), importedPath);
			} else if (importedPath.startsWith('vs/')) {
				importedPath = `src/${importedPath}`;
			}

			const importedMetadataPath = getMetadataPath(normalizePath(importedPath));
			const importedPrivateDirectory = importedMetadataPath?.split('/')[0];
			if (importedPrivateDirectory === undefined
				|| !privateDirectories.has(importedPrivateDirectory)
				|| importedPrivateDirectory === importerPrivateDirectory) {
				return;
			}

			context.report({
				loc: node.loc,
				messageId: 'privateMetadata',
				data: { directory: `${metadataDirectory}/${importedPrivateDirectory}` },
			});
		};

		return {
			...createImportRuleListener(checkImport),
			'ImportExpression > Literal, TSImportType > Literal, CallExpression[callee.type="Identifier"][callee.name="require"][arguments.length=1] > Literal': (node: TSESTree.Literal) => {
				if (typeof node.value === 'string') {
					checkImport(node, node.value);
				}
			},
		};
	}
};
