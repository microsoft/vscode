/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { getAbsoluteUri } from '../util/openDocumentLink';

suite('Open Markdown document link', () => {
	test('recognizes absolute links without treating relative links as URIs', () => {
		assert.deepStrictEqual({
			github: getAbsoluteUri('https://github.com/microsoft/vscode/issues/123')?.toString(),
			session: getAbsoluteUri('agent-host-session://copilotcli/session-id?chat=chat-id')?.toString(),
			file: getAbsoluteUri('file:///workspace/readme.md')?.toString(),
			windowsForwardSlash: getAbsoluteUri('C:/workspace/readme.md'),
			windowsBackslash: getAbsoluteUri('C:\\workspace\\readme.md'),
			relative: getAbsoluteUri('./readme.md'),
		}, {
			github: 'https://github.com/microsoft/vscode/issues/123',
			session: 'agent-host-session://copilotcli/session-id?chat%3Dchat-id',
			file: 'file:///workspace/readme.md',
			windowsForwardSlash: undefined,
			windowsBackslash: undefined,
			relative: undefined,
		});
	});
});
