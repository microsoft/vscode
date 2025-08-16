/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { ChatRequestTerminalCommandPart } from '../../common/chatParserTypes.js';

suite('ChatTerminalCommand', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should parse terminal command with !', () => {
		const parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('test-session', '!ls -la', ChatAgentLocation.Panel);

		assert.strictEqual(result.parts.length, 1);
		assert.ok(result.parts[0] instanceof ChatRequestTerminalCommandPart);

		const terminalPart = result.parts[0] as ChatRequestTerminalCommandPart;
		assert.strictEqual(terminalPart.command, 'ls -la');
		assert.strictEqual(terminalPart.text, '!ls -la');
		assert.strictEqual(terminalPart.promptText, '!ls -la');
	});

	test('should parse terminal command with complex command', () => {
		const parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('test-session', '!git status && git add .', ChatAgentLocation.Panel);

		assert.strictEqual(result.parts.length, 1);
		assert.ok(result.parts[0] instanceof ChatRequestTerminalCommandPart);

		const terminalPart = result.parts[0] as ChatRequestTerminalCommandPart;
		assert.strictEqual(terminalPart.command, 'git status && git add .');
	});

	test('should not parse regular text starting with !', () => {
		const parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('test-session', '! This is just text', ChatAgentLocation.Panel);

		// Should not be parsed as terminal command since there's a space after !
		assert.strictEqual(result.parts.length, 1);
		assert.ok(!(result.parts[0] instanceof ChatRequestTerminalCommandPart));
	});

	test('should handle empty command after !', () => {
		const parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('test-session', '!', ChatAgentLocation.Panel);

		// Should not be parsed as terminal command since there's no command
		assert.strictEqual(result.parts.length, 1);
		assert.ok(!(result.parts[0] instanceof ChatRequestTerminalCommandPart));
	});

	test('should parse terminal command with quotes', () => {
		const parser = instantiationService.createInstance(ChatRequestParser);
		const result = parser.parseChatRequest('test-session', '!echo "Hello World"', ChatAgentLocation.Panel);

		assert.strictEqual(result.parts.length, 1);
		assert.ok(result.parts[0] instanceof ChatRequestTerminalCommandPart);

		const terminalPart = result.parts[0] as ChatRequestTerminalCommandPart;
		assert.strictEqual(terminalPart.command, 'echo "Hello World"');
	});
});
