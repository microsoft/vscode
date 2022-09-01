/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { MenuRegistry, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { RuntimeExtensionsEditor, StartExtensionHostProfileAction, StopExtensionHostProfileAction, CONTEXT_PROFILE_SESSION_STATE, CONTEXT_EXTENSION_HOST_PROFILE_RECORDED, SaveExtensionHostProfileAction, IExtensionHostProfileService } from 'vs/workbench/contrib/extensions/electron-sandbox/runtimeExtensionsEditor';
import { DebugExtensionHostAction } from 'vs/workbench/contrib/extensions/electron-sandbox/debugExtensionHostAction';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { OpenExtensionsFolderAction } from 'vs/workbench/contrib/extensions/electron-sandbox/extensionsActions';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ExtensionRecommendationNotificationServiceChannel } from 'vs/platform/extensionRecommendations/electron-sandbox/extensionRecommendationsIpc';
import { Codicon } from 'vs/base/common/codicons';
import { RemoteExtensionsInitializerContribution } from 'vs/workbench/contrib/extensions/electron-sandbox/remoteExtensionsInit';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionHostProfileService } from 'vs/workbench/contrib/extensions/electron-sandbox/extensionProfileService';
import { ExtensionsAutoProfiler } from 'vs/workbench/contrib/extensions/electron-sandbox/extensionsAutoProfiler';

// Singletons
registerSingleton(IExtensionHostProfileService, ExtensionHostProfileService, true);

// Running Extensions Editor
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RuntimeExtensionsEditor, RuntimeExtensionsEditor.ID, localize('runtimeExtension', "Running Extensions")),
	[new SyncDescriptor(RuntimeExtensionsInput)]
);

class RuntimeExtensionsInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}
	serialize(editorInput: EditorInput): string {
		return '';
	}
	deserialize(instantiationService: IInstantiationService): EditorInput {
		return RuntimeExtensionsInput.instance;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(RuntimeExtensionsInput.ID, RuntimeExtensionsInputSerializer);


// Global actions

class ExtensionsContributions implements IWorkbenchContribution {

	constructor(
		@IExtensionRecommendationNotificationService extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		sharedProcessService.registerChannel('extensionRecommendationNotification', new ExtensionRecommendationNotificationServiceChannel(extensionRecommendationNotificationService));
		registerAction2(OpenExtensionsFolderAction);
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, 'ExtensionsContributions', LifecyclePhase.Starting);
workbenchRegistry.registerWorkbenchContribution(ExtensionsAutoProfiler, 'ExtensionsAutoProfiler', LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(RemoteExtensionsInitializerContribution, 'RemoteExtensionsInitializerContribution', LifecyclePhase.Restored);
// Register Commands

CommandsRegistry.registerCommand(DebugExtensionHostAction.ID, (accessor: ServicesAccessor) => {
	const instantiationService = accessor.get(IInstantiationService);
	instantiationService.createInstance(DebugExtensionHostAction).run();
});

CommandsRegistry.registerCommand(StartExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantiationService = accessor.get(IInstantiationService);
	instantiationService.createInstance(StartExtensionHostProfileAction, StartExtensionHostProfileAction.ID, StartExtensionHostProfileAction.LABEL).run();
});

CommandsRegistry.registerCommand(StopExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantiationService = accessor.get(IInstantiationService);
	instantiationService.createInstance(StopExtensionHostProfileAction, StopExtensionHostProfileAction.ID, StopExtensionHostProfileAction.LABEL).run();
});

CommandsRegistry.registerCommand(SaveExtensionHostProfileAction.ID, (accessor: ServicesAccessor) => {
	const instantiationService = accessor.get(IInstantiationService);
	instantiationService.createInstance(SaveExtensionHostProfileAction, SaveExtensionHostProfileAction.ID, SaveExtensionHostProfileAction.LABEL).run();
});

// Running extensions

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: DebugExtensionHostAction.ID,
		title: DebugExtensionHostAction.LABEL,
		icon: Codicon.debugStart
	},
	group: 'navigation',
	when: ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StartExtensionHostProfileAction.ID,
		title: StartExtensionHostProfileAction.LABEL,
		icon: Codicon.circleFilled
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StopExtensionHostProfileAction.ID,
		title: StopExtensionHostProfileAction.LABEL,
		icon: Codicon.debugStop
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SaveExtensionHostProfileAction.ID,
		title: SaveExtensionHostProfileAction.LABEL,
		icon: Codicon.saveAll,
		precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID))
});
