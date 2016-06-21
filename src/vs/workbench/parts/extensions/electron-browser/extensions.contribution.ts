/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensions';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionGalleryService, IExtensionTipsService, ExtensionsLabel, ExtensionsChannelId } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { ExtensionTipsService } from 'vs/workbench/parts/extensions/electron-browser/extensionTipsService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ExtensionsWorkbenchExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsWorkbenchExtension';
import { IOutputChannelRegistry, Extensions as OutputExtensions } from 'vs/workbench/parts/output/common/output';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/parts/editor/baseEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
// import { EditorInput } from 'vs/workbench/common/editor';
// import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';

// class ExtensionsInputFactory implements IEditorInputFactory {

// 	constructor() {}

// 	public serialize(editorInput: EditorInput): string {
// 		return '';
// 	}

// 	public deserialize(instantiationService: IInstantiationService, resourceRaw: string): EditorInput {
// 		return instantiationService.createInstance(ExtensionsInput);
// 	}
// }

registerSingleton(IExtensionGalleryService, ExtensionGalleryService);
registerSingleton(IExtensionTipsService, ExtensionTipsService);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ExtensionsWorkbenchExtension);

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels)
	.registerChannel(ExtensionsChannelId, ExtensionsLabel);

// Registry.as<IEditorRegistry>(EditorExtensions.Editors)
// 	.registerEditorInputFactory(ExtensionsInput.ID, ExtensionsInputFactory);

const editorDescriptor = new EditorDescriptor(
	'workbench.editor.extension',
	localize('extension', "Extension"),
	'vs/workbench/parts/extensions/electron-browser/extensionEditor',
	'ExtensionEditor'
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(editorDescriptor, [new SyncDescriptor(ExtensionsInput)]);

const viewletDescriptor = new ViewletDescriptor(
	'vs/workbench/parts/extensions/electron-browser/extensionsViewlet',
	'ExtensionsViewlet',
	'workbench.viewlet.extensions',
	localize('extensions', "Extensions"),
	'extensions',
	100,
	true
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);
