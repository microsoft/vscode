/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { RunScriptCustomTaskWidget, WORKTREE_CREATED_RUN_ON } from '../../browser/runScriptCustomTaskWidget.js';
// Ensure color registrations are loaded
import '../../../../common/theme.js';
import '../../../../../platform/theme/common/colors/inputColors.js';
const filledLabel = 'Start Dev Server';
const filledCommand = 'npm run dev';
const workspaceUnavailableReason = 'Workspace storage is unavailable for this session';
function renderWidget(ctx, state) {
    ctx.container.style.width = '600px';
    ctx.container.style.padding = '0';
    ctx.container.style.borderRadius = 'var(--vscode-cornerRadius-xLarge)';
    ctx.container.style.backgroundColor = 'var(--vscode-quickInput-background)';
    ctx.container.style.overflow = 'hidden';
    const widget = ctx.disposableStore.add(new RunScriptCustomTaskWidget(state));
    ctx.container.appendChild(widget.domNode);
}
function defineFixture(state) {
    return defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderWidget(ctx, state),
    });
}
export default defineThemedFixtureGroup({ path: 'sessions/' }, {
    WorkspaceSelectedEmpty: defineFixture({
        target: 'workspace',
    }),
    WorkspaceSelectedCheckedEmpty: defineFixture({
        target: 'workspace',
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    WorkspaceSelectedFilled: defineFixture({
        label: filledLabel,
        target: 'workspace',
        command: filledCommand,
    }),
    WorkspaceSelectedCheckedFilled: defineFixture({
        label: filledLabel,
        target: 'workspace',
        command: filledCommand,
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    UserSelectedEmpty: defineFixture({
        target: 'user',
    }),
    UserSelectedCheckedEmpty: defineFixture({
        target: 'user',
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    UserSelectedFilled: defineFixture({
        label: filledLabel,
        target: 'user',
        command: filledCommand,
    }),
    UserSelectedCheckedFilled: defineFixture({
        label: filledLabel,
        target: 'user',
        command: filledCommand,
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    WorkspaceUnavailableEmpty: defineFixture({
        target: 'user',
        targetDisabledReason: workspaceUnavailableReason,
    }),
    WorkspaceUnavailableCheckedEmpty: defineFixture({
        target: 'user',
        targetDisabledReason: workspaceUnavailableReason,
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    WorkspaceUnavailableFilled: defineFixture({
        label: filledLabel,
        target: 'user',
        command: filledCommand,
        targetDisabledReason: workspaceUnavailableReason,
    }),
    WorkspaceUnavailableCheckedFilled: defineFixture({
        label: filledLabel,
        target: 'user',
        command: filledCommand,
        targetDisabledReason: workspaceUnavailableReason,
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
    ExistingWorkspaceTaskLocked: defineFixture({
        label: filledLabel,
        labelDisabledReason: 'This name comes from an existing task and cannot be changed here.',
        command: filledCommand,
        commandDisabledReason: 'This command comes from an existing task and cannot be changed here.',
        target: 'workspace',
        targetDisabledReason: 'This existing task cannot be moved between workspace and user storage.',
    }),
    ExistingUserTaskLockedChecked: defineFixture({
        label: filledLabel,
        labelDisabledReason: 'This name comes from an existing task and cannot be changed here.',
        command: filledCommand,
        commandDisabledReason: 'This command comes from an existing task and cannot be changed here.',
        target: 'user',
        targetDisabledReason: 'This existing task cannot be moved between workspace and user storage.',
        runOn: WORKTREE_CREATED_RUN_ON,
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU2NyaXB0Q3VzdG9tVGFza1dpZGdldC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9ydW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUEyQixzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ3BLLE9BQU8sRUFBbUMseUJBQXlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVqSix3Q0FBd0M7QUFDeEMsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLDREQUE0RCxDQUFDO0FBRXBFLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDO0FBQ3ZDLE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQztBQUNwQyxNQUFNLDBCQUEwQixHQUFHLG1EQUFtRCxDQUFDO0FBRXZGLFNBQVMsWUFBWSxDQUFDLEdBQTRCLEVBQUUsS0FBc0M7SUFDekYsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztJQUNwQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDO0lBQ2xDLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxtQ0FBbUMsQ0FBQztJQUN2RSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcscUNBQXFDLENBQUM7SUFDNUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztJQUV4QyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLHlCQUF5QixD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