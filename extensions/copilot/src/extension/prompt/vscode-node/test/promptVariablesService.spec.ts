/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, test } from 'vitest';
import type { ChatLanguageModelToolReference, ChatPromptReference } from 'vscode';
import { IChatDebugFileLoggerService, NullChatDebugFileLoggerService } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../../platform/test/node/services';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { PromptVariablesServiceImpl } from '../promptVariablesService';

class MockChatDebugFileLoggerService extends NullChatDebugFileLoggerService {
	private readonly _sessionDirs = new Map<string, URI>();

	setSessionDir(sessionId: string, dir: URI): void {
		this._sessionDirs.set(sessionId, dir);
	}

	override getSessionDir(sessionId: string): URI | undefined {
		return this._sessionDirs.get(sessionId);
	}
}

function createServicesWithLogger(mockLogger?: MockChatDebugFileLoggerService): { testingServiceCollection: TestingServiceCollection; mockLogger: MockChatDebugFileLoggerService } {
	const logger = mockLogger ?? new MockChatDebugFileLoggerService();
	const testingServiceCollection = createExtensionUnitTestingServices();
	// Provide a globalStorageUri so VSCODE_USER_PROMPTS_FOLDER can resolve
	const ctx = new MockExtensionContext(join(tmpdir(), 'copilot-test-globalStorage'));
	testingServiceCollection.define(IVSCodeExtensionContext, ctx as any);
	testingServiceCollection.define(IChatDebugFileLoggerService, logger);
	return { testingServiceCollection, mockLogger: logger };
}

describe('PromptVariablesServiceImpl', () => {
	let accessor: ITestingServicesAccessor;
	let service: PromptVariablesServiceImpl;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		// Create the service via DI so its dependencies (fs + workspace) come from the test container
		service = accessor.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);
	});

	test('replaces variable ranges with link markdown', async () => {
		const original = 'Start #VARIABLE1 #VARIABLE2 End #VARIABLE3';

		const variables: ChatPromptReference[] = [];
		['#VARIABLE1', '#VARIABLE2', '#VARIABLE3'].forEach((varName, index) => {
			const start = original.indexOf(varName);
			const end = start + varName.length;
			variables.push({
				id: 'file' + index,
				name: 'file' + index,
				value: Uri.file(`/virtual/workspace/sample${index}.txt`),
				range: [start, end]
			});
		});

		const { message } = await service.resolveVariablesInPrompt(original, variables);
		expect(message).toBe('Start [#file0](#file0-context) [#file1](#file1-context) End [#file2](#file2-context)');
	});

	test('replaces multiple tool references (deduplicating identical ranges) in reverse-sorted order', async () => {
		// message with two target substrings we will replace: TOOLX and TOOLY
		const message = 'Call #TOOLX then maybe #TOOLY finally done';

		const toolRefs: ChatLanguageModelToolReference[] = [];
		['#TOOLX', '#TOOLY'].forEach((toolRef, index) => {
			const start = message.indexOf(toolRef);
			const end = start + toolRef.length;
			toolRefs.push({
				name: 'tool' + index,
				range: [start, end]
			});
			toolRefs.push({
				name: 'tool' + index + 'Duplicate',
				range: [start, end]
			});

		});

		const rewritten = await service.resolveToolReferencesInPrompt(message, toolRefs);
		// Expect TOOLY replaced, then TOOLX replaced; duplicates ignored
		expect(rewritten).toBe('Call \'tool0\' then maybe \'tool1\' finally done');
	});

	test('handles no-op when no variables or tool references', async () => {
		const msg = 'Nothing to change';
		const { message: out } = await service.resolveVariablesInPrompt(msg, []);
		const rewritten = await service.resolveToolReferencesInPrompt(out, []);
		expect(rewritten).toBe(msg);
	});

	describe('buildTemplateVariablesContext', () => {
		test('returns empty string when no session id and no debug target session ids are given', () => {
			// Default NullChatDebugFileLoggerService returns undefined for every getSessionDir,
			// so VSCODE_TARGET_SESSION_LOG resolves to undefined.
			// VSCODE_USER_PROMPTS_FOLDER always resolves, so build a fresh service with the default null logger.
			const { testingServiceCollection } = createServicesWithLogger();
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);
			const result = svc.buildTemplateVariablesContext(undefined);
			// Only VSCODE_USER_PROMPTS_FOLDER should be present
			expect(result).toContain('VSCODE_USER_PROMPTS_FOLDER');
			expect(result).not.toContain('VSCODE_TARGET_SESSION_LOG');
		});

		test('resolves single sessionId to session log path', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			mockLogger.setSessionDir('session-1', URI.file('/logs/session-1'));
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext('session-1');
			expect(result).toContain('VSCODE_TARGET_SESSION_LOG');
			expect(result).toContain('/logs/session-1');
		});

		test('prioritizes debugTargetSessionIds over sessionId', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			mockLogger.setSessionDir('session-1', URI.file('/logs/session-1'));
			mockLogger.setSessionDir('target-1', URI.file('/logs/target-1'));
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext('session-1', ['target-1']);
			expect(result).toContain('/logs/target-1');
			// session-1 should NOT appear because debugTargetSessionIds takes precedence
			expect(result).not.toContain('/logs/session-1');
		});

		test('formats multiple debugTargetSessionIds as comma-separated paths', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			mockLogger.setSessionDir('target-1', URI.file('/logs/target-1'));
			mockLogger.setSessionDir('target-2', URI.file('/logs/target-2'));
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext(undefined, ['target-1', 'target-2']);
			expect(result).toContain('VSCODE_TARGET_SESSION_LOG');
			expect(result).toContain('/logs/target-1');
			expect(result).toContain('/logs/target-2');
			// Both paths joined with comma
			expect(result).toMatch(/\/logs\/target-1, \/logs\/target-2/);
		});

		test('skips debugTargetSessionIds whose session dirs are missing', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			// Only target-2 has a session dir; target-1 does not
			mockLogger.setSessionDir('target-2', URI.file('/logs/target-2'));
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext(undefined, ['target-1', 'target-2']);
			expect(result).toContain('/logs/target-2');
			expect(result).not.toContain('target-1');
		});

		test('includes VSCODE_TARGET_SESSION_LOG with empty value when all debugTargetSessionIds have missing dirs', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			// No session dirs set at all
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext(undefined, ['no-such-session']);
			// The resolver returns '' (empty string) when all dirs are missing, not undefined,
			// so the variable is still present in the output with an empty value.
			expect(result).toContain('VSCODE_TARGET_SESSION_LOG');
			expect(result).toMatch(/VSCODE_TARGET_SESSION_LOG:\s*$/m);
		});

		test('includes VSCODE_USER_PROMPTS_FOLDER derived from global storage URI', () => {
			const { testingServiceCollection } = createServicesWithLogger();
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext(undefined);
			expect(result).toContain('VSCODE_USER_PROMPTS_FOLDER');
			// The path should end with /prompts
			expect(result).toMatch(/prompts/);
		});

		test('returns empty string when sessionId has no session dir and no debugTargetSessionIds', () => {
			const mockLogger = new MockChatDebugFileLoggerService();
			// session-missing has no dir registered
			const { testingServiceCollection } = createServicesWithLogger(mockLogger);
			const acc = testingServiceCollection.createTestingAccessor();
			const svc = acc.get(IInstantiationService).createInstance(PromptVariablesServiceImpl);

			const result = svc.buildTemplateVariablesContext('session-missing');
			// VSCODE_USER_PROMPTS_FOLDER still resolves
			expect(result).toContain('VSCODE_USER_PROMPTS_FOLDER');
			// But session log should not be present
			expect(result).not.toContain('VSCODE_TARGET_SESSION_LOG');
		});
	});
});
