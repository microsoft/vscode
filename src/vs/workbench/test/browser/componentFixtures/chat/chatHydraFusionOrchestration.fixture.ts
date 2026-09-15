/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './chatHydraFusionOrchestration.fixture.css';

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HoverWidget } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatAgentLocation, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../contrib/chat/common/languageModels.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureAssistantPart, IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

type HydraFusionPrototypeId = 'solo' | 'cascade' | 'critique';
type ThinkingDetail = 'activityOnly' | 'reasoningAndDrafts';
type ModelDisplay = 'hidden' | 'inline' | 'hover';

interface IHydraFusionThinkingRow {
	readonly label: string;
	readonly summary: string;
	readonly draft?: string;
	readonly draftLabel?: string;
}

interface IHydraFusionTool {
	readonly kind: 'tool' | 'subagent';
	readonly id: string;
	readonly displayName?: string;
	readonly invocationMessage?: string;
	readonly pastTenseMessage?: string;
	readonly input?: string;
	readonly inputLanguage?: string;
	readonly output?: string;
	readonly description?: string;
	readonly agentName?: string;
	readonly completed?: boolean;
	readonly durationMs?: number;
	readonly credits?: number;
}

interface IHydraFusionStage {
	readonly id: string;
	readonly label: string;
	readonly title: string;
	readonly completedTitle: string;
	readonly presentation?: 'model' | 'orchestration';
	readonly model?: string;
	readonly description: string;
	readonly outcome: string;
	readonly rows: readonly IHydraFusionThinkingRow[];
	readonly tools?: readonly IHydraFusionTool[];
	readonly toolDetails?: 'full' | 'summary';
	readonly continuation?: {
		readonly title: string;
		readonly completedTitle: string;
		readonly summary: string;
	};
	readonly phaseEnd?: boolean;
	readonly complete?: boolean;
	readonly finalResponse?: string;
}

interface IHydraFusionPrototype {
	readonly id: HydraFusionPrototypeId;
	readonly title: string;
	readonly description: string;
	readonly completedTitle: string;
	readonly prompt: string;
	readonly stages: readonly IHydraFusionStage[];
	readonly defaultStage: number;
	readonly usageAics: string;
	readonly models: readonly string[];
}

interface IHydraFusionDemoState {
	prototypeId: HydraFusionPrototypeId;
	stage: number;
	playAll: boolean;
	detail: ThinkingDetail;
	modelDisplay: ModelDisplay;
	startCollapsed: boolean;
}

interface IButtonOption<T> {
	readonly value: T;
	readonly label: string;
	readonly description: string;
}

const prompt = 'Add a command to toggle inline chat history, assign a keyboard shortcut, and cover the command registration with tests.';

const hydraFusionModel: ILanguageModelChatMetadataAndIdentifier = {
	identifier: 'copilot/hydrafusion',
	metadata: {
		extension: new ExtensionIdentifier('github.copilot-chat'),
		id: 'hydrafusion',
		name: 'HydraFusion Research Preview',
		vendor: 'copilot',
		family: 'hydrafusion',
		version: '1',
		detail: 'Routes one turn through Single, Cascade, or Critique and returns one selected response.',
		statusIcon: Codicon.copilot,
		pricing: 'Variable',
		maxInputTokens: 0,
		maxOutputTokens: 0,
		isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		isUserSelectable: true,
		capabilities: { toolCalling: true, agentMode: true },
	},
};

const soloPrototype: IHydraFusionPrototype = {
	id: 'solo',
	title: 'Single workflow',
	description: 'HydraFusion\'s Single workflow uses one solver to complete this focused change with normal tools and permissions.',
	completedTitle: 'Reviewed 6 files',
	prompt,
	defaultStage: 1,
	usageAics: '1.3 AICs',
	models: ['GPT-5.6 Sol'],
	stages: [
		{
			id: 'choosing',
			label: 'Routing',
			title: 'Choosing a workflow',
			completedTitle: 'Selected Single workflow',
			presentation: 'orchestration',
			description: 'HydraFusion is loading and validating the workflow plan for this turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'The plan uses Single: one model carries out the task with normal tools and permissions, then HydraFusion returns that result.',
				},
			],
		},
		{
			id: 'implementing',
			label: 'Implementing',
			title: 'Adding the inline chat command and its tests',
			completedTitle: 'Reviewed 6 files',
			model: 'GPT-5.6 Sol',
			description: 'One solver is implementing the command through the ordinary agent loop.',
			outcome: 'The command, keyboard shortcut, and targeted registration test are now implemented.',
			rows: [
				{
					label: 'Plan',
					summary: 'Use one solver to implement and verify the focused change without adding an independent review phase.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m tracing the existing inline chat commands and keybinding contributions first so the new command follows the established registration and context-key patterns.',
					draft: 'The working change registers a toggle command beside the existing inline chat actions, contributes a guarded keybinding, and adds a targeted registration test.',
					draftLabel: 'Working summary (may change)',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'solo-read-actions',
					displayName: 'Read',
					invocationMessage: 'Reading inline chat action registrations',
					pastTenseMessage: 'Read inline chat action registrations',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-read-commands',
					displayName: 'Read',
					invocationMessage: 'Reading neighboring command contributions',
					pastTenseMessage: 'Read neighboring command contributions',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-read-keybindings',
					displayName: 'Read',
					invocationMessage: 'Reading inline chat keybinding rules',
					pastTenseMessage: 'Read inline chat keybinding rules',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-read-context',
					displayName: 'Read',
					invocationMessage: 'Reading inline chat context keys',
					pastTenseMessage: 'Read inline chat context keys',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-read-tests',
					displayName: 'Read',
					invocationMessage: 'Reading command registration tests',
					pastTenseMessage: 'Read command registration tests',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-read-transcript',
					displayName: 'Read',
					invocationMessage: 'Reading transcript command terminology',
					pastTenseMessage: 'Read transcript command terminology',
					completed: true,
				},
				{
					kind: 'tool',
					id: 'solo-edit',
					displayName: 'Edit',
					invocationMessage: 'Editing the inline chat command registration',
					pastTenseMessage: 'Edited the inline chat command registration',
					input: JSON.stringify({
						file: 'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
						change: 'Register the transcript toggle command and guarded keybinding',
					}, null, 2),
					inputLanguage: 'json',
					output: 'Updated the inline chat action registration.',
				},
			],
		},
		{
			id: 'verifying',
			label: 'Verifying',
			title: 'Checking the command and test coverage',
			completedTitle: 'Completed the Single solver pass',
			model: 'GPT-5.6 Sol',
			phaseEnd: true,
			description: 'The implementation is complete and the same solver is checking the focused acceptance criteria.',
			outcome: 'The targeted registration checks passed, so the implementation is ready to return.',
			rows: [
				{
					label: 'Plan',
					summary: 'Use one solver to implement and verify the focused change.',
				},
				{
					label: 'Added the command and shortcut',
					summary: 'The command uses the existing inline chat registration path and only appears when the relevant chat context is available.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m checking command discovery, keybinding conditions, and the registration test together because those are the observable parts of the request.',
					draft: 'The targeted test now verifies the command identifier, title, keybinding, and context condition before the final response is prepared.',
					draftLabel: 'Verification summary',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'solo-test',
					displayName: 'Test',
					invocationMessage: 'Running targeted command registration tests',
					pastTenseMessage: 'Ran targeted command registration tests',
				},
			],
		},
		{
			id: 'finalizing',
			label: 'Publishing',
			title: 'Publishing the selected response',
			completedTitle: 'Published the selected response',
			presentation: 'orchestration',
			description: 'HydraFusion is replaying the selected staged result into the ordinary chat turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'HydraFusion selected the Single response for this chat. Publishing does not apply or undo file changes and other tool actions that already happened.',
				},
			],
		},
		{
			id: 'complete',
			label: 'Complete',
			title: 'Added and verified the inline chat command',
			completedTitle: 'Reviewed 6 files',
			presentation: 'orchestration',
			description: 'HydraFusion finished the Single workflow and is returning one final answer.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Workflow',
					summary: 'Single used one root solver and selected that result.',
				},
				{
					label: 'Added the command and shortcut',
					summary: 'Registered the toggle action through the existing inline chat contribution path.',
				},
				{
					label: 'Verified the registration',
					summary: 'Covered the command identifier, keybinding, and context condition with a targeted test.',
				},
			],
			complete: true,
			finalResponse: [
				'Implemented the inline chat history command and verified its registration.',
				'',
				'- Added the command beside the existing inline chat actions.',
				'- Contributed a guarded keyboard shortcut.',
				'- Added targeted coverage for the command and keybinding registration.',
			].join('\n'),
		},
	],
};

const cascadePrototype: IHydraFusionPrototype = {
	id: 'cascade',
	title: 'Cascade workflow',
	description: 'HydraFusion starts with an efficient model, checks the result independently, and uses a stronger model only when a repair is needed.',
	completedTitle: 'Completed 9 steps in 1m 08s',
	prompt,
	defaultStage: 3,
	usageAics: '4.1 AICs',
	models: ['GPT-5.6 Luna', 'GPT-5.6 Sol'],
	stages: [
		{
			id: 'choosing',
			label: 'Routing',
			title: 'Choosing a workflow',
			completedTitle: 'Selected Cascade workflow',
			presentation: 'orchestration',
			description: 'HydraFusion is loading and validating the workflow plan for this turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'The plan uses Cascade: an efficient model completes the task, a separate model checks it without tools, and a stronger model repairs it only if the check fails.',
				},
			],
		},
		{
			id: 'drafting',
			label: 'Implementing',
			title: 'Implementing the inline chat command and tests',
			completedTitle: 'Drafted the command and tests',
			model: 'GPT-5.6 Luna',
			description: 'An efficient primary solver is producing a working implementation with normal tools and permissions.',
			outcome: 'The initial command, keyboard shortcut, and registration test are ready for an independent quality check.',
			toolDetails: 'summary',
			rows: [
				{
					label: 'Plan',
					summary: 'Give an efficient solver the first attempt, check the draft independently, and escalate to the stronger solver only if the quality gate rejects it.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m following the existing inline chat command and keybinding patterns, then adding focused coverage for the new registration.',
					draft: 'The first pass added the toggle action, guarded shortcut, and focused registration coverage. Unselected draft text and raw tool details stay hidden so they are not mistaken for the final answer.',
					draftLabel: 'Working summary (not selected)',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'cascade-search',
					displayName: 'Search',
					invocationMessage: 'Searching inline chat command and keybinding registrations',
					pastTenseMessage: 'Searched inline chat command and keybinding registrations',
					input: JSON.stringify({
						query: 'inline chat command registrations and keybinding context',
						path: 'src/vs/workbench/contrib/inlineChat',
					}, null, 2),
					inputLanguage: 'json',
					output: [
						'inlineChatActions.ts',
						'inlineChatController.ts',
						'inlineChatSession.ts',
						'inlineChatContextKeys.ts',
						'inlineChatActions.test.ts',
						'inlineChatWidget.ts',
					].join('\n'),
					completed: true,
				},
				{
					kind: 'tool',
					id: 'cascade-edit',
					displayName: 'Edit',
					invocationMessage: 'Editing the command contribution and test',
					pastTenseMessage: 'Edited the command contribution and test',
					input: JSON.stringify({
						files: [
							'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
							'src/vs/workbench/contrib/inlineChat/test/browser/inlineChatActions.test.ts',
						],
						change: 'Add the transcript toggle command, keybinding, and registration coverage',
					}, null, 2),
					inputLanguage: 'json',
					output: 'Updated the command contribution and its focused registration test.',
				},
			],
		},
		{
			id: 'delegating',
			label: 'Subagent check',
			title: 'Checking registration details with a subagent',
			completedTitle: 'Prepared a focused subagent check',
			model: 'GPT-5.6 Luna',
			phaseEnd: true,
			description: 'The first solver is using ordinary VS Code subagent delegation for a bounded read-only check. This is not HydraFusion escalation.',
			outcome: 'The main pass implemented the command, and the subagent confirmed the surrounding command, context-key, and keybinding conventions.',
			continuation: {
				title: 'Finishing the main pass after the subagent check',
				completedTitle: 'Completed the main pass',
				summary: 'The subagent confirmed the neighboring registration conventions, so the root solver can finish its implementation summary before the quality gate begins.',
			},
			rows: [
				{
					label: 'Plan',
					summary: 'Start with the efficient solver, then use the quality gate to decide whether the stronger solver needs to rerun the task.',
				},
				{
					label: 'Implemented the command and shortcut',
					summary: 'The root solver created the initial command contribution, keybinding, and registration test.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m asking a subagent to review neighboring command registrations so I can confirm the context-key and keybinding conventions without interrupting the main implementation.',
				},
			],
			tools: [
				{
					kind: 'subagent',
					id: 'cascade-subagent',
					description: 'Review neighboring inline chat command registrations',
					durationMs: 18000,
					credits: 0.1,
				},
			],
		},
		{
			id: 'checking',
			label: 'Checking',
			title: 'Checking the implementation against the request',
			completedTitle: 'Review found a missing test',
			model: 'GPT-5.6 Sol',
			phaseEnd: true,
			description: 'A separate review model is checking the result without tools and cannot change files.',
			outcome: 'The review found that the test did not cover the shortcut’s inline-chat context.',
			rows: [
				{
					label: 'Plan',
					summary: 'Evaluate the efficient draft before deciding whether to accept it or rerun the task with the stronger solver.',
				},
				{
					label: 'Implemented the command and shortcut',
					summary: 'The primary solver produced a working command contribution, keybinding, and registration test.',
				},
				{
					label: 'Step explanation',
					summary: 'The review is comparing the requested behavior with the visible result, file changes, and test evidence without modifying the workspace.',
					draft: 'The review summary reports that the command is registered, but the test does not verify that the shortcut is disabled when inline chat is unavailable. The model’s raw rationale remains hidden.',
					draftLabel: 'Quality-gate assessment',
				},
			],
		},
		{
			id: 'repairing',
			label: 'Repairing',
			title: 'Repairing the missing test coverage',
			completedTitle: 'Repaired and verified the missing test',
			model: 'GPT-5.6 Sol',
			phaseEnd: true,
			description: 'The stronger model is rerunning the task with normal tools after the review rejected the first result.',
			outcome: 'The repair added the missing context assertion and reran the focused registration test.',
			rows: [
				{
					label: 'Plan',
					summary: 'Give the efficient solver the first attempt and escalate to the stronger solver only after a quality-gate rejection.',
				},
				{
					label: 'Implemented the command and shortcut',
					summary: 'The initial implementation registered the command, shortcut, and focused test.',
				},
				{
					label: 'Found a missing behavior check',
					summary: 'The quality gate found that the test did not verify the shortcut’s inline-chat context condition.',
				},
				{
					label: 'Step explanation',
					summary: 'The stronger solver is inspecting the existing workspace state, preserving correct work, and closing the context-coverage gap identified by the review.',
					draft: 'The stronger repair pass keeps the command implementation and adds the missing shortcut context assertion before rerunning the focused test.',
					draftLabel: 'Repair summary (may change)',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'cascade-repair-test',
					displayName: 'Test',
					invocationMessage: 'Updating and rerunning the registration test',
					pastTenseMessage: 'Updated and reran the registration test',
				},
			],
		},
		{
			id: 'finalizing',
			label: 'Publishing',
			title: 'Publishing the selected repair response',
			completedTitle: 'Published the selected repair response',
			presentation: 'orchestration',
			description: 'HydraFusion is replaying the selected repair result into the ordinary chat turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'HydraFusion selected the repair response for this chat. Earlier tool actions are not undone when another response is selected.',
				},
			],
		},
		{
			id: 'complete',
			label: 'Complete',
			title: 'Verified and strengthened the inline chat command',
			completedTitle: 'Completed 9 steps in 1m 08s',
			presentation: 'orchestration',
			description: 'HydraFusion selected the repaired implementation and is returning one final answer.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Workflow',
					summary: 'Used an implementation, quality-check, and repair workflow.',
				},
				{
					label: 'Implemented the command and shortcut',
					summary: 'Created the initial command contribution, keybinding, and registration test.',
				},
				{
					label: 'Checked the result against the request',
					summary: 'The quality gate identified missing coverage for the shortcut context.',
				},
				{
					label: 'Repaired and verified the gap',
					summary: 'Strengthened the targeted test and selected the repaired implementation as authoritative.',
				},
			],
			complete: true,
			finalResponse: [
				'Implemented the inline chat history command and strengthened its registration coverage after an independent quality check.',
				'',
				'- Added the command and guarded keyboard shortcut.',
				'- Added focused command-registration coverage.',
				'- Expanded the test to verify the shortcut’s inline-chat context condition.',
			].join('\n'),
		},
	],
};

const critiquePrototype: IHydraFusionPrototype = {
	id: 'critique',
	title: 'Critique workflow',
	description: 'HydraFusion completes a draft, asks a separate model to review it without tools, and gives the first model one focused revision when needed.',
	completedTitle: 'Completed 8 steps in 56s',
	prompt,
	defaultStage: 2,
	usageAics: '3.4 AICs',
	models: ['GPT-5.6 Luna', 'GPT-5.6 Terra'],
	stages: [
		{
			id: 'choosing',
			label: 'Routing',
			title: 'Choosing a workflow',
			completedTitle: 'Selected Critique workflow',
			presentation: 'orchestration',
			description: 'HydraFusion is loading and validating the workflow plan for this turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'The plan uses Critique: one model completes the task, a separate model reviews it without tools, and the first model makes one focused revision if needed.',
				},
			],
		},
		{
			id: 'drafting',
			label: 'Drafting',
			title: 'Drafting the inline chat command and tests',
			completedTitle: 'Completed the main pass',
			model: 'GPT-5.6 Luna',
			phaseEnd: true,
			description: 'The primary solver is producing a complete working draft with normal tools and permissions.',
			outcome: 'Implemented the inline chat command, keyboard shortcut, and targeted registration test.',
			toolDetails: 'summary',
			rows: [
				{
					label: 'Plan',
					summary: 'Draft the implementation, get an independent read-only review, and revise once if the review identifies a grounded defect.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m using the nearest command contribution as the implementation template and keeping the test focused on externally visible registration behavior.',
					draft: 'The first pass added the command, shortcut, and registration test while reusing the existing inline chat context key. Unselected draft text and raw tool details stay hidden so they are not mistaken for the final answer.',
					draftLabel: 'Working summary (not selected)',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'critique-search',
					displayName: 'Search',
					invocationMessage: 'Searching neighboring inline chat actions',
					pastTenseMessage: 'Searched neighboring inline chat actions',
					input: JSON.stringify({
						query: 'neighboring inline chat command titles and context keys',
						path: 'src/vs/workbench/contrib/inlineChat',
					}, null, 2),
					inputLanguage: 'json',
					output: [
						'inlineChatActions.ts',
						'inlineChatContextKeys.ts',
						'inlineChatController.ts',
						'inlineChatActions.test.ts',
					].join('\n'),
					completed: true,
				},
				{
					kind: 'tool',
					id: 'critique-edit',
					displayName: 'Edit',
					invocationMessage: 'Editing the command contribution and test',
					pastTenseMessage: 'Edited the command contribution and test',
					input: JSON.stringify({
						files: [
							'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
							'src/vs/workbench/contrib/inlineChat/test/browser/inlineChatActions.test.ts',
						],
						change: 'Add the transcript toggle command and focused test',
					}, null, 2),
					inputLanguage: 'json',
					output: 'Created the working command contribution and registration test.',
				},
			],
		},
		{
			id: 'reviewing',
			label: 'Reviewing',
			title: 'Reviewing the implementation with a separate model',
			completedTitle: 'Review found inconsistent terminology',
			model: 'GPT-5.6 Terra',
			phaseEnd: true,
			description: 'A separate model is reviewing the result without tools and cannot change files.',
			outcome: 'The independent review found terminology that did not match the surrounding inline chat actions.',
			rows: [
				{
					label: 'Plan',
					summary: 'Draft first, then use an independent read-only review before committing the result.',
				},
				{
					label: 'Drafted the command and tests',
					summary: 'The primary solver produced a complete implementation and targeted registration coverage.',
				},
				{
					label: 'Step explanation',
					summary: 'The review is checking whether the command placement, title, context condition, and test assertions align with the surrounding inline chat actions.',
					draft: 'The review summary reports that the new title describes “history” while neighboring actions consistently describe the visible transcript. The model’s raw review and internal handoff remain hidden.',
					draftLabel: 'Critique summary',
				},
			],
		},
		{
			id: 'revising',
			label: 'Revising',
			title: 'Revising the command with the independent review',
			completedTitle: 'Completed the revision pass',
			model: 'GPT-5.6 Luna',
			phaseEnd: true,
			description: 'The original solver is applying one focused revision based on a grounded critique.',
			outcome: 'The revision aligned the command title and test expectation with the established transcript terminology.',
			rows: [
				{
					label: 'Plan',
					summary: 'Draft, independently review, and revise once when the review identifies a concrete integration defect.',
				},
				{
					label: 'Drafted the command and tests',
					summary: 'The implementation added the command, shortcut, and focused test.',
				},
				{
					label: 'Reviewed the integration',
					summary: 'The critic found inconsistent terminology relative to neighboring inline chat commands.',
				},
				{
					label: 'Step explanation',
					summary: 'I’m making the smallest revision that aligns the command title and test expectation with the established transcript terminology.',
					draft: 'The revised command uses the existing transcript language consistently, and the test now asserts that final title.',
					draftLabel: 'Revision summary (may change)',
				},
			],
			tools: [
				{
					kind: 'tool',
					id: 'critique-revision',
					displayName: 'Edit',
					invocationMessage: 'Revising the command title and test expectation',
					pastTenseMessage: 'Revised the command title and test expectation',
					input: JSON.stringify({
						files: [
							'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
							'src/vs/workbench/contrib/inlineChat/test/browser/inlineChatActions.test.ts',
						],
						change: 'Align the command title and assertion with transcript terminology',
					}, null, 2),
					inputLanguage: 'json',
					output: 'Revised the command title and matching test expectation.',
				},
			],
		},
		{
			id: 'finalizing',
			label: 'Publishing',
			title: 'Publishing the selected revision response',
			completedTitle: 'Published the selected revision response',
			presentation: 'orchestration',
			description: 'HydraFusion is replaying the selected revision result into the ordinary chat turn.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Step explanation',
					summary: 'HydraFusion selected the revised response for this chat. The review is not published as an answer, and earlier tool actions are not undone.',
				},
			],
		},
		{
			id: 'complete',
			label: 'Complete',
			title: 'Reviewed and refined the inline chat command',
			completedTitle: 'Completed 8 steps in 56s',
			presentation: 'orchestration',
			description: 'HydraFusion selected the revised implementation and is returning one final answer.',
			outcome: '',
			phaseEnd: true,
			rows: [
				{
					label: 'Workflow',
					summary: 'Used a draft, independent review, and focused revision workflow.',
				},
				{
					label: 'Drafted the command and tests',
					summary: 'Created a complete working implementation with targeted coverage.',
				},
				{
					label: 'Reviewed the integration',
					summary: 'The critic identified inconsistent command terminology.',
				},
				{
					label: 'Revised and verified the result',
					summary: 'Aligned the title and test with existing inline chat language before committing the final response.',
				},
			],
			complete: true,
			finalResponse: [
				'Implemented the inline chat transcript command and refined its product language after an independent review.',
				'',
				'- Added the command and guarded keyboard shortcut.',
				'- Reused the established inline chat context behavior.',
				'- Aligned the command title and registration test with neighboring transcript actions.',
			].join('\n'),
		},
	],
};

const prototypes: Record<HydraFusionPrototypeId, IHydraFusionPrototype> = {
	solo: soloPrototype,
	cascade: cascadePrototype,
	critique: critiquePrototype,
};

const workflowOptions: readonly IButtonOption<HydraFusionPrototypeId>[] = [
	{
		value: 'solo',
		label: 'Single',
		description: soloPrototype.description,
	},
	{
		value: 'cascade',
		label: 'Cascade',
		description: cascadePrototype.description,
	},
	{
		value: 'critique',
		label: 'Critique',
		description: critiquePrototype.description,
	},
];

const detailOptions: readonly IButtonOption<ThinkingDetail>[] = [
	{
		value: 'reasoningAndDrafts',
		label: 'Show explanations and previews',
		description: 'Show safe step explanations and labeled working or review summaries without exposing private chain-of-thought or raw hidden output.',
	},
	{
		value: 'activityOnly',
		label: 'Show activity only',
		description: 'Show phase titles, native working states, summarized tools, and delegation without expanded explanations or previews.',
	},
];

const modelOptions: readonly IButtonOption<ModelDisplay>[] = [
	{
		value: 'hidden',
		label: 'Hide models',
		description: 'Keep constituent model names out of phase summaries.',
	},
	{
		value: 'inline',
		label: 'Show models',
		description: 'Show simulated constituent models from the current reference policy. Actual server-authored routes can vary.',
	},
	{
		value: 'hover',
		label: 'Show on hover',
		description: 'Keep model names out of phase summaries and list the distinct models when the usage count is hovered or focused.',
	},
];

const initialStateOptions: readonly IButtonOption<boolean>[] = [
	{
		value: false,
		label: 'Start expanded',
		description: 'Open each live phase automatically while preserving manual collapse.',
	},
	{
		value: true,
		label: 'Start collapsed',
		description: 'Keep each live phase collapsed until the user chooses to expand it.',
	},
];

function createControlButton(
	store: DisposableStore,
	parent: HTMLElement,
	label: string,
	run: () => void,
): Button {
	const button = store.add(new Button(parent, { ...defaultButtonStyles, secondary: true }));
	button.label = label;
	button.element.classList.add('hydrafusion-demo-button');
	store.add(button.onDidClick(run));
	return button;
}

function getActiveStageTitle(stage: IHydraFusionStage, showModels: boolean): string {
	if (!showModels || !stage.model) {
		return stage.title;
	}
	return stage.tools?.some(tool => tool.kind === 'subagent')
		? `${stage.title} (main solver: ${stage.model})`
		: `${stage.title} using ${stage.model}`;
}

function getCompletedStageTitle(stage: IHydraFusionStage, showModels: boolean): string {
	return showModels && stage.model
		? `${stage.completedTitle} with ${stage.model}`
		: stage.completedTitle;
}

function createThinkingText(stage: IHydraFusionStage, detail: ThinkingDetail, showModels: boolean): string {
	const explanation = stage.rows.find(row => row.label === 'Step explanation');
	const lines = [`**${getActiveStageTitle(stage, showModels)}**`];
	if (detail === 'reasoningAndDrafts') {
		lines.push('', explanation?.summary ?? stage.description);
	}
	return lines.join('\n');
}

function createDraftText(stage: IHydraFusionStage): string | undefined {
	const explanation = stage.rows.find(row => row.label === 'Step explanation');
	return explanation?.draft
		? [explanation.draftLabel ?? 'Working summary (may change)', '', explanation.draft].join('\n')
		: undefined;
}

function getModelCountLabel(prototype: IHydraFusionPrototype): string {
	return `${prototype.models.length} ${prototype.models.length === 1 ? 'model' : 'models'} used`;
}

function getUsageDetails(prototype: IHydraFusionPrototype): string {
	return `HydraFusion Research Preview • Example usage: ${prototype.usageAics} • ${getModelCountLabel(prototype)}`;
}

function setupModelUsageDetails(
	renderHost: HTMLElement,
	renderStore: DisposableStore,
	prototype: IHydraFusionPrototype,
	modelDisplay: ModelDisplay,
): void {
	const targetStore = renderStore.add(new MutableDisposable<DisposableStore>());
	const apply = () => {
		const details = renderHost.querySelector<HTMLElement>('.interactive-response .chat-response-model-details');
		if (!details || details.dataset.hydrafusionModelDisplay === modelDisplay) {
			return;
		}

		const store = new DisposableStore();
		targetStore.value = store;
		details.dataset.hydrafusionModelDisplay = modelDisplay;
		const countLabel = getModelCountLabel(prototype);
		const count = dom.$('span.hydrafusion-model-count', undefined, countLabel);
		details.replaceChildren(
			document.createTextNode(`HydraFusion Research Preview • Example usage: ${prototype.usageAics} • `),
			count,
		);

		if (modelDisplay !== 'hover') {
			return;
		}

		count.classList.add('hydrafusion-model-count-hover-target');
		count.tabIndex = 0;
		count.ariaLabel = `${countLabel}. ${prototype.models.join(', ')}`;
		const hover = store.add(new HoverWidget(true));
		hover.containerDomNode.classList.add('workbench-hover', 'hydrafusion-model-usage-hover');
		dom.append(hover.contentsDomNode, dom.$('.hydrafusion-model-usage-hover-title', undefined, 'Models used'));
		const list = dom.append(hover.contentsDomNode, dom.$('ul.hydrafusion-model-usage-hover-list'));
		for (const model of prototype.models) {
			dom.append(list, dom.$('li', undefined, model));
		}
		hover.onContentsChanged();

		let hideHandle: number | undefined;
		const cancelHide = () => {
			if (hideHandle !== undefined) {
				dom.getWindow(renderHost).clearTimeout(hideHandle);
				hideHandle = undefined;
			}
		};
		const hide = () => {
			cancelHide();
			hover.containerDomNode.remove();
		};
		const scheduleHide = () => {
			cancelHide();
			hideHandle = dom.getWindow(renderHost).setTimeout(hide, 100);
		};
		const show = () => {
			cancelHide();
			if (!count.isConnected) {
				return;
			}
			const targetWindow = dom.getWindow(renderHost);
			const targetRect = count.getBoundingClientRect();
			hover.containerDomNode.style.position = 'fixed';
			hover.containerDomNode.style.visibility = 'hidden';
			const hoverHost = renderHost.closest<HTMLElement>('.monaco-workbench') ?? targetWindow.document.body;
			hoverHost.appendChild(hover.containerDomNode);
			hover.onContentsChanged();
			const hoverRect = hover.containerDomNode.getBoundingClientRect();
			const left = Math.min(targetRect.left, targetWindow.innerWidth - hoverRect.width - 4);
			const top = Math.max(4, targetRect.top - hoverRect.height - 6);
			hover.containerDomNode.style.left = `${Math.max(4, left)}px`;
			hover.containerDomNode.style.top = `${top}px`;
			hover.containerDomNode.style.visibility = 'visible';
		};

		store.add(dom.addDisposableListener(count, dom.EventType.MOUSE_ENTER, show));
		store.add(dom.addDisposableListener(count, dom.EventType.MOUSE_LEAVE, scheduleHide));
		store.add(dom.addDisposableListener(count, dom.EventType.FOCUS, show));
		store.add(dom.addDisposableListener(count, dom.EventType.BLUR, scheduleHide));
		store.add(dom.addDisposableListener(hover.containerDomNode, dom.EventType.MOUSE_ENTER, cancelHide));
		store.add(dom.addDisposableListener(hover.containerDomNode, dom.EventType.MOUSE_LEAVE, scheduleHide));
		store.add({ dispose: hide });
	};
	const observer = new MutationObserver(apply);
	observer.observe(renderHost, { childList: true, subtree: true });
	renderStore.add({ dispose: () => observer.disconnect() });
	apply();
}

function getToolCallId(prototype: IHydraFusionPrototype, stage: IHydraFusionStage, tool: IHydraFusionTool): string {
	return `hydrafusion-${prototype.id}-${stage.id}-${tool.id}`;
}

function createToolAssistantPart(
	prototype: IHydraFusionPrototype,
	stage: IHydraFusionStage,
	tool: IHydraFusionTool,
	completed = tool.completed,
	includeDetails = true,
	startedAtOffsetMs?: number,
): IFixtureAssistantPart {
	const toolCallId = getToolCallId(prototype, stage, tool);
	if (tool.kind === 'subagent') {
		return {
			kind: 'subagent',
			toolCallId,
			description: tool.description ?? 'Review the current implementation',
			agentName: tool.agentName,
			completed,
			durationMs: tool.durationMs,
			credits: tool.credits,
			startedAtOffsetMs,
			delayMs: 720,
		};
	}

	return {
		kind: 'tool',
		toolCallId,
		toolId: `fixture.${tool.id}`,
		displayName: tool.displayName ?? 'Tool',
		invocationMessage: tool.invocationMessage ?? 'Running tool operation',
		pastTenseMessage: tool.pastTenseMessage,
		completed,
		input: includeDetails ? tool.input : undefined,
		inputLanguage: includeDetails ? tool.inputLanguage : undefined,
		output: includeDetails ? tool.output : undefined,
		delayMs: 560,
	};
}

function appendSeparator(parts: IFixtureAssistantPart[], id: string, delayMs = 440): void {
	parts.push({
		kind: 'thinking',
		id,
		text: '',
		delayMs,
	});
}

function appendSectionBreak(parts: IFixtureAssistantPart[], id: string, delayMs = 440): void {
	parts.push({
		kind: 'thinking',
		id,
		text: '',
		sectionBreak: true,
		delayMs,
	});
}

function appendStageParts(
	parts: IFixtureAssistantPart[],
	prototype: IHydraFusionPrototype,
	stage: IHydraFusionStage,
	detail: ThinkingDetail,
	showModels: boolean,
	options: {
		readonly streamText: boolean;
		readonly toolMode: 'stage' | 'completed' | 'animate';
		readonly includeOutcome: boolean;
		readonly generatedTitle?: string;
		readonly trailingSeparator?: boolean;
	},
): void {
	parts.push({
		kind: 'thinking',
		id: `hydrafusion-${prototype.id}-${stage.id}-activity`,
		text: createThinkingText(stage, detail, showModels),
		generatedTitle: stage.phaseEnd ? options.generatedTitle ?? getCompletedStageTitle(stage, showModels) : undefined,
		streamText: options.streamText,
		delayMs: 720,
	});

	if (detail === 'reasoningAndDrafts') {
		const draft = createDraftText(stage);
		if (draft) {
			appendSeparator(parts, `hydrafusion-${prototype.id}-${stage.id}-draft-separator`, 360);
			parts.push({
				kind: 'thinking',
				id: `hydrafusion-${prototype.id}-${stage.id}-draft`,
				text: draft,
				streamText: options.streamText,
				delayMs: 460,
			});
		}
	}

	for (const tool of stage.tools ?? []) {
		const completed = options.toolMode === 'completed' ? true : options.toolMode === 'animate' ? false : tool.completed;
		const startedAtOffsetMs = options.toolMode === 'stage' ? tool.durationMs : undefined;
		parts.push(createToolAssistantPart(prototype, stage, tool, completed, stage.toolDetails !== 'summary', startedAtOffsetMs));
		if (options.toolMode === 'animate') {
			parts.push({
				kind: 'toolCompletion',
				toolCallId: getToolCallId(prototype, stage, tool),
				durationMs: tool.durationMs,
				credits: tool.credits,
				delayMs: tool.kind === 'subagent' ? 2500 : 1500,
			});
		}
	}

	if (stage.continuation && (options.toolMode === 'completed' || options.toolMode === 'animate')) {
		const continuationText = detail === 'reasoningAndDrafts'
			? [`**${stage.continuation.title}**`, '', stage.continuation.summary].join('\n')
			: `**${stage.continuation.title}**`;
		parts.push({
			kind: 'thinking',
			id: `hydrafusion-${prototype.id}-${stage.id}-continuation`,
			text: continuationText,
			generatedTitle: stage.continuation.completedTitle,
			streamText: options.streamText,
			delayMs: 560,
		});
	}

	if (options.includeOutcome && stage.phaseEnd) {
		if (stage.outcome) {
			parts.push({
				kind: 'markdown',
				text: stage.outcome,
				streamText: options.streamText,
				delayMs: 600,
			});
		} else {
			appendSectionBreak(parts, `hydrafusion-${prototype.id}-${stage.id}-section-break`, 520);
		}
	} else if (options.includeOutcome && options.trailingSeparator !== false) {
		appendSeparator(parts, `hydrafusion-${prototype.id}-${stage.id}-next-separator`, 520);
	}
}

function createMessage(prototype: IHydraFusionPrototype, stageIndex: number, detail: ThinkingDetail, showModels: boolean): IFixtureMessage {
	const stage = prototype.stages[stageIndex];
	const initialAssistant: IFixtureAssistantPart[] = [];
	const assistant: IFixtureAssistantPart[] = [];

	if (stageIndex > 0) {
		for (const completedStage of prototype.stages.slice(0, stageIndex)) {
			appendStageParts(initialAssistant, prototype, completedStage, detail, showModels, {
				streamText: false,
				toolMode: 'completed',
				includeOutcome: true,
				generatedTitle: getCompletedStageTitle(completedStage, showModels),
			});
		}
	}

	appendStageParts(assistant, prototype, stage, detail, showModels, {
		streamText: true,
		toolMode: 'stage',
		includeOutcome: stage.complete === true,
		generatedTitle: stage.complete ? prototype.completedTitle : undefined,
		trailingSeparator: !stage.complete,
	});

	if (stage.complete && stage.finalResponse) {
		assistant.push({
			kind: 'markdown',
			text: stage.finalResponse,
			delayMs: 1040,
			streamText: true,
		});
	}

	return {
		user: prototype.prompt,
		initialAssistant,
		assistant,
		responseComplete: stage.complete === true,
		details: getUsageDetails(prototype),
		streaming: {
			initialDelayMs: 500,
			partDelayMs: 520,
			chunkDelayMs: 75,
			chunkSize: 28,
			completionDelayMs: 500,
		},
	};
}

function createAutoplayMessage(prototype: IHydraFusionPrototype, detail: ThinkingDetail, showModels: boolean): IFixtureMessage {
	const assistant: IFixtureAssistantPart[] = [];

	for (const stage of prototype.stages) {
		appendStageParts(assistant, prototype, stage, detail, showModels, {
			streamText: true,
			toolMode: 'animate',
			includeOutcome: true,
			generatedTitle: stage.complete ? prototype.completedTitle : undefined,
			trailingSeparator: !stage.complete,
		});
	}

	const finalResponse = prototype.stages.at(-1)?.finalResponse;
	if (finalResponse) {
		assistant.push({
			kind: 'markdown',
			text: finalResponse,
			delayMs: 1040,
			streamText: true,
		});
	}

	return {
		user: prototype.prompt,
		assistant,
		responseComplete: true,
		details: getUsageDetails(prototype),
		streaming: {
			initialDelayMs: 600,
			partDelayMs: 560,
			chunkDelayMs: 80,
			chunkSize: 30,
			completionDelayMs: 600,
		},
	};
}

async function renderHydraFusionPreview(
	context: ComponentFixtureContext,
	renderHost: HTMLElement,
	renderStore: DisposableStore,
	prototype: IHydraFusionPrototype,
	state: IHydraFusionDemoState,
): Promise<void> {
	const childContext: ComponentFixtureContext = {
		...context,
		container: renderHost,
		disposableStore: renderStore,
	};
	const showModelsInline = state.modelDisplay === 'inline';
	const message = state.playAll
		? createAutoplayMessage(prototype, state.detail, showModelsInline)
		: createMessage(prototype, state.stage, state.detail, showModelsInline);

	await renderChatWidget(childContext, {
		messages: [message],
		width: 780,
		height: 760,
		listHeight: 560,
		contentHorizontalPadding: 16,
		modelPickerLabel: 'HydraFusion Research Preview',
		models: [hydraFusionModel],
		thinkingStyle: state.startCollapsed
			? ThinkingDisplayMode.FixedScrollingCollapsibleCollapsed
			: ThinkingDisplayMode.FixedScrollingCollapsible,
		collapsedToolsStyle: CollapsedToolsDisplayMode.WithThinking,
		agentHostSession: true,
		responseFooterAction: true,
		onRendered: () => setupModelUsageDetails(renderHost, renderStore, prototype, state.modelDisplay),
	});

}

async function renderHydraFusionPrototype(context: ComponentFixtureContext): Promise<void> {
	const { container, disposableStore } = context;
	container.classList.add('hydrafusion-demo-fixture');
	container.classList.remove('disable-animations');

	const state: IHydraFusionDemoState = {
		prototypeId: 'cascade',
		stage: cascadePrototype.defaultStage,
		playAll: false,
		detail: 'reasoningAndDrafts',
		modelDisplay: 'hidden',
		startCollapsed: false,
	};
	const currentRender = disposableStore.add(new MutableDisposable<DisposableStore>());
	const currentControls = disposableStore.add(new MutableDisposable<DisposableStore>());

	const demo = dom.append(container, dom.$('.hydrafusion-demo'));
	const heading = dom.append(demo, dom.$('.hydrafusion-demo-heading'));
	dom.append(heading, dom.$('h2', undefined, 'HydraFusion Research Preview'));
	const workflowDescription = dom.append(heading, dom.$('p'));
	dom.append(heading, dom.$('p.hydrafusion-demo-assumption', undefined, 'Prototype assumption: HydraFusion can provide safe, user-facing step explanations and preview summaries. These are not private chain-of-thought or raw hidden output. Constituent models and AIC totals are illustrative because routes and usage vary by turn.'));

	const controls = dom.append(demo, dom.$('.hydrafusion-demo-controls'));
	const view = dom.append(demo, dom.$('.hydrafusion-demo-view'));

	const renderControls = () => {
		const controlStore = new DisposableStore();
		currentControls.value = controlStore;
		controls.replaceChildren();
		const trackedButtons: Array<{ readonly button: Button; readonly isActive: () => boolean }> = [];
		const prototype = prototypes[state.prototypeId];

		const addControlGroup = <T>(
			label: string,
			options: readonly IButtonOption<T>[],
			isActive: (value: T) => boolean,
			select: (value: T) => void,
			className: string,
		) => {
			const group = dom.append(controls, dom.$(`.hydrafusion-demo-control-group.${className}`));
			dom.append(group, dom.$('span.hydrafusion-demo-control-label', undefined, label));
			const choices = dom.append(group, dom.$('.hydrafusion-demo-control-choices'));
			for (const option of options) {
				const button = createControlButton(controlStore, choices, option.label, () => {
					select(option.value);
					void renderCurrent();
				});
				button.element.title = option.description;
				trackedButtons.push({ button, isActive: () => isActive(option.value) });
			}
		};

		addControlGroup(
			'Workflow',
			workflowOptions,
			value => state.prototypeId === value,
			value => {
				state.prototypeId = value;
				state.stage = prototypes[value].defaultStage;
				state.playAll = false;
			},
			'hydrafusion-demo-workflow-controls',
		);
		addControlGroup<number | 'playAll'>(
			'Stage',
			[
				{
					value: 'playAll',
					label: 'Play all',
					description: 'Replay the complete workflow through the real streaming response model.',
				},
				...prototype.stages.map((stage, index) => ({
					value: index,
					label: stage.label,
					description: stage.description,
				})),
			],
			value => value === 'playAll' ? state.playAll : !state.playAll && state.stage === value,
			value => {
				if (value === 'playAll') {
					state.playAll = true;
				} else {
					state.playAll = false;
					state.stage = value;
				}
			},
			'hydrafusion-demo-stage-controls',
		);
		addControlGroup(
			'Thinking detail',
			detailOptions,
			value => state.detail === value,
			value => { state.detail = value; },
			'hydrafusion-demo-detail-controls',
		);
		addControlGroup(
			'Models',
			modelOptions,
			value => state.modelDisplay === value,
			value => { state.modelDisplay = value; },
			'hydrafusion-demo-model-controls',
		);
		addControlGroup(
			'Initial state',
			initialStateOptions,
			value => state.startCollapsed === value,
			value => { state.startCollapsed = value; },
			'hydrafusion-demo-initial-state-controls',
		);

		for (const tracked of trackedButtons) {
			const active = tracked.isActive();
			tracked.button.element.classList.toggle('active', active);
			tracked.button.element.ariaPressed = String(active);
		}
	};

	const renderCurrent = async () => {
		const prototype = prototypes[state.prototypeId];
		container.dataset.workflow = prototype.id;
		workflowDescription.textContent = prototype.description;
		renderControls();
		const renderStore = new DisposableStore();
		currentRender.value = renderStore;
		const renderHost = dom.$('.hydrafusion-demo-render-host');
		view.replaceChildren(renderHost);
		await renderHydraFusionPreview(context, renderHost, renderStore, prototype, state);
	};

	await renderCurrent();
}

function createPrototypeFixture() {
	return defineComponentFixture({
		labels: { kind: 'animated' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderHydraFusionPrototype(context),
	});
}

export default defineThemedFixtureGroup({ path: 'chat/hydraFusion/' }, {
	ResearchPreview: createPrototypeFixture(),
});
