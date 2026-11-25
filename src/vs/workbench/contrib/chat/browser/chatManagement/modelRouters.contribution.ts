/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ModelRouterEnabledSettingId } from '../../../../../platform/agentHost/common/modelRouterConfig.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ModelRoutersEditor } from './modelRoutersEditor.js';
import { ModelRoutersEditorInput } from './modelRoutersEditorInput.js';

// Model routers are read by this window's own Copilot agent, which only a desktop window has. The editor
// pane registered here is what makes the Language Models command open the Model Routers editor beside it.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ModelRoutersEditor, ModelRoutersEditor.ID, localize('modelRoutersEditor', "Model Routers Editor")),
	[new SyncDescriptor(ModelRoutersEditorInput)]
);

class ModelRoutersEditorInputSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): ModelRoutersEditorInput | undefined {
		const enabled = instantiationService.invokeFunction(accessor => accessor.get(IConfigurationService).getValue(ModelRouterEnabledSettingId) === true);
		return enabled ? new ModelRoutersEditorInput() : undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ModelRoutersEditorInput.ID, ModelRoutersEditorInputSerializer);

/** Closes the Model Routers editors when model routers are turned off. */
class ModelRoutersEditorEnablement extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.modelRoutersEditorEnablement';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ModelRouterEnabledSettingId) && configurationService.getValue(ModelRouterEnabledSettingId) !== true) {
				editorService.closeEditors(editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor instanceof ModelRoutersEditorInput));
			}
		}));
	}
}

registerWorkbenchContribution2(ModelRoutersEditorEnablement.ID, ModelRoutersEditorEnablement, WorkbenchPhase.AfterRestored);

class ModelRoutersAccessibility implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'model-routers';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, ActiveEditorContext.isEqualTo(ModelRoutersEditor.ID));

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		const routers = editor instanceof ModelRoutersEditor ? editor.getAccessibilityContent() : undefined;
		if (!editor || !routers) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.Help ? [
			localize('modelRouters.help.overview', "A model router sends each chat to the route that best matches your request. The tree lists each router with its routes as children: a route's name, its model and settings, and when it is used. The first route is used when no route clearly fits."),
			localize('modelRouters.help.navigation', "Use Tab and Shift+Tab to move between search, Add Router, the tree, and the actions of the focused router. Use the Up Arrow, Down Arrow, Home, and End keys to navigate, and the Left Arrow and Right Arrow keys to collapse or expand a router. Press Enter on a router or a route to edit the router in a form."),
			localize('modelRouters.help.actions', "On a router, Tab to the Route Switching switch and press Space to change whether a chat can move to another route after its first message, or to More Actions to edit the router, open its file, or edit it with AI. Press Enter on Add Router to enter a new router in a form."),
		].join('\n\n') : routers;
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ModelRouters,
			{ type: this.type, language: 'plaintext' },
			() => content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			// Routers are a customization of the agent, so they follow the hint setting of the other customization pages.
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new ModelRoutersAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new ModelRoutersAccessibility(AccessibleViewType.View));
