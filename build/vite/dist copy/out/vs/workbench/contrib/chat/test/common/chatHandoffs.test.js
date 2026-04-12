/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildCustomAgentHandoffsInfo, getHandoffId } from '../../common/chatModes.js';
import { ChatModeKind } from '../../common/constants.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
function createMockMode(overrides) {
    return {
        name: constObservable(overrides.id),
        label: constObservable(overrides.id),
        icon: constObservable(undefined),
        description: constObservable(undefined),
        isBuiltin: overrides.isBuiltin ?? false,
        target: constObservable(Target.Undefined),
        ...overrides,
    };
}
suite('getHandoffId', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should generate a stable id from agent and label', () => {
        const handoff = { agent: 'agent', label: 'Start Implementation', prompt: 'go' };
        assert.strictEqual(getHandoffId(handoff), 'agent:start-implementation');
    });
    test('should handle special characters in label', () => {
        const handoff = { agent: 'edit', label: 'Open in Editor!', prompt: '' };
        assert.strictEqual(getHandoffId(handoff), 'edit:open-in-editor');
    });
    test('should handle single-word label', () => {
        const handoff = { agent: 'agent', label: 'Continue', prompt: '' };
        assert.strictEqual(getHandoffId(handoff), 'agent:continue');
    });
});
suite('buildCustomAgentHandoffsInfo', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should return empty handoffs for modes without handOffs', () => {
        const mode = createMockMode({
            id: 'ask',
            kind: ChatModeKind.Ask,
            isBuiltin: true,
        });
        const result = buildCustomAgentHandoffsInfo([mode]);
        assert.deepStrictEqual(result, [{
                id: 'ask',
                name: 'ask',
                isBuiltin: true,
                visibility: { userInvocable: true, agentInvocable: true },
                handoffs: [],
            }]);
    });
    test('should map handoffs with all fields', () => {
        const handoffs = [
            { agent: 'agent', label: 'Start Implementation', prompt: 'Start implementation', send: true, model: 'gpt-4o' },
            { agent: 'agent', label: 'Open in Editor', prompt: 'Open the plan', showContinueOn: false },
        ];
        const mode = createMockMode({
            id: 'plan-mode',
            kind: ChatModeKind.Agent,
            handOffs: observableValue('handOffs', handoffs),
            visibility: observableValue('visibility', { userInvocable: true, agentInvocable: false }),
        });
        const result = buildCustomAgentHandoffsInfo([mode]);
        assert.deepStrictEqual(result, [{
                id: 'plan-mode',
                name: 'plan-mode',
                isBuiltin: false,
                visibility: { userInvocable: true, agentInvocable: false },
                handoffs: [
                    { id: 'agent:start-implementation', label: 'Start Implementation', agent: 'agent', prompt: 'Start implementation', send: true, model: 'gpt-4o' },
                    { id: 'agent:open-in-editor', label: 'Open in Editor', agent: 'agent', prompt: 'Open the plan', showContinueOn: false },
                ],
            }]);
    });
    test('should handle multiple modes', () => {
        const askMode = createMockMode({ id: 'ask', kind: ChatModeKind.Ask, isBuiltin: true });
        const agentMode = createMockMode({ id: 'agent', kind: ChatModeKind.Agent, isBuiltin: true });
        const result = buildCustomAgentHandoffsInfo([askMode, agentMode]);
        assert.deepStrictEqual(result, [
            {
                id: 'ask',
                name: 'ask',
                isBuiltin: true,
                visibility: { userInvocable: true, agentInvocable: true },
                handoffs: [],
            },
            {
                id: 'agent',
                name: 'agent',
                isBuiltin: true,
                visibility: { userInvocable: true, agentInvocable: true },
                handoffs: [],
            },
        ]);
    });
    test('should omit optional handoff fields when undefined', () => {
        const handoffs = [
            { agent: 'agent', label: 'Go', prompt: 'do it' },
        ];
        const mode = createMockMode({
            id: 'test',
            kind: ChatModeKind.Agent,
            handOffs: observableValue('handOffs', handoffs),
        });
        const result = buildCustomAgentHandoffsInfo([mode]);
        const info = result[0].handoffs[0];
        assert.strictEqual(info.id, 'agent:go');
        assert.strictEqual(info.send, undefined);
        assert.strictEqual(info.showContinueOn, undefined);
        assert.strictEqual(info.model, undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEhhbmRvZmZzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL2NoYXRIYW5kb2Zmcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxZQUFZLEVBQWEsTUFBTSwyQkFBMkIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFekQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRWxFLFNBQVMsY0FBYyxDQUFDLFNBQWtFO0lBQ3pGLE9BQU87UUFDTixJQUFJLEVBQUUsZUFBZSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDbkMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3BDLElBQUksRUFBRSxlQUFlLENBQUMsU0FBUyxDQUFDO1FBQ2hDLFdBQVcsRUFBRSxlQUFlLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLFNBQVMsRUFBRSxTQUFTLENBQUMsU0FBUyxJQUFJLEtBQUs7UUFDdkMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3pDLEdBQUcsU0FBUztLQUNDLENBQUM7QUFDaEIsQ0FBQztBQUVELEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzFCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtR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