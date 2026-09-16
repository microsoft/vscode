/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import ts from 'typescript';
import { beforeAll, suite, test } from 'vitest';

import { mock } from '../../../../../../util/common/test/simpleMock';
import { ErrorCode } from '../../common/protocol';

type Handler = (request: ts.server.protocol.Request) => ts.server.HandlerResponse;

class TestSession extends mock<ts.server.Session>() {
	readonly protocolHandlers = new Map<string, Handler>();

	override addProtocolHandler(command: string, handler: Handler): void {
		this.protocolHandlers.set(command, handler);
	}
}

suite('TypeScript server request validation', () => {
	const session = new TestSession();

	beforeAll(async () => {
		const TS = await import('../../common/typescript');
		TS.default.install(ts);
		const { create } = await import('../create');
		create(new class extends mock<ts.server.PluginCreateInfo>() {
			override session = session;
			override languageService = new (mock<ts.LanguageService>())();
			override languageServiceHost = new (mock<ts.LanguageServiceHost>())();
		});
	});

	for (const command of ['_.copilot.typeScriptMetrics', '_.copilot.typeScriptChangeClassification']) {
		test.each([undefined, '', 42])(`${command} rejects invalid file %s before project lookup`, file => {
			const handler = session.protocolHandlers.get(command);
			assert.ok(handler);
			assert.deepStrictEqual(handler({
				seq: 1,
				type: 'request',
				command,
				arguments: { file, line: 1, offset: 1 },
			}), {
				response: { error: ErrorCode.invalidArguments, message: 'File must be a non-empty string' },
				responseRequired: true,
			});
		});
	}
});
