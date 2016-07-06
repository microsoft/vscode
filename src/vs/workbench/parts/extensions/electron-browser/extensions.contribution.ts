/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensions';
import { localize } from 'vs/nls';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionGalleryService, IExtensionTipsService, ExtensionsLabel, ExtensionsChannelId } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ExtensionsWorkbenchExtension, StatusUpdater } from 'vs/workbench/parts/extensions/electron-browser/extensionsWorkbenchExtension';
import { IOutputChannelRegistry, Extensions as OutputExtensions } from 'vs/workbench/parts/output/common/output';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { VIEWLET_ID, IExtensionsWorkbenchService } from './extensions';
import { ExtensionsWorkbenchService } from './extensionsWorkbenchService';
import { OpenExtensionsViewletAction, InstallExtensionsAction, ListOutdatedExtensionsAction, ShowExtensionRecommendationsAction, ShowPopularExtensionsAction } from './extensionsActions';
import { ExtensionsInput } from './extensionsInput';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { ExtensionEditor } from './extensionEditor';
import { IQuickOpenRegistry, Extensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';

// Singletons
registerSingleton(IExtensionGalleryService, ExtensionGalleryService);
registerSingleton(IExtensionTipsService, ExtensionTipsService);
registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService);

// Workbench contributions
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ExtensionsWorkbenchExtension);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StatusUpdater);

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels)
	.registerChannel(ExtensionsChannelId, ExtensionsLabel);

// Quickopen
Registry.as<IQuickOpenRegistry>(Extensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen',
		'ExtensionsHandler',
		'ext ',
		localize('extensionsCommands', "Manage Extensions"),
		true
	)
);

Registry.as<IQuickOpenRegistry>(Extensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/extensions/electron-browser/extensionsQuickOpen',
		'GalleryExtensionsHandler',
		'ext install ',
		localize('galleryExtensionsCommands', "Install Gallery Extensions"),
		true
	)
);

// Editor
const editorDescriptor = new EditorDescriptor(
	ExtensionEditor.ID,
	localize('extension', "Extension"),
	'vs/workbench/parts/extensions/electron-browser/extensionEditor',
	'ExtensionEditor'
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(editorDescriptor, [new SyncDescriptor(ExtensionsInput)]);

// Viewlet
const viewletDescriptor = new ViewletDescriptor(
	'vs/workbench/parts/extensions/electron-browser/extensionsViewlet',
	'ExtensionsViewlet',
	VIEWLET_ID,
	localize('extensions', "Extensions"),
	'extensions',
	100
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);

// Global actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);

const openViewletActionDescriptor = new SyncActionDescriptor(OpenExtensionsViewletAction, OpenExtensionsViewletAction.ID, OpenExtensionsViewletAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_X });
actionRegistry.registerWorkbenchAction(openViewletActionDescriptor, 'View: Show Extensions', localize('view', "View"));

const installActionDescriptor = new SyncActionDescriptor(InstallExtensionsAction, InstallExtensionsAction.ID, InstallExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(installActionDescriptor, 'Extensions: Install', ExtensionsLabel);

const listOutdatedActionDescriptor = new SyncActionDescriptor(ListOutdatedExtensionsAction, ListOutdatedExtensionsAction.ID, ListOutdatedExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(listOutdatedActionDescriptor, 'Extensions: Show Outdated Extensions', ExtensionsLabel);

const recommendationsActionDescriptor = new SyncActionDescriptor(ShowExtensionRecommendationsAction, ShowExtensionRecommendationsAction.ID, ShowExtensionRecommendationsAction.LABEL);
actionRegistry.registerWorkbenchAction(recommendationsActionDescriptor, `Extensions: ${ ShowExtensionRecommendationsAction.LABEL }`, ExtensionsLabel);

const popularActionDescriptor = new SyncActionDescriptor(ShowPopularExtensionsAction, ShowPopularExtensionsAction.ID, ShowPopularExtensionsAction.LABEL);
actionRegistry.registerWorkbenchAction(popularActionDescriptor, `Extensions: ${ ShowPopularExtensionsAction.LABEL }`, ExtensionsLabel);
