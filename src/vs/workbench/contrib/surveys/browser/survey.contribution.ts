/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IsDevelopmentContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SurveyEditorInput } from './surveyEditorInput.js';
import { SurveyEditorPane } from './surveyEditorPane.js';
import { CopilotPMFSurvey } from './surveyQuestions.js';

// Register editor pane
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SurveyEditorPane,
		SurveyEditorPane.ID,
		localize('surveyEditorPaneTitle', "Survey")
	),
	[new SyncDescriptor(SurveyEditorInput)]
);

// Register test command (developer-only, visible in command palette)
class OpenSurveyAction extends Action2 {
	static readonly ID = 'workbench.action.openSurvey';

	constructor() {
		super({
			id: OpenSurveyAction.ID,
			title: localize2('openSurvey', "Open Survey"),
			category: Categories.Developer,
			f1: true,
			precondition: IsDevelopmentContext,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const productService = accessor.get(IProductService);
		if (productService.quality === 'stable') {
			return; // Never open dev survey in stable builds
		}
		return openSurveyEditor(accessor, 'dev-command');
	}
}

registerAction2(OpenSurveyAction);

// Known survey source prefixes (validated for telemetry safety)
const KNOWN_SOURCE_PREFIXES = [
	'completions', 'panel.', 'inline.', 'terminal',
	'agent.', 'agents', 'sessions', 'nps', 'churn', 'dev-command',
];

function sanitizeSurveySource(source: unknown): string {
	if (typeof source !== 'string') {
		return 'unknown';
	}
	const trimmed = source.trim().slice(0, 64);
	if (KNOWN_SOURCE_PREFIXES.some(prefix => trimmed === prefix || trimmed.startsWith(prefix))) {
		return trimmed;
	}
	return 'unknown';
}

// Programmatic command for extensions to trigger the survey (e.g. from Copilot survey service)
CommandsRegistry.registerCommand('_workbench.action.openCopilotSurvey', (accessor: ServicesAccessor, source?: unknown) => {
	return openSurveyEditor(accessor, sanitizeSurveySource(source));
});

function openSurveyEditor(accessor: ServicesAccessor, source?: string): Promise<void> {
	const instantiationService = accessor.get(IInstantiationService);
	const editorService = accessor.get(IEditorService);
	const editorGroupsService = accessor.get(IEditorGroupsService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	const surveySource = environmentService.isSessionsWindow ? 'agents' : source;

	const input = instantiationService.createInstance(SurveyEditorInput, CopilotPMFSurvey, surveySource);

	// If the same survey is already open (singleton match), update its source
	for (const editor of editorService.editors) {
		if (editor instanceof SurveyEditorInput && editor.matches(input)) {
			editor.updateSource(surveySource);
			break;
		}
	}

	// In the sessions window, open in the main editor part (not modal)
	const preferredGroup = environmentService.isSessionsWindow
		? editorGroupsService.mainPart.activeGroup
		: undefined;

	return editorService.openEditor(input, { pinned: true }, preferredGroup).then(() => undefined);
}

// Accessibility help for the survey pane
class SurveyAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'survey';
	readonly type = AccessibleViewType.Help;
	readonly when = ActiveEditorContext.isEqualTo(SurveyEditorPane.ID);

	getProvider(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const helpText = [
			localize('survey.help.overview', "You are in a survey form. Use Tab to move between questions and options."),
			localize('survey.help.select', "Use arrow keys within a question to navigate between options, and Space or Enter to select."),
			localize('survey.help.submit', "Tab to the Submit button and press Enter once the required question is answered. Additional questions are optional."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Survey,
			{ type: AccessibleViewType.Help },
			() => helpText,
			() => { editorService.activeEditorPane?.focus(); },
			AccessibilityVerbositySettingId.Survey,
		);
	}
}

AccessibleViewRegistry.register(new SurveyAccessibilityHelp());
