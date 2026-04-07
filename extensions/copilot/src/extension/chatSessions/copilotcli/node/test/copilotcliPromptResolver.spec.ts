/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { IIgnoreService, NullIgnoreService } from '../../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { NullWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { IWorkspaceInfo } from '../../../common/workspaceInfo';
import { ICopilotCLIImageSupport } from '../copilotCLIImageSupport';
import { CopilotCLIPromptResolver } from '../copilotcliPromptResolver';
import { MockSkillLocations, NullICopilotCLIImageSupport } from './testHelpers';

// Mock generateUserPrompt to avoid TSX rendering complexity in unit tests
vi.mock('../../../../prompts/node/agent/copilotCLIPrompt', () => ({
	generateUserPrompt: vi.fn(async (_request: unknown, prompt: string | undefined, _variables: unknown, _instantiationService: unknown) => prompt ?? ''),
}));

const noopWorkspaceInfo: IWorkspaceInfo = {
	folder: undefined,
	repository: undefined,
	worktree: undefined,
	worktreeProperties: undefined,
};

function makePromptFileReference(uri: URI) {
	return {
		id: 'vscode.prompt.file',
		value: uri,
		name: uri.fsPath,
	};
}

describe('CopilotCLIPromptResolver', () => {
	let disposables: DisposableStore;
	let resolver: CopilotCLIPromptResolver;
	let skillLocations: MockSkillLocations;
	let logService: ILogService;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = disposables.add(services.createTestingAccessor());
		logService = accessor.get(ILogService);
		instantiationService = accessor.get(IInstantiationService);
		skillLocations = new MockSkillLocations();
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createResolver(overrideSkillLocations?: MockSkillLocations) {
		const imageSupport = new NullICopilotCLIImageSupport();
		const workspaceService = new NullWorkspaceService();
		const ignoreService = new NullIgnoreService();
		const fileSystemService = new MockFileSystemService();
		return new CopilotCLIPromptResolver(
			imageSupport as unknown as ICopilotCLIImageSupport,
			logService,
			fileSystemService,
			workspaceService,
			instantiationService,
			ignoreService as unknown as IIgnoreService,
			overrideSkillLocations ?? skillLocations,
		);
	}

	describe('resolvePrompt', () => {
		it('returns the prompt and empty attachments for a basic request with no references', async () => {
			resolver = createResolver();
			const request = new TestChatRequest('hello world');
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], CancellationToken.None);
			expect(result.prompt).toBe('hello world');
			expect(result.attachments).toHaveLength(0);
			expect(result.references).toHaveLength(0);
		});

		it('uses the provided prompt override instead of request.prompt', async () => {
			resolver = createResolver();
			const request = new TestChatRequest('original prompt');
			const result = await resolver.resolvePrompt(request, 'override prompt', [], noopWorkspaceInfo, [], CancellationToken.None);
			expect(result.prompt).toBe('override prompt');
		});

		it('cancellation token: returns empty result when cancelled', async () => {
			resolver = createResolver();
			const request = new TestChatRequest('hello');
			const cancelledToken = CancellationToken.Cancelled;
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], cancelledToken);
			expect(result.attachments).toHaveLength(0);
			expect(result.references).toHaveLength(0);
		});
	});

	describe('skill prompt file filtering', () => {
		it('excludes prompt file references that are within known skill locations', async () => {
			const skillsDir = URI.file('/home/user/.skills');
			const skillFile = URI.joinPath(skillsDir, 'my-skill.prompt.md');
			skillLocations = new MockSkillLocations([skillsDir]);
			resolver = createResolver(skillLocations);

			const request = new TestChatRequest('use the skill', [makePromptFileReference(skillFile)]);
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], CancellationToken.None);

			// The prompt file is within the known skill location, so it should not appear in references
			expect(result.references).toHaveLength(0);
			expect(result.attachments).toHaveLength(0);
		});

		it('includes prompt file references that are NOT within known skill locations', async () => {
			const skillsDir = URI.file('/home/user/.skills');
			const nonSkillPromptFile = URI.file('/workspace/some-other.prompt.md');
			skillLocations = new MockSkillLocations([skillsDir]);
			resolver = createResolver(skillLocations);

			// The file must exist for the filesystem stat to succeed; since MockFileSystemService
			// is not set up here, the file attachment will fail silently but the reference
			// still goes through the full pipeline (no early skip).
			const request = new TestChatRequest('use a prompt file', [makePromptFileReference(nonSkillPromptFile)]);
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], CancellationToken.None);

			// The prompt file is NOT in a skill location, so it should appear in references
			// (even if attachment fails due to mock filesystem not having the file)
			expect(result.references).toHaveLength(1);
			expect((result.references[0].value as URI).fsPath).toBe(nonSkillPromptFile.fsPath);
		});

		it('excludes prompt file when it is in a subdirectory of a known skill location', async () => {
			const skillsDir = URI.file('/home/user/.skills');
			const nestedSkillFile = URI.joinPath(skillsDir, 'subdir', 'nested.prompt.md');
			skillLocations = new MockSkillLocations([skillsDir]);
			resolver = createResolver(skillLocations);

			const request = new TestChatRequest('use nested skill', [makePromptFileReference(nestedSkillFile)]);
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], CancellationToken.None);

			expect(result.references).toHaveLength(0);
		});

		it('includes prompt file when no skill locations are configured', async () => {
			skillLocations = new MockSkillLocations([]);
			resolver = createResolver(skillLocations);

			const promptFile = URI.file('/workspace/my.prompt.md');
			const request = new TestChatRequest('use prompt', [makePromptFileReference(promptFile)]);
			const result = await resolver.resolvePrompt(request, undefined, [], noopWorkspaceInfo, [], CancellationToken.None);

			// No skill locations, so prompt file goes through the full pipeline
			expect(result.references).toHaveLength(1);
		});
	});
});
