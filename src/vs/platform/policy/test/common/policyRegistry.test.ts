/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PolicyKeys, getPolicyMetadata, isValidPolicyKey } from '../../../common/policyRegistry.js';

suite('PolicyRegistry', () => {

	test('ChatMCP policy is defined with correct metadata', () => {
		const chatMcpPolicy = PolicyKeys.ChatMCP;
		
		assert.strictEqual(chatMcpPolicy.name, 'ChatMCP');
		assert.strictEqual(chatMcpPolicy.minimumVersion, '1.99');
		assert.strictEqual(chatMcpPolicy.description, 'Controls whether Model Context Protocol integration is enabled for chat');
	});

	test('getPolicyMetadata returns correct metadata', () => {
		const metadata = getPolicyMetadata('ChatMCP');
		
		assert.strictEqual(metadata.name, 'ChatMCP');
		assert.strictEqual(metadata.minimumVersion, '1.99');
		assert.strictEqual(metadata.description, 'Controls whether Model Context Protocol integration is enabled for chat');
	});

	test('isValidPolicyKey returns true for valid keys', () => {
		assert.strictEqual(isValidPolicyKey('ChatMCP'), true);
	});

	test('isValidPolicyKey returns false for invalid keys', () => {
		assert.strictEqual(isValidPolicyKey('InvalidKey'), false);
		assert.strictEqual(isValidPolicyKey(''), false);
	});
});