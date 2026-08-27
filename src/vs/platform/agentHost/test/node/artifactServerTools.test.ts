/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { createArtifactServerToolGroup } from '../../node/shared/artifactServerTools.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Artifact Server Tools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
