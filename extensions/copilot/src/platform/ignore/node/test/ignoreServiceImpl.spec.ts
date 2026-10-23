/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, suite, test } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICAPIClientService } from '../../../endpoint/common/capiClient';
import { MockFileSystemService } from '../../../filesystem/node/test/mockFileSystemService';
import { NullRequestLogger } from '../../../requestLogger/node/nullRequestLogger';
import { TestLogService } from '../../../testing/common/testLogService';
import { COPILOT_IGNORE_FILE_NAME, BaseIgnoreService } from '../ignoreServiceImpl';
import { MockAuthenticationService } from './mockAuthenticationService';
import { MockCAPIClientService } from './mockCAPIClientService';
import { MockGitService } from './mockGitService';
import { MockSearchService } from './mockSearchService';
import { MockWorkspaceService } from './mockWorkspaceService';

suite('BaseIgnoreService', () => {
	let ignoreService: BaseIgnoreService;
	let mockGitService: MockGitService;
	let mockAuthService: MockAuthenticationService;
	let mockCAPIClientService: MockCAPIClientService;
	let mockFileSystemService: MockFileSystemService;
	let mockWorkspaceService: MockWorkspaceService;
	let mockSearchService: MockSearchService;
	let now: number;

	const workspaceRoot = URI.file('/workspace');
	const ignoreFile = URI.file(`/workspace/${COPILOT_IGNORE_FILE_NAME}`);
	const secretFile = URI.file('/workspace/secrets/keys.ts');
	const ordinaryFile = URI.file('/workspace/src/index.ts');

	/** A token shaped like the one an organization with content exclusion enabled receives. */
	function tokenWithContentExclusion(enabled: boolean): Omit<CopilotToken, 'token'> {
		return new CopilotToken(createTestExtendedTokenInfo({ token: 'test-token', copilotignore_enabled: enabled }));
	}

	function createService(): BaseIgnoreService {
		return new BaseIgnoreService(
			mockGitService,
			new TestLogService(),
			// These mocks implement all the methods used by BaseIgnoreService, but don't satisfy the
			// full interface signatures (e.g., overloaded methods).
			mockAuthService as unknown as IAuthenticationService,
			mockWorkspaceService,
			mockCAPIClientService as unknown as ICAPIClientService,
			mockSearchService,
			mockFileSystemService,
			new NullRequestLogger(),
			() => now
		);
	}

	beforeEach(() => {
		now = Date.UTC(2026, 0, 1);
		mockGitService = new MockGitService();
		mockAuthService = new MockAuthenticationService();
		mockCAPIClientService = new MockCAPIClientService();
		mockFileSystemService = new MockFileSystemService();
		mockWorkspaceService = new MockWorkspaceService();
		mockSearchService = new MockSearchService();

		mockWorkspaceService.setWorkspaceFolders([workspaceRoot]);
		mockSearchService.setResults([ignoreFile]);
		mockFileSystemService.mockFile(ignoreFile, 'secrets/\n');
		// No repository, so only the local ignore file is in play unless a test says otherwise.
		mockGitService.setRepositoryFetchUrls(undefined);
	});

	describe('enablement', () => {
		test('adopts a token that was already present when the service was created', () => {
			mockAuthService.copilotToken = tokenWithContentExclusion(true);

			// No token change event fires: the token predates this service.
			expect(createService().isEnabled).toBe(true);
		});

		test('excludes a file for a token that was already present when the service was created', async () => {
			mockAuthService.copilotToken = tokenWithContentExclusion(true);
			ignoreService = createService();

			expect(await ignoreService.isCopilotIgnored(secretFile)).toBe(true);
		});

		test('picks up a token that arrives after the service was created', async () => {
			ignoreService = createService();
			const beforeToken = await ignoreService.isCopilotIgnored(secretFile);

			mockAuthService.setCopilotToken(tokenWithContentExclusion(true));

			expect({ beforeToken, afterToken: await ignoreService.isCopilotIgnored(secretFile) })
				.toEqual({ beforeToken: false, afterToken: true });
		});

		test('enforces a token that arrived without this service having handled the event yet', async () => {
			ignoreService = createService();

			// Models a listener registered before this service reacting to the same token arrival:
			// the token is readable, but no change event has reached the ignore service.
			mockAuthService.copilotToken = tokenWithContentExclusion(true);

			expect(await ignoreService.isCopilotIgnored(secretFile)).toBe(true);
		});

		test('allows every file while content exclusion is disabled for the token', async () => {
			mockAuthService.copilotToken = tokenWithContentExclusion(false);
			ignoreService = createService();

			expect(await ignoreService.isCopilotIgnored(secretFile)).toBe(false);
		});

		test('stops enforcing once a token without content exclusion replaces one that had it', async () => {
			mockAuthService.copilotToken = tokenWithContentExclusion(true);
			ignoreService = createService();
			const whileEnabled = await ignoreService.isCopilotIgnored(secretFile);

			mockAuthService.setCopilotToken(tokenWithContentExclusion(false));

			expect({ whileEnabled, afterDisabled: await ignoreService.isCopilotIgnored(secretFile) })
				.toEqual({ whileEnabled: true, afterDisabled: false });
		});
	});

	describe('local ignore files', () => {
		beforeEach(() => {
			mockAuthService.copilotToken = tokenWithContentExclusion(true);
		});

		test('excludes a file without init having been called explicitly', async () => {
			ignoreService = createService();

			// Nothing awaited init(), which is how the extension starts the service up.
			expect(await ignoreService.isCopilotIgnored(secretFile)).toBe(true);
		});

		test('waits for an in-progress workspace scan before answering', async () => {
			mockSearchService.blockSearches();
			ignoreService = createService();

			const verdict = ignoreService.isCopilotIgnored(secretFile);
			const settledEarly = await Promise.race([verdict, Promise.resolve('pending' as const)]);

			mockSearchService.releaseSearches();

			expect({ settledEarly, verdict: await verdict }).toEqual({ settledEarly: 'pending', verdict: true });
		});

		test('scans the workspace once no matter how many files are checked', async () => {
			ignoreService = createService();

			await Promise.all([
				ignoreService.isCopilotIgnored(secretFile),
				ignoreService.isCopilotIgnored(ordinaryFile),
				ignoreService.isCopilotIgnored(URI.file('/workspace/src/other.ts'))
			]);

			expect(mockSearchService.findFilesCallCount).toBe(1);
		});

		test('allows files the ignore file does not cover', async () => {
			ignoreService = createService();

			expect(await ignoreService.isCopilotIgnored(ordinaryFile)).toBe(false);
		});

		test('retries the workspace scan after a failure rather than remembering it', async () => {
			mockSearchService.failWith(new Error('workspace is not trusted'));
			ignoreService = createService();

			// A rejected scan must not poison the shared init promise, and must not be cached as if
			// it had found no ignore files, which would leave the session unenforced.
			const whileFailing = await ignoreService.isCopilotIgnored(secretFile);
			mockSearchService.failWith(undefined);
			now += 5_000;

			expect({ whileFailing, afterRecovery: await ignoreService.isCopilotIgnored(secretFile) })
				.toEqual({ whileFailing: false, afterRecovery: true });
		});

		test('does not rescan the workspace for every check while the scan keeps failing', async () => {
			mockSearchService.failWith(new Error('workspace is not trusted'));
			ignoreService = createService();

			// Enforcement runs once per search result, so an unbounded retry would turn a failing
			// workspace into a stall rather than an answer.
			for (let i = 0; i < 20; i++) {
				await ignoreService.isCopilotIgnored(URI.file(`/workspace/src/file${i}.ts`));
			}

			expect(mockSearchService.findFilesCallCount).toBe(1);
		});
	});
});
