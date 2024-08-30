/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { RuntimeExtensionsEditor, StartExtensionHostProfileAction, StopExtensionHostProfileAction, CONTEXT_PROFILE_SESSION_STATE, CONTEXT_EXTENSION_HOST_PROFILE_RECORDED, SaveExtensionHostProfileAction, IExtensionHostProfileService } from './runtimeExtensionsEditor.js';
import { DebugExtensionHostAction, DebugExtensionsContribution } from './debugExtensionHostAction.js';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from '../../../common/editor.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CleanUpExtensionsFolderAction, OpenExtensionsFolderAction } from './extensionsActions.js';
import { IExtensionRecommendationNotificationService } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { ExtensionRecommendationNotificationServiceChannel } from '../../../../platform/extensionRecommendations/common/extensionRecommendationsIpc.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { RemoteExtensionsInitializerContribution } from './remoteExtensionsInit.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ExtensionHostProfileService } from './extensionProfileService.js';
import { ExtensionsAutoProfiler } from './extensionsAutoProfiler.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

// Singletons
registerSingleton(IExtensionHostProfileService, ExtensionHostProfileService, InstantiationType.Delayed);

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

class ExtensionsContributions extends Disposable implements IWorkbenchContribution {

	constructor(
		@IExtensionRecommendationNotificationService extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super();

		sharedProcessService.registerChannel('extensionRecommendationNotification', new ExtensionRecommendationNotificationServiceChannel(extensionRecommendationNotificationService));

		this._register(registerAction2(OpenExtensionsFolderAction));
		this._register(registerAction2(CleanUpExtensionsFolderAction));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsAutoProfiler, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(RemoteExtensionsInitializerContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(DebugExtensionsContribution, LifecyclePhase.Restored);
// Register Commands

CommandsRegistry.registerCommand(DebugExtensionHostAction.ID, (accessor: ServicesAccessor, ...args) => {
	const instantiationService = accessor.get(IInstantiationService);
	return instantiationService.createInstance(DebugExtensionHostAction).run(args);
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

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: DebugExtensionHostAction.ID,
		title: localize('debugExtensionHost', "Debug Extensions In New Window"),
		category: localize('developer', "Developer"),
		icon: Codicon.debugStart
	},
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
