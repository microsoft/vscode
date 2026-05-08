/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatExternalPathConfirmationContribution, IExternalPathInfo } from '../../../../common/tools/builtinTools/chatExternalPathConfirmation.js';
import { ILanguageModelToolConfirmationRef } from '../../../../common/tools/languageModelToolsConfirmationService.js';

suite('ChatExternalPathConfirmationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-chat-session:/session/1');
	const source = { type: 'internal' as const, label: 'test' };
	const mockLabelService = { getUriLabel: (uri: URI) => uri.fsPath } as ILabelService;

	function createRef(filePath: string, isDirectory = false): ILanguageModelToolConfirmationRef {
		return {
			toolId: 'copilot_readFile',
			source,
			parameters: isDirectory ? { path: filePath } : { filePath },
			chatSessionResource: sessionResource,
		};
	}

	function createContribution(findGitRoot?: (pathUri: URI) => Promise<URI | undefined>): ChatExternalPathConfirmationContribution {
		const getPathInfo = (ref: ILanguageModelToolConfirmationRef): IExternalPathInfo | undefined => {
			const params = ref.parameters as { filePath?: string; path?: string };
			if (params?.filePath) {
				return { path: params.filePath, isDirectory: false };
			}
			if (params?.path) {
				return { path: params.path, isDirectory: true };
			}
			return undefined;
		};

		const contribution = new ChatExternalPathConfirmationContribution(
			getPathInfo,
			mockLabelService,
			findGitRoot,
		);
		disposables.add(contribution);
		return contribution;
	}

	test('getPreConfirmAction returns undefined with no allowlist entries', () => {
		const contribution = createContribution();
		const ref = createRef('/external/repo/src/file.ts');
		const result = contribution.getPreConfirmAction(ref);
		assert.strictEqual(result, undefined);
	});

	test('allow folder in session works', async () => {
		const contribution = createContribution();
		const ref = createRef('/external/repo/src/file.ts');

		const actions = contribution.getPreConfirmActions(ref);
		assert.ok(actions.length >= 1);
		const folderAction = actions[0];
		assert.ok(folderAction.label.includes('folder'));

		const shouldConfirm = await folderAction.select();
		assert.strictEqual(shouldConfirm, true);

		// Same folder should now be auto-approved
		const result = contribution.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.UserAction });
	});

	test('allow repo in session - first time resolves git root', async () => {
		const gitRootUri = URI.file('/external/repo');
		const contribution = createContribution(async () => gitRootUri);

		const ref = createRef('/external/repo/src/file.ts');

		const actions = contribution.getPreConfirmActions(ref);
		// Should have "allow folder" and "allow repo" actions
		assert.strictEqual(actions.length, 2);
		const repoAction = actions[1];
		assert.ok(repoAction.label.includes('repository'));

		const shouldConfirm = await repoAction.select();
		assert.strictEqual(shouldConfirm, true);

		// File in the same repo should now be auto-approved
		const ref2 = createRef('/external/repo/src/other.ts');
		const result = contribution.getPreConfirmAction(ref2);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.UserAction });
	});

	test('allow repo in session - cached git root', async () => {
		const gitRootUri = URI.file('/external/repo');
		const contribution = createContribution(async () => gitRootUri);

		const ref = createRef('/external/repo/src/file.ts');

		// First call - resolves git root
		const actions1 = contribution.getPreConfirmActions(ref);
		const repoAction1 = actions1[1];
		await repoAction1.select();

		// Second call with same path - should use cached git root
		const actions2 = contribution.getPreConfirmActions(ref);
		assert.strictEqual(actions2.length, 2);
		const repoAction2 = actions2[1];
		assert.ok(repoAction2.detail!.includes(gitRootUri.fsPath));

		const shouldConfirm = await repoAction2.select();
		assert.strictEqual(shouldConfirm, true);
	});

	test('allow repo in session - git root not found falls back to folder', async () => {
		const contribution = createContribution(async () => undefined);

		const ref = createRef('/not-in-repo/file.ts');

		const actions = contribution.getPreConfirmActions(ref);
		assert.strictEqual(actions.length, 2);
		const repoAction = actions[1];

		// Should still confirm (falls back to allowing the folder)
		const shouldConfirm = await repoAction.select();
		assert.strictEqual(shouldConfirm, true);

		// The containing folder should be auto-approved
		const result = contribution.getPreConfirmAction(ref);
		assert.deepStrictEqual(result, { type: ToolConfirmKind.UserAction });
	});

	test('allow repo in session - hides option after git root not found', async () => {
		const contribution = createContribution(async () => undefined);

		const ref = createRef('/not-in-repo/file.ts');

		// First call - resolve returns undefined, caches null
		const actions1 = contribution.getPreConfirmActions(ref);
		assert.strictEqual(actions1.length, 2);
		await actions1[1].select();

		// Second call - should not show repo option (cached === null)
		const actions2 = contribution.getPreConfirmActions(ref);
		assert.strictEqual(actions2.length, 1);
	});

	test('allow repo in session - different files in same repo', async () => {
		const gitRootUri = URI.file('/external/repo');
		const contribution = createContribution(async () => gitRootUri);

		const ref1 = createRef('/external/repo/src/a.ts');
		const ref2 = createRef('/external/repo/lib/b.ts');
		const ref3 = createRef('/external/repo/deep/nested/c.ts');

		// Allow repo via first file
		const actions = contribution.getPreConfirmActions(ref1);
		await actions[1].select();

		// All files in the repo should be auto-approved
		assert.deepStrictEqual(contribution.getPreConfirmAction(ref1), { type: ToolConfirmKind.UserAction });
		assert.deepStrictEqual(contribution.getPreConfirmAction(ref2), { type: ToolConfirmKind.UserAction });
		assert.deepStrictEqual(contribution.getPreConfirmAction(ref3), { type: ToolConfirmKind.UserAction });

		// File outside the repo should NOT be auto-approved
		const refOutside = createRef('/other/place/file.ts');
		assert.strictEqual(contribution.getPreConfirmAction(refOutside), undefined);
	});

	test('session allowlist is per-session', async () => {
		const gitRootUri = URI.file('/external/repo');
		const contribution = createContribution(async () => gitRootUri);

		const ref = createRef('/external/repo/src/file.ts');
		const actions = contribution.getPreConfirmActions(ref);
		await actions[1].select();

		// Same file, different session
		const refOtherSession: ILanguageModelToolConfirmationRef = {
			toolId: 'copilot_readFile',
			source,
			parameters: { filePath: '/external/repo/src/file.ts' },
			chatSessionResource: URI.parse('vscode-chat-session:/session/2'),
		};
		assert.strictEqual(contribution.getPreConfirmAction(refOtherSession), undefined);
	});

	test('reset clears all allowlists', async () => {
		const gitRootUri = URI.file('/external/repo');
		const contribution = createContribution(async () => gitRootUri);

		const ref = createRef('/external/repo/src/file.ts');
		const actions = contribution.getPreConfirmActions(ref);
		await actions[1].select();

		assert.deepStrictEqual(contribution.getPreConfirmAction(ref), { type: ToolConfirmKind.UserAction });

		contribution.reset();

		assert.strictEqual(contribution.getPreConfirmAction(ref), undefined);
	});
});
