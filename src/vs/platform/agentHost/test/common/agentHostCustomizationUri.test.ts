/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
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
});
