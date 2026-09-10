/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../common/sessionComparison.js';
import { SessionComparisonEditor } from './sessionComparisonEditor.js';
import { SessionComparisonEditorInput, SessionComparisonEditorSerializer } from './sessionComparisonEditorInput.js';
import { SessionComparisonToolContribution } from './sessionComparisonTool.js';
import { SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING } from '../../../services/sessions/browser/sessionComparisonService.js';

registerWorkbenchContribution2(SessionComparisonToolContribution.ID, SessionComparisonToolContribution, WorkbenchPhase.Eventually);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental', 'advanced'],
			description: localize2('sessionComparison.autoSynthesizeDescription', "Automatically starts a new isolated synthesis session after the Judge recommends an implementation attempt. Original attempts are preserved.").value,
		},
	},
});

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
		const editorService = accessor.get(IEditorService);
		const input = accessor.get(IInstantiationService).createInstance(SessionComparisonEditorInput, comparisonId);
		await editorService.openEditor(input, { pinned: true });
	}
});
