/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { MenuId, MenuRegistry, SyncActionDescriptor, registerAction } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { OutputService, LogContentProvider } from 'vs/workbench/contrib/output/browser/outputServices';
import { ToggleOutputAction, ClearOutputAction, OpenLogOutputFile, ShowLogsOutputChannelAction, OpenOutputLogFileAction } from 'vs/workbench/contrib/output/browser/outputActions';
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_PANEL_ID, IOutputService, CONTEXT_IN_OUTPUT, LOG_SCHEME, LOG_MODE_ID, LOG_MIME, CONTEXT_ACTIVE_LOG_OUTPUT } from 'vs/workbench/contrib/output/common/output';
import { PanelRegistry, Extensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { OutputPanel } from 'vs/workbench/contrib/output/browser/outputPanel';
import { IEditorRegistry, Extensions as EditorExtensions, EditorDescriptor } from 'vs/workbench/browser/editor';
import { LogViewer, LogViewerInput } from 'vs/workbench/contrib/output/browser/logViewer';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModelService } from 'vs/editor/common/services/resolverService';

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Mode
ModesRegistry.registerLanguage({
	id: OUTPUT_MODE_ID,
	extensions: [],
	mimetypes: [OUTPUT_MIME]
});

// Register Log Output Mode
ModesRegistry.registerLanguage({
	id: LOG_MODE_ID,
	extensions: [],
	mimetypes: [LOG_MIME]
});

// Register Output Panel
Registry.as<PanelRegistry>(Extensions.Panels).registerPanel(PanelDescriptor.create(
	OutputPanel,
	OUTPUT_PANEL_ID,
	nls.localize('output', "Output"),
	'output',
	20,
	ToggleOutputAction.ID
));

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		LogViewer,
		LogViewer.LOG_VIEWER_EDITOR_ID,
		nls.localize('logViewer', "Log Viewer")
	),
	[
		new SyncDescriptor(LogViewerInput)
	]
);

class OutputContribution implements IWorkbenchContribution {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService textModelService: ITextModelService
	) {
		textModelService.registerTextModelContentProvider(LOG_SCHEME, instantiationService.createInstance(LogContentProvider));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(OutputContribution, LifecyclePhase.Restored);

// register toggle output action globally
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleOutputAction, ToggleOutputAction.ID, ToggleOutputAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_U,
	linux: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_H)  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
	}
}), 'View: Toggle Output', nls.localize('viewCategory', "View"));

actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ClearOutputAction, ClearOutputAction.ID, ClearOutputAction.LABEL),
	'View: Clear Output', nls.localize('viewCategory', "View"));

const devCategory = nls.localize('developer', "Developer");
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ShowLogsOutputChannelAction, ShowLogsOutputChannelAction.ID, ShowLogsOutputChannelAction.LABEL), 'Developer: Show Logs...', devCategory);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(OpenOutputLogFileAction, OpenOutputLogFileAction.ID, OpenOutputLogFileAction.LABEL), 'Developer: Open Log File...', devCategory);

// Define clear command, contribute to editor context menu
registerAction({
	id: 'editor.action.clearoutput',
	title: { value: nls.localize('clearOutput.label', "Clear Output"), original: 'Clear Output' },
	menu: {
		menuId: MenuId.EditorContext,
		when: CONTEXT_IN_OUTPUT
	},
	handler(accessor) {
		const activeChannel = accessor.get(IOutputService).getActiveChannel();
		if (activeChannel) {
			activeChannel.clear();
		}
	}
});

registerAction({
	id: 'workbench.action.openActiveLogOutputFile',
	title: { value: nls.localize('openActiveLogOutputFile', "Open Active Log Output File"), original: 'Open Active Log Output File' },
	menu: {
		menuId: MenuId.CommandPalette,
		when: CONTEXT_ACTIVE_LOG_OUTPUT
	},
	handler(accessor) {
		accessor.get(IInstantiationService).createInstance(OpenLogOutputFile).run();
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '4_panels',
	command: {
		id: ToggleOutputAction.ID,
		title: nls.localize({ key: 'miToggleOutput', comment: ['&& denotes a mnemonic'] }, "&&Output")
	},
	order: 1
});
