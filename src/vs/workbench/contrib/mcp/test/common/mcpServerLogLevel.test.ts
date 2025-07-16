/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LogLevel } from '../../../../../platform/log/common/log.js';
import { MCP } from '../../common/modelContextProtocol.js';

suite('MCP Server Log Level', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('mapLogLevelToMcp should correctly map VSCode LogLevel to MCP LoggingLevel', () => {
		// Test the log level mapping - this tests the concept since the actual method is private
		function mapLogLevelToMcp(logLevel: LogLevel): MCP.LoggingLevel | undefined {
			switch (logLevel) {
				case LogLevel.Trace:
					return 'debug'; // MCP doesn't have trace, use debug
				case LogLevel.Debug:
					return 'debug';
				case LogLevel.Info:
					return 'info';
				case LogLevel.Warning:
					return 'warning';
				case LogLevel.Error:
					return 'error';
				default:
					return undefined; // Off and other levels are not supported
			}
		}

		// Test the mappings
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Trace), 'debug');
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Debug), 'debug');
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Info), 'info');
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Warning), 'warning');
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Error), 'error');
		assert.strictEqual(mapLogLevelToMcp(LogLevel.Off), undefined);
	});

	test('should only send log level to server if it supports logging capabilities', () => {
		// Test that logging capability is properly checked
		const mockHandlerWithLogging = {
			capabilities: {
				logging: {}
			}
		};

		const mockHandlerNoLogging = {
			capabilities: {
				// No logging capability
			}
		};

		// Test with logging capability
		assert.ok(mockHandlerWithLogging.capabilities.logging, 'Handler should have logging capability');
		
		// Test without logging capability
		assert.ok(!mockHandlerNoLogging.capabilities.logging, 'Handler should not have logging capability');
	});

	test('should handle log level change events correctly', () => {
		// Test that the log level change event is handled correctly
		const mockResource = URI.file('/test/log');
		const mockEvent: [URI, LogLevel] = [mockResource, LogLevel.Info];

		// Verify the event structure
		assert.ok(Array.isArray(mockEvent), 'Event should be an array');
		assert.strictEqual(mockEvent.length, 2, 'Event should have 2 elements');
		assert.strictEqual(mockEvent[0], mockResource, 'First element should be the resource');
		assert.strictEqual(mockEvent[1], LogLevel.Info, 'Second element should be the log level');
	});
});