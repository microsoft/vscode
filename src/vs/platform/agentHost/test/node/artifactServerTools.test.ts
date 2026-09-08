/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getErrorMessage } from '../../../../base/common/errors.js';
import type { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { ARTIFACT_TOOLS_INSTRUCTION, artifactServerToolDefinitions, createArtifactServerToolGroup } from '../../node/shared/artifactServerTools.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Artifact Server Tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const group = createArtifactServerToolGroup();
	const display = (toolName: string, args: unknown, result?: { text: string; success: boolean }) => group.getDisplay?.(toolName, args, result);

	test('names what was recorded, from the isArtifact flag', () => {
		assert.deepStrictEqual({
			artifact: display(ArtifactServerToolName.AddArtifactOrReference, { label: 'Fix login', isArtifact: true }),
			reference: display(ArtifactServerToolName.AddArtifactOrReference, { label: 'Broken commit', isArtifact: false }),
			unlabelled: display(ArtifactServerToolName.AddArtifactOrReference, { isArtifact: false }),
			malformed: display(ArtifactServerToolName.AddArtifactOrReference, undefined),
		}, {
			artifact: { displayName: 'Add Artifact', invocationMessage: 'Add artifact "Fix login"', pastTenseMessage: 'Added artifact "Fix login"' },
			reference: { displayName: 'Add Reference', invocationMessage: 'Add reference "Broken commit"', pastTenseMessage: 'Added reference "Broken commit"' },
			unlabelled: { displayName: 'Add Reference', invocationMessage: 'Add reference', pastTenseMessage: 'Added reference' },
			malformed: { displayName: 'Add Artifact or Reference', invocationMessage: 'Add artifact or reference', pastTenseMessage: 'Added artifact or reference' },
		});
	});

	test('requires model-provided file paths to be absolute URIs', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);

		assert.deepStrictEqual(addDefinition?.inputSchema?.properties?.uri, {
			type: 'string',
			description: 'Absolute URI including its scheme. For a local file, pass a file URI such as `file:///C:/path/to/file`, not a plain file system path such as `C:\\path\\to\\file`. Required for the `file` and `resource` kinds.',
		});
	});

	test('excludes session-management results from artifacts', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);

		assert.deepStrictEqual({
			definition: addDefinition?.description?.includes('sessions and chats created with session-management tools'),
			instruction: ARTIFACT_TOOLS_INSTRUCTION.includes('sessions and chats created with session-management tools'),
		}, {
			definition: true,
			instruction: true,
		});
	});

	test('distinguishes attempted pull request work from inspection or review', () => {
		const addDefinition = artifactServerToolDefinitions.find(definition => definition.name === ArtifactServerToolName.AddArtifactOrReference);
		const classificationInput: IJSONSchema | undefined = addDefinition?.inputSchema?.properties?.isArtifact;
		const descriptions = [
			addDefinition?.description,
			classificationInput?.description,
			ARTIFACT_TOOLS_INSTRUCTION,
		];

		assert.deepStrictEqual({
			inputType: classificationInput?.type,
			classifications: descriptions.map(description => ({
				artifact: description?.includes('you create or attempt to fix, change, or unblock is an artifact'),
				reference: description?.includes('inspection or review alone makes it a reference'),
			})),
		}, {
			inputType: 'boolean',
			classifications: [
				{ artifact: true, reference: true },
				{ artifact: true, reference: true },
				{ artifact: true, reference: true },
			],
		});
	});

	test('rejects session-management links during execution', async () => {
		const sessionUri = 'copilot:/caller';
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Caller',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		let persisted = false;
		const group = createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: () => persisted = true,
		});

		let errorMessage: string | undefined;
		try {
			await group.execute(stateManager, { sessionUri, chatUri: buildDefaultChatUri(sessionUri), turnId: 'turn-1' }, ArtifactServerToolName.AddArtifactOrReference, {
				type: 'resource',
				label: 'Spawned session',
				isArtifact: true,
				uri: 'agent-host-session://copilot/spawned',
			});
		} catch (error) {
			errorMessage = getErrorMessage(error);
		}

		assert.deepStrictEqual({ errorMessage, persisted }, {
			errorMessage: 'Invalid add_artifact_or_reference input: sessions and chats created with session-management tools must not be recorded as artifacts or references.',
			persisted: false,
		});
	});

	test('names what a completed removal actually removed', () => {
		const removed = (text: string) => display(ArtifactServerToolName.RemoveArtifactOrReference, { id: 'id-1' }, { text, success: true })?.pastTenseMessage;

		assert.deepStrictEqual({
			running: display(ArtifactServerToolName.RemoveArtifactOrReference, { id: 'id-1' }),
			artifact: removed('Removed artifact: id-1 (file, artifact) Plan — file:///repo/plan.md'),
			reference: removed('Removed reference: id-1 (website, reference) Docs — https://example.com'),
			missing: removed('No artifact or reference with id id-1.'),
		}, {
			running: { displayName: 'Remove Artifact or Reference', invocationMessage: 'Remove artifact or reference' },
			artifact: 'Removed artifact',
			reference: 'Removed reference',
			missing: undefined,
		});
	});

	test('keeps the display of a call restored under a pre-rename tool name', () => {
		const displayName = (toolName: string) => getServerToolDisplay(toolName, { label: 'Fix login', isArtifact: true })?.displayName;

		assert.deepStrictEqual({
			current: displayName(ArtifactServerToolName.AddArtifactOrReference),
			legacyAdd: displayName('add_artifact'),
			legacyRemove: getServerToolDisplay('remove_artifact', { id: 'id-1' })?.displayName,
			legacyList: getServerToolDisplay('list_artifacts', undefined)?.displayName,
			// Claude prefixes server tools on the wire; the suffix still resolves.
			transportPrefixed: displayName('mcp__vscode__add_artifact'),
			unknown: displayName('not_a_tool'),
		}, {
			current: 'Add Artifact',
			legacyAdd: 'Add Artifact',
			legacyRemove: 'Remove Artifact or Reference',
			legacyList: 'List Artifacts and References',
			transportPrefixed: 'Add Artifact',
			unknown: undefined,
		});
	});
});
