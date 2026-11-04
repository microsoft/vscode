/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, getMcpSkillCustomizationUri, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { buildMcpResourceUri } from '../../common/mcpResourceUri.js';
import { toAgentHostUri } from '../../common/agentHostUri.js';

suite('Agent Host customization URI', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes raw and client-wrapped built-in customizations', () => {
		const builtIn = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/init' });

		assert.deepStrictEqual({
			raw: isAgentBuiltinCustomizationUri(builtIn),
			wrapped: isAgentBuiltinCustomizationUri(toAgentHostUri(builtIn, 'remote')),
			file: isAgentBuiltinCustomizationUri(URI.file('/workspace/SKILL.md')),
			rawReadable: hasReadableCustomizationContent(builtIn),
			wrappedReadable: hasReadableCustomizationContent(toAgentHostUri(builtIn, 'remote')),
			fileReadable: hasReadableCustomizationContent(URI.file('/workspace/SKILL.md')),
		}, {
			raw: true,
			wrapped: true,
			file: false,
			rawReadable: false,
			wrappedReadable: false,
			fileReadable: true,
		});

	});

	test('only host-routable MCP skills expose readable content', () => {
		const readable = URI.parse(buildMcpResourceUri('opaque-mcp-channel:skills', 'skill://server/friendly/SKILL.md', 'Friendly'));
		const unavailable = URI.parse('skill://server/friendly/SKILL.md');
		assert.deepStrictEqual([readable, unavailable].map(resource => {
			const uri = getMcpSkillCustomizationUri(resource);
			return {
				scheme: uri.scheme,
				readable: hasReadableCustomizationContent(uri),
				wrappedReadable: hasReadableCustomizationContent(toAgentHostUri(uri, 'remote')),
			};
		}), [
			{ scheme: 'mcp-resource', readable: true, wrappedReadable: true },
			{ scheme: AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, readable: false, wrappedReadable: false },
		]);
	});

	test('discovery identities do not imply readable source files', () => {
		const resource = URI.from({ scheme: AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, authority: 'copilot', path: '/hooks', fragment: 'opaque-id' });
		assert.deepStrictEqual([resource, toAgentHostUri(resource, 'remote')].map(uri => ({
			readable: hasReadableCustomizationContent(uri),
			builtin: isAgentBuiltinCustomizationUri(uri),
		})), [{ readable: false, builtin: false }, { readable: false, builtin: false }]);
	});
});
