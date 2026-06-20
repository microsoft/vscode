/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
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

// Register test command
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
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);

		const input = instantiationService.createInstance(SurveyEditorInput, CopilotPMFSurvey);

		// In the sessions window, open in the main editor part (not modal)
		const preferredGroup = environmentService.isSessionsWindow
			? editorGroupsService.mainPart.activeGroup
			: undefined;

		await editorService.openEditor(input, { pinned: true }, preferredGroup);
	}
}

registerAction2(OpenSurveyAction);

// Accessibility help for the survey pane
class SurveyAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'survey';
	readonly type = AccessibleViewType.Help;
	readonly when = ActiveEditorContext.isEqualTo(SurveyEditorPane.ID);

	getProvider(_accessor: ServicesAccessor) {
		const helpText = [
			localize('survey.help.overview', "You are in a survey form. Use Tab to move between questions and options."),
			localize('survey.help.select', "Use arrow keys within a question to navigate between options, and Space or Enter to select."),
			localize('survey.help.submit', "Tab to the Submit button and press Enter once all questions are answered."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Survey,
			{ type: AccessibleViewType.Help },
			() => helpText,
			() => { /* focus returns to survey pane automatically */ },
			AccessibilityVerbositySettingId.Survey,
		);
	}
}

AccessibleViewRegistry.register(new SurveyAccessibilityHelp());
