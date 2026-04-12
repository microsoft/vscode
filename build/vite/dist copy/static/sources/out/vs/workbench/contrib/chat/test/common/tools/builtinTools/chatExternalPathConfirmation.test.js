/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatExternalPathConfirmationContribution } from '../../../../common/tools/builtinTools/chatExternalPathConfirmation.js';
suite('ChatExternalPathConfirmationContribution', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const sessionResource = URI.parse('vscode-chat-session:/session/1');
    const source = { type: 'internal', label: 'test' };
    const mockLabelService = { getUriLabel: (uri) => uri.fsPath };
    function createRef(filePath, isDirectory = false) {
        return {
            toolId: 'copilot_readFile',
            source,
            parameters: isDirectory ? { path: filePath } : { filePath },
            chatSessionResource: sessionResource,
        };
    }
    function createContribution(findGitRoot) {
        const getPathInfo = (ref) => {
            const params = ref.parameters;
            if (params?.filePath) {
                return { path: params.filePath, isDirectory: false };
            }
            if (params?.path) {
                return { path: params.path, isDirectory: true };
            }
            return undefined;
        };
        const contribution = new ChatExternalPathConfirmationContribution(getPathInfo, mockLabelService, findGitRoot);
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
        assert.deepStrictEqual(result, { type: 4 /* ToolConfirmKind.UserAction */ });
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
        assert.deepStrictEqual(result, { type: 4 /* ToolConfirmKind.UserAction */ });
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
        assert.ok(repoAction2.detail.includes(gitRootUri.fsPath));
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
        assert.deepStrictEqual(result, { type: 4 /* ToolConfirmKind.UserAction */ });
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
        assert.deepStrictEqual(contribution.getPreConfirmAction(ref1), { type: 4 /* ToolConfirmKind.UserAction */ });
        assert.deepStrictEqual(contribution.getPreConfirmAction(ref2), { type: 4 /* ToolConfirmKind.UserAction */ });
        assert.deepStrictEqual(contribution.getPreConfirmAction(ref3), { type: 4 /* ToolConfirmKind.UserAction */ });
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
        const refOtherSession = {
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
        assert.deepStrictEqual(contribution.getPreConfirmAction(ref), { type: 4 /* ToolConfirmKind.UserAction */ });
        contribution.reset();
        assert.strictEqual(contribution.getPreConfirmAction(ref), undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvY2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHekcsT0FBTyxFQUFFLHdDQUF3QyxFQUFxQixNQUFNLHVFQUF1RSxDQUFDO0FBR3BKLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7SUFDdEQsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUU5RCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFDcEUsTUFBTSxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBbUIsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDNUQsTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLFdBQVcsRUFBRSxDQUFDLEdBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBbUIsQ0FBQztJQUVwRixTQUFTLFNBQVMsQ0FBQyxRQUFnQixFQUFFLFdBQVcsR0FBRyxLQUFLO1FBQ3ZELE9BQU87WUFDTixNQUFNLEVBQUUsa0JBQWtCO1lBQzFCLE1BQU07WUFDTixVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUU7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