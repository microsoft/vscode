/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { organizeImportsCommandId, refactorCommandId } from '../../browser/codeAction.js';
import { CodeActionKeybindingResolver } from '../../browser/codeActionKeybindingResolver.js';
import { CodeActionKind } from '../../common/types.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
suite('CodeActionKeybindingResolver', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const refactorKeybinding = createCodeActionKeybinding(31 /* KeyCode.KeyA */, refactorCommandId, { kind: CodeActionKind.Refactor.value });
    const refactorExtractKeybinding = createCodeActionKeybinding(32 /* KeyCode.KeyB */, refactorCommandId, { kind: CodeActionKind.Refactor.append('extract').value });
    const organizeImportsKeybinding = createCodeActionKeybinding(33 /* KeyCode.KeyC */, organizeImportsCommandId, undefined);
    test('Should match refactor keybindings', async function () {
        const resolver = new CodeActionKeybindingResolver(createMockKeyBindingService([refactorKeybinding])).getResolver();
        assert.strictEqual(resolver({ title: '' }), undefined);
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.Refactor.value }), refactorKeybinding.resolvedKeybinding);
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.Refactor.append('extract').value }), refactorKeybinding.resolvedKeybinding);
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.QuickFix.value }), undefined);
    });
    test('Should prefer most specific keybinding', async function () {
        const resolver = new CodeActionKeybindingResolver(createMockKeyBindingService([refactorKeybinding, refactorExtractKeybinding, organizeImportsKeybinding])).getResolver();
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.Refactor.value }), refactorKeybinding.resolvedKeybinding);
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.Refactor.append('extract').value }), refactorExtractKeybinding.resolvedKeybinding);
    });
    test('Organize imports should still return a keybinding even though it does not have args', async function () {
        const resolver = new CodeActionKeybindingResolver(createMockKeyBindingService([refactorKeybinding, refactorExtractKeybinding, organizeImportsKeybinding])).getResolver();
        assert.strictEqual(resolver({ title: '', kind: CodeActionKind.SourceOrganizeImports.value }), organizeImportsKeybinding.resolvedKeybinding);
    });
});
function createMockKeyBindingService(items) {
    return {
        getKeybindings: () => {
            return items;
        },
    };
}
function createCodeActionKeybinding(keycode, command, commandArgs) {
    return new ResolvedKeybindingItem(new USLayoutResolvedKeybinding([new KeyCodeChord(false, true, false, false, keycode)], 3 /* OperatingSystem.Linux */), command, commandArgs, undefined, false, null, false);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi90ZXN0L2Jyb3dzZXIvY29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFHekUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDMUYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXZELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBRXJILEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7SUFFMUMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLGtCQUFrQixHQUFHLDBCQUEwQix3QkFFcEQsaUJBQWlCLEVBQ2pCLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUUxQyxNQUFNLHlCQUF5QixHQUFHLDBCQUEwQix3QkFFM0QsaUJBQWlCLEVBQ2pCLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFNUQs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