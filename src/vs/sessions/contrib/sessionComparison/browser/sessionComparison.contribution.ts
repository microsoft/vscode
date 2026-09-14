/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../common/sessionComparison.js';
import { SessionComparisonEditor } from './sessionComparisonEditor.js';
import { SessionComparisonEditorInput, SessionComparisonEditorSerializer } from './sessionComparisonEditorInput.js';
import { SessionComparisonToolContribution } from './sessionComparisonTool.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionComparisonAccessibilityHelp, SessionComparisonAccessibleView } from './sessionComparisonAccessibility.js';
import { SessionComparisonNavigationContribution } from './sessionComparisonNavigation.js';
import { ISessionComparisonViewService, SessionComparisonViewService } from './sessionComparisonViewService.js';

registerSingleton(ISessionComparisonViewService, SessionComparisonViewService, InstantiationType.Delayed);

class SessionComparisonViewContribution {
	static readonly ID = 'sessions.contrib.comparisonView';
	constructor(@ISessionComparisonViewService _viewService: ISessionComparisonViewService) { }
}

registerWorkbenchContribution2(SessionComparisonToolContribution.ID, SessionComparisonToolContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(SessionComparisonViewContribution.ID, SessionComparisonViewContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionComparisonNavigationContribution.ID, SessionComparisonNavigationContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new SessionComparisonAccessibilityHelp());
AccessibleViewRegistry.register(new SessionComparisonAccessibleView());

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionComparisonEditor, SessionComparisonEditor.ID, localize2('sessionComparisonEditor.label', "Compare Attempts").value),
	[new SyncDescriptor(SessionComparisonEditorInput)],
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	SessionComparisonEditorInput.ID,
	SessionComparisonEditorSerializer,
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_SESSION_COMPARISON_COMMAND_ID,
			title: localize2('openSessionComparison', "Open Attempt Comparison"),
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, comparisonId: string): Promise<void> {
		await accessor.get(ISessionComparisonViewService).open(comparisonId);
	}
});
