/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/htmlPreviewPart';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { HtmlInput, HtmlInputOptions } from '../common/htmlInput';
import { HtmlPreviewPart } from 'vs/workbench/parts/html/browser/htmlPreviewPart';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { MenuRegistry } from "vs/platform/actions/common/actions";
import { WebviewElement } from "vs/workbench/parts/html/browser/webview";
import { IExtensionsWorkbenchService } from "vs/workbench/parts/extensions/common/extensions";

function getActivePreviewsForResource(accessor: ServicesAccessor, resource: URI | string) {
	const uri = resource instanceof URI ? resource : URI.parse(resource);
	return accessor.get(IWorkbenchEditorService).getVisibleEditors()
		.filter(c => c instanceof HtmlPreviewPart && c.model)
		.map(e => e as HtmlPreviewPart)
		.filter(e => e.model.uri.scheme === uri.scheme && e.model.uri.fsPath === uri.fsPath);
}

// --- Register Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(HtmlPreviewPart.ID,
	localize('html.editor.label', "Html Preview"),
	'vs/workbench/parts/html/browser/htmlPreviewPart',
	'HtmlPreviewPart'),
	[new SyncDescriptor(HtmlInput)]);

// --- Register Commands

const defaultPreviewHtmlOptions: HtmlInputOptions = {
	allowScripts: true,
	allowSvgs: true
};

CommandsRegistry.registerCommand('_workbench.previewHtml', function (
	accessor: ServicesAccessor,
	resource: URI | string,
	position?: EditorPosition,
	label?: string,
	options?: HtmlInputOptions
) {
	const uri = resource instanceof URI ? resource : URI.parse(resource);
	label = label || uri.fsPath;

	let input: HtmlInput;

	// Find already opened HTML input if any
	const stacks = accessor.get(IEditorGroupService).getStacksModel();
	const targetGroup = stacks.groupAt(position) || stacks.activeGroup;
	if (targetGroup) {
		const existingInput = targetGroup.getEditor(uri);
		if (existingInput instanceof HtmlInput) {
			input = existingInput;
		}
	}

	const inputOptions = (Object as any).assign({}, options || defaultPreviewHtmlOptions);
	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	inputOptions.svgWhiteList = extensionsWorkbenchService.allowedBadgeProviders;

	// Otherwise, create new input and open it
	if (!input) {
		input = accessor.get(IInstantiationService).createInstance(HtmlInput, label, '', uri, inputOptions);
	} else {
		input.setName(label); // make sure to use passed in label
	}

	return accessor.get(IWorkbenchEditorService)
		.openEditor(input, { pinned: true }, position)
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

CommandsRegistry.registerCommand('_workbench.htmlPreview.updateOptions', function (
	accessor: ServicesAccessor,
	resource: URI | string,
	options: HtmlInputOptions
) {

	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	const inputOptions: HtmlInputOptions = options;
	const allowedBadgeProviders = extensionsWorkbenchService.allowedBadgeProviders;
	inputOptions.svgWhiteList = allowedBadgeProviders;

	const uri = resource instanceof URI ? resource : URI.parse(resource);
	const activePreviews = getActivePreviewsForResource(accessor, resource);
	for (const preview of activePreviews) {
		if (preview.input && preview.input instanceof HtmlInput) {
			const input = accessor.get(IInstantiationService).createInstance(HtmlInput, preview.input.getName(), '', uri, options);
			preview.setInput(input);
		}
	}
});

CommandsRegistry.registerCommand('_webview.openDevTools', function () {
	const elements = document.querySelectorAll('webview.ready');
	for (let i = 0; i < elements.length; i++) {
		try {
			(elements.item(i) as WebviewElement).openDevTools();
		} catch (e) {
			console.error(e);
		}
	}
});

MenuRegistry.addCommand({
	id: '_webview.openDevTools',
	title: localize('devtools.webview', "Developer: Webview Tools")
});
