/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { RuntimeExtensionsEditor, ShowRuntimeExtensionsAction, IExtensionHostProfileService, DebugExtensionHostAction, StartExtensionHostProfileAction, StopExtensionHostProfileAction, CONTEXT_PROFILE_SESSION_STATE, SaveExtensionHostProfileAction, CONTEXT_EXTENSION_HOST_PROFILE_RECORDED } from 'vs/workbench/contrib/extensions/electron-browser/runtimeExtensionsEditor';
import { EditorInput, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, ActiveEditorContext } from 'vs/workbench/common/editor';
import { ExtensionHostProfileService } from 'vs/workbench/contrib/extensions/electron-browser/extensionProfileService';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/electron-browser/runtimeExtensionsInput';
import { URI } from 'vs/base/common/uri';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionsAutoProfiler } from 'vs/workbench/contrib/extensions/electron-browser/extensionsAutoProfiler';

// Singletons
registerSingleton(IExtensionHostProfileService, ExtensionHostProfileService, true);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsAutoProfiler, LifecyclePhase.Eventually);

// Running Extensions Editor

const runtimeExtensionsEditorDescriptor = new EditorDescriptor(
	RuntimeExtensionsEditor,
	RuntimeExtensionsEditor.ID,
	localize('runtimeExtension', "Running Extensions")
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(runtimeExtensionsEditorDescriptor, [new SyncDescriptor(RuntimeExtensionsInput)]);

class RuntimeExtensionsInputFactory implements IEditorInputFactory {
	serialize(editorInput: EditorInput): string {
		return '';
	}
	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		return new RuntimeExtensionsInput();
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(RuntimeExtensionsInput.ID, RuntimeExtensionsInputFactory);


// Global actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowRuntimeExtensionsAction, ShowRuntimeExtensionsAction.ID, ShowRuntimeExtensionsAction.LABEL), 'Show Running Extensions', localize('developer', "Developer"));

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
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/start-dark.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/start-light.svg`)),
		}
	},
	group: 'navigation',
	when: ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StartExtensionHostProfileAction.ID,
		title: StartExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/profile-start-dark.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/profile-start-light.svg`)),
		}
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: StopExtensionHostProfileAction.ID,
		title: StopExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/profile-stop-dark.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/profile-stop-light.svg`)),
		}
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running'))
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: SaveExtensionHostProfileAction.ID,
		title: SaveExtensionHostProfileAction.LABEL,
		iconLocation: {
			dark: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/save-dark.svg`)),
			light: URI.parse(require.toUrl(`vs/workbench/contrib/extensions/browser/media/save-light.svg`)),
		},
		precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED
	},
	group: 'navigation',
	when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID))
});
