/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/shared/editor';
import { HtmlInput, HtmlInputOptions } from '../common/htmlInput';
import { HtmlPreviewPart } from './htmlPreviewPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupsService, IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { registerWebViewCommands } from 'vs/workbench/parts/webview/electron-browser/webview.contribution';

function getActivePreviewsForResource(accessor: ServicesAccessor, resource: URI | string) {
	const uri = resource instanceof URI ? resource : URI.parse(resource);
	return accessor.get(IEditorService).visibleControls
		.filter(c => c instanceof HtmlPreviewPart && c.model)
		.map(e => e as HtmlPreviewPart)
		.filter(e => e.model.uri.scheme === uri.scheme && e.model.uri.toString() === uri.toString());
}

// --- Register Editor

(Registry.as<IEditorRegistry>(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	HtmlPreviewPart,
	HtmlPreviewPart.ID,
	localize('html.editor.label', "Html Preview")),
	[new SyncDescriptor(HtmlInput)]);

// --- Register Commands

CommandsRegistry.registerCommand('_workbench.previewHtml', function (
	accessor: ServicesAccessor,
	resource: URI | string,
	position?: EditorViewColumn,
	label?: string
) {
	const uri = resource instanceof URI ? resource : URI.parse(resource);
	label = label || uri.fsPath;

	let input: HtmlInput;

	const editorGroupService = accessor.get(IEditorGroupsService);

	let targetGroup: IEditorGroup = editorGroupService.getGroup(viewColumnToEditorGroup(editorGroupService, position));
	if (!targetGroup) {
		targetGroup = editorGroupService.activeGroup;
	}

	// Find already opened HTML input if any
	if (targetGroup) {
		const editors = targetGroup.editors;
		for (const editor of editors) {
			const editorResource = editor.getResource();
			if (editor instanceof HtmlInput && editorResource && editorResource.toString() === resource.toString()) {
				input = editor;
				break;
			}
		}
	}

	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);

	const inputOptions: HtmlInputOptions = {
		allowScripts: true,
		allowSvgs: true,
		svgWhiteList: extensionsWorkbenchService.allowedBadgeProviders
	};

	// Otherwise, create new input and open it
	if (!input) {
		input = accessor.get(IInstantiationService).createInstance(HtmlInput, label, '', uri, inputOptions);
	} else {
		input.setName(label); // make sure to use passed in label
	}

	return accessor.get(IEditorService)
		.openEditor(input, { pinned: true }, viewColumnToEditorGroup(editorGroupService, position))
		.then(editor => true);
});

CommandsRegistry.registerCommand('_workbench.htmlPreview.postMessage', function (
	accessor: ServicesAccessor,
	resource: URI | string,
	message: any
) {
	const activePreviews = getActivePreviewsForResource(accessor, resource);
	for (const preview of activePreviews) {
		preview.sendMessage(message);
	}
	return activePreviews.length > 0;
});

registerWebViewCommands(HtmlPreviewPart.ID);