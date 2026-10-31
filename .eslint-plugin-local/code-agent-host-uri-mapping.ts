/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as eslint from 'eslint';
import type { TSESTree } from '@typescript-eslint/utils';
import { posix } from 'path';

const repositoryRoot = posix.normalize(`${import.meta.dirname.replace(/\\/g, '/')}/..`);

function isRemoteScheme(node: TSESTree.Node): boolean {
	return (node.type === 'Literal' && node.value === 'vscode-remote')
		|| (node.type === 'MemberExpression' && !node.computed
			&& node.object.type === 'Identifier' && node.object.name === 'Schemas'
			&& node.property.type === 'Identifier' && node.property.name === 'vscodeRemote');
}

export default new class AgentHostUriMapping implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			rawConversion: 'Map connection resources through the owning connection\'s `resourceUris.toAgentHost` / `resourceUris.fromAgentHost`. Otherwise, add `eslint-disable-next-line local/code-agent-host-uri-mapping -- <reason>` explaining why this is not a connection resource (for example, an Agent Host filesystem/content URI, a legacy local wrapper, or the definition of a connection mapper).',
			remoteSchemeSpecialCase: 'Compare in the connection\'s URI space via its `resourceUris` mapper instead of special-casing `vscode-remote`.',
		},
		docs: {
			description: 'Map Agent Host connection resources through the owning connection\'s resourceUris mapper.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const filename = posix.normalize(context.filename.replace(/\\/g, '/'));
		const relativeFilename = posix.relative(repositoryRoot, filename);
		if (/(?:^|\/)test\//.test(relativeFilename)) {
			return {};
		}
		const isAgentHostFile = /agentHost|AgentHost/.test(relativeFilename);

		return {
			CallExpression: (node: TSESTree.CallExpression) => {
				const callee = node.callee;
				const name = callee.type === 'Identifier' ? callee.name
					: callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name
						: undefined;
				if (name === 'fromAgentHostUri' || name === 'toAgentHostUri') {
					context.report({ loc: node.loc, messageId: 'rawConversion' });
				}
			},
			BinaryExpression: (node: TSESTree.BinaryExpression) => {
				if (isAgentHostFile && (node.operator === '===' || node.operator === '!==')
					&& (isRemoteScheme(node.left) || isRemoteScheme(node.right))) {
					context.report({ loc: node.loc, messageId: 'remoteSchemeSpecialCase' });
				}
			},
		};
	}
};
