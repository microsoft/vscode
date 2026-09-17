/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkflowMessagePresentation } from '../../../../../platform/workflow/common/workflowMessage.js';
import { buildWorkflowPrompt } from '../../../../../platform/workflow/common/workflowPrompt.js';
import { ChatWorkflowContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatWorkflowContentPart.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

const presentation: WorkflowMessagePresentation = {
	kind: 'workflow', workflowLabel: 'Feature with Experiment', checkpointLabel: 'Plan', reason: 'start',
};
const timestamp = new Date().setHours(9, 41, 0, 0);
function assignment(source = presentation): string {
	const repair = source.reason === 'repair';
	return buildWorkflowPrompt(
		repair
			? 'Resolve failing CI checks and review comments without opening the draft pull request.'
			: 'Inspect the existing editor and write a concise implementation plan, including accessibility and regression tests.',
		repair
			? { type: 'object', properties: { pullRequest: { type: 'string', format: 'uri' } }, required: ['pullRequest'] }
			: { type: 'object', properties: { plan: { type: 'string', format: 'uri' } }, required: ['plan'] },
		repair ? { pullRequest: 'https://github.com/microsoft/vscode/pull/42' } : {},
		repair ? 'Required check "Unit Tests" failed. Repair the regression and rerun the targeted tests.' : undefined,
	);
}

function renderWorkflow(ctx: ComponentFixtureContext, options: { readonly source?: WorkflowMessagePresentation; readonly expanded?: boolean; readonly width?: number } = {}): void {
	ctx.container.style.width = `${options.width ?? 600}px`;
	const instantiationService = createEditorServices(ctx.disposableStore, { colorTheme: ctx.theme });
	const source = options.source ?? presentation;
	const part = ctx.disposableStore.add(instantiationService.createInstance(ChatWorkflowContentPart, source, assignment(source), timestamp));
	ctx.container.appendChild(part.domNode);
	if (options.expanded) {
		part.domNode.querySelector<HTMLElement>('.chat-automated-request-header-disclosure')?.click();
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Plan: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderWorkflow(ctx),
	}),
	Repair: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderWorkflow(ctx, { source: { ...presentation, checkpointLabel: 'Draft PR Ready', reason: 'repair' } }),
	}),
	Expanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderWorkflow(ctx, { expanded: true }),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderWorkflow(ctx, {
			width: 320, expanded: true,
			source: { ...presentation, workflowLabel: 'Feature with Experiment and Team Release Follow-up', checkpointLabel: 'Plan the Keyboard Navigation and Accessibility Improvements' },
		}),
	}),
	InChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderChatWidget(ctx, {
			width: 720, height: 560, inputVisible: false, agentHostSession: true,
			messages: [
				{
					user: 'Improve keyboard navigation in the workflow editor.',
					assistant: [{ kind: 'markdown', text: 'I will work through the Plan checkpoint, then stop at your chosen stopping point.' }],
				},
				{
					user: assignment(), isSystemInitiated: true, requestSource: presentation, timestamp,
					assistant: [{ kind: 'markdown', text: 'I inspected the editor and wrote the implementation plan, including focus management and regression tests. The Plan checkpoint is complete.' }],
				},
			],
		}),
	}),
});
