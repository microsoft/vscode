/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens, IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID } from '../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { ISpotlightStep, SpotlightMissingTargetBehavior } from '../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { GetStartedItemId } from '../common/getStartedChecklist.js';

/** Onboarding spotlight targets that the Get Started tours point at. */
export const enum GetStartedTourTarget {
	NewSession = 'sessions.newSession.button',
	NewSessionInput = 'sessions.newSession.input',
	WorkspacePicker = 'sessions.newSession.workspacePicker',
	Isolation = 'sessions.newSession.isolation',
	Automations = 'sessions.automations.entry',
	AutomationTemplates = 'sessions.automations.templates',
	CreateAutomation = 'sessions.automations.create',
	ChangesActions = 'sessions.changes.actions',
	/** Resolved by the tour runner to the editor that shows the session's changes. */
	ChangesEditor = 'sessions.getStarted.changesEditor',
}

/** Moves the Agents window to where a tour step's target lives. */
export interface IGetStartedTourNavigation {
	showSessionsList(): Promise<void>;
	/** Opens the new-session view, unless it is already showing. */
	showNewSession(): Promise<void>;
	/** Opens the session whose changes the tour reviews. */
	showSessionWithChanges(): Promise<void>;
	/** Opens the changes of that session in an editor, unless they are already showing. */
	showChanges(): Promise<void>;
	showAutomations(): Promise<void>;
}

/** What a tour knows about the user's work when it starts. */
export interface IGetStartedTourContext {
	/** Whether the new-session view is showing. */
	readonly onNewSessionView: boolean;
	/** The project of the user's most recent session, and the target that shows it in the sessions list. */
	readonly currentProject?: { readonly label: string; readonly targetId: string };
	/** Other projects the user worked on recently, for example in the editor window. At most two. */
	readonly suggestedProjects: readonly string[];
	/** A session with changes to review. */
	readonly sessionWithChanges?: { readonly fileCount: number };
	readonly navigation: IGetStartedTourNavigation;
}

/** For steps the tour cannot go on without. */
const WAIT_FOR_TARGET: SpotlightMissingTargetBehavior = { kind: 'wait', timeoutMs: 5_000, onTimeout: 'skip' };
/** For steps whose control only shows in some setups, like the isolation picker in a Git repository. */
const SKIP_IF_MISSING: SpotlightMissingTargetBehavior = { kind: 'wait', timeoutMs: 2_000, onTimeout: 'skip' };

/** Creates the steps of an item's Show Me tour, adapted to the user's work. */
export function createGetStartedTourSteps(item: GetStartedItemId, context: IGetStartedTourContext): ISpotlightStep[] {
	switch (item) {
		case GetStartedItemId.StartSession:
			return createStartSessionSteps(context);
		case GetStartedItemId.RunInParallel:
			return createRunInParallelSteps(context);
		case GetStartedItemId.SecondProject:
			return createSecondProjectSteps(context);
		case GetStartedItemId.KeepChanges:
			return createKeepChangesSteps(context);
		case GetStartedItemId.Automation:
			return createAutomationSteps(context);
	}
}

function createStartSessionSteps(context: IGetStartedTourContext): ISpotlightStep[] {
	return [
		{
			...createPromptStep(
				context,
				localize('getStarted.tour.startSession.prompt.title', "Describe your task"),
				localize('getStarted.tour.startSession.prompt.description', "Describe a task here, like you would in Chat. When you send it, the agent works on it in its own session while you do something else."),
			),
			// The project step follows, so typing the task doesn't end this step.
			advanceOnTargetClick: false,
		},
		{
			id: 'workspacePicker',
			targetId: GetStartedTourTarget.WorkspacePicker,
			title: localize('getStarted.tour.startSession.picker.title', "Choose the project"),
			description: localize('getStarted.tour.startSession.picker.description', "Pick the folder or repository the task runs in, so the agent reads and edits the right files."),
			placement: 'above',
			allowTargetInteraction: true,
			advanceOnTargetSelection: true,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: () => context.navigation.showNewSession(),
		},
	];
}

function createRunInParallelSteps(context: IGetStartedTourContext): ISpotlightStep[] {
	return [
		...(context.onNewSessionView ? [] : [createNewSessionStep(
			context,
			localize('getStarted.tour.runInParallel.new.title', "Start another session"),
			localize('getStarted.tour.runInParallel.new.description', "Your agents keep working while you start the next task. Select New to start another session."),
		)]),
		{
			id: 'isolation',
			targetId: GetStartedTourTarget.Isolation,
			title: localize('getStarted.tour.runInParallel.isolation.title', "Keep agents out of each other's way"),
			description: localize('getStarted.tour.runInParallel.isolation.description', "Pick New Worktree to give this agent its own copy of the files, so your agents don't interfere with each other. Pick Branch when it should work on the same files as your other agents."),
			placement: 'below',
			allowTargetInteraction: true,
			missingTarget: SKIP_IF_MISSING,
			onBeforeShow: () => context.navigation.showNewSession(),
		},
		createPromptStep(
			context,
			localize('getStarted.tour.runInParallel.prompt.title', "Send the next task"),
			localize('getStarted.tour.runInParallel.prompt.description', "Describe the next task and send it. Both agents work at the same time, and you can check on each one in the sessions list."),
		),
	];
}

function createSecondProjectSteps(context: IGetStartedTourContext): ISpotlightStep[] {
	const [first, second] = context.suggestedProjects;
	const steps: ISpotlightStep[] = [];
	if (context.currentProject) {
		steps.push({
			id: 'currentProject',
			targetId: context.currentProject.targetId,
			title: localize('getStarted.tour.secondProject.current.title', "One window for all your projects"),
			description: markdown(localize('getStarted.tour.secondProject.current.description', "You've worked in {0} from this window. The sessions of every project you work on show up in this list.", bold(context.currentProject.label))),
			placement: 'right',
			missingTarget: SKIP_IF_MISSING,
			onBeforeShow: () => context.navigation.showSessionsList(),
		});
	}
	steps.push({
		id: 'workspacePicker',
		targetId: GetStartedTourTarget.WorkspacePicker,
		title: localize('getStarted.tour.secondProject.picker.title', "Pick another project"),
		description: second
			? markdown(localize('getStarted.tour.secondProject.picker.twoProjects', "You can work on {0} or {1} from here too, without opening another window.", bold(first), bold(second)))
			: first
				? markdown(localize('getStarted.tour.secondProject.picker.oneProject', "You can work on {0} from here too, without opening another window.", bold(first)))
				: localize('getStarted.tour.secondProject.picker.anyProject', "Pick any folder or repository for your next session, without opening another window."),
		placement: 'above',
		openTarget: true,
		allowTargetInteraction: true,
		advanceOnTargetSelection: true,
		missingTarget: WAIT_FOR_TARGET,
		onBeforeShow: () => context.navigation.showNewSession(),
	});
	return steps;
}

function createKeepChangesSteps(context: IGetStartedTourContext): ISpotlightStep[] {
	if (!context.sessionWithChanges) {
		return [
			...(context.onNewSessionView ? [] : [createNewSessionStep(
				context,
				localize('getStarted.tour.keepChanges.new.title', "Start a session"),
				localize('getStarted.tour.keepChanges.new.description', "Select New to start a session that changes some code."),
			)]),
			createPromptStep(
				context,
				localize('getStarted.tour.keepChanges.prompt.title', "Ask for a change"),
				localize('getStarted.tour.keepChanges.prompt.description', "Ask an agent to change some code. When it's done, you can review its changes in the editor and keep the ones you want."),
			),
		];
	}
	const { fileCount } = context.sessionWithChanges;
	return [
		{
			id: 'changesPill',
			targetId: CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID,
			title: localize('getStarted.tour.keepChanges.pill.title', "See what the agent changed"),
			description: fileCount === 1
				? localize('getStarted.tour.keepChanges.pill.oneFile', "This session changed 1 file. Select the changes to review them.")
				: localize('getStarted.tour.keepChanges.pill.files', "This session changed {0} files. Select the changes to review them.", fileCount),
			placement: 'above',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			hideNext: false,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: () => context.navigation.showSessionWithChanges(),
		},
		{
			id: 'changesEditor',
			targetId: GetStartedTourTarget.ChangesEditor,
			title: localize('getStarted.tour.keepChanges.editor.title', "Review the changes"),
			description: localize('getStarted.tour.keepChanges.editor.description', "Review each change in the diff editor you know from VS Code. You can edit the files, or comment on a line to give the agent feedback."),
			placement: 'left',
			allowTargetInteraction: true,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: () => context.navigation.showChanges(),
		},
		{
			id: 'keepChanges',
			targetId: GetStartedTourTarget.ChangesActions,
			title: localize('getStarted.tour.keepChanges.actions.title', "Keep the changes"),
			description: localize('getStarted.tour.keepChanges.actions.description', "When the changes look good, merge, commit or create a pull request to keep them."),
			placement: 'below',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			hideNext: false,
			missingTarget: SKIP_IF_MISSING,
		},
	];
}

function createAutomationSteps(context: IGetStartedTourContext): ISpotlightStep[] {
	return [
		{
			id: 'automations',
			targetId: GetStartedTourTarget.Automations,
			title: localize('getStarted.tour.automation.entry.title', "Automate recurring work"),
			description: localize('getStarted.tour.automation.entry.description', "Automations run an agent on a schedule, like a daily look at new issues. Open Automations to set one up."),
			placement: 'right',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			hideNext: false,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: () => context.navigation.showSessionsList(),
		},
		{
			id: 'templates',
			targetId: GetStartedTourTarget.AutomationTemplates,
			title: localize('getStarted.tour.automation.templates.title', "Start from an example"),
			description: localize('getStarted.tour.automation.templates.description', "These example automations are ready to use. Pick one, then review and adjust it before you create it."),
			placement: 'auto',
			openTarget: true,
			missingTarget: SKIP_IF_MISSING,
			onBeforeShow: () => context.navigation.showAutomations(),
		},
		{
			id: 'createAutomation',
			targetId: GetStartedTourTarget.CreateAutomation,
			title: localize('getStarted.tour.automation.create.title', "Or create your own"),
			description: localize('getStarted.tour.automation.create.description', "Describe what the agent should do and choose when it runs."),
			placement: 'below',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			hideNext: false,
			missingTarget: WAIT_FOR_TARGET,
			onBeforeShow: () => context.navigation.showAutomations(),
		},
	];
}

function createNewSessionStep(context: IGetStartedTourContext, title: string, description: string): ISpotlightStep {
	return {
		id: 'newSession',
		targetId: GetStartedTourTarget.NewSession,
		title,
		description,
		placement: 'right',
		allowTargetInteraction: true,
		advanceOnTargetClick: true,
		hideNext: false,
		missingTarget: WAIT_FOR_TARGET,
		onBeforeShow: () => context.navigation.showSessionsList(),
	};
}

function createPromptStep(context: IGetStartedTourContext, title: string, description: string): ISpotlightStep {
	return {
		id: 'prompt',
		targetId: GetStartedTourTarget.NewSessionInput,
		title,
		description,
		placement: 'below',
		allowTargetInteraction: true,
		advanceOnTargetClick: true,
		hideNext: false,
		missingTarget: WAIT_FOR_TARGET,
		onBeforeShow: () => context.navigation.showNewSession(),
	};
}

function bold(text: string): string {
	return `**${escapeMarkdownSyntaxTokens(text)}**`;
}

function markdown(value: string): IMarkdownString {
	return new MarkdownString(value);
}
