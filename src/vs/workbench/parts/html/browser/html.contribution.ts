/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { HtmlInput } from '../common/htmlInput';
import { HtmlPreviewPart } from 'vs/workbench/parts/html/browser/htmlPreviewPart';
import { Registry } from 'vs/platform/platform';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { isCommonCodeEditor, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { HtmlZoneController } from './htmlEditorZone';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

// --- Register Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(HtmlPreviewPart.ID,
	localize('html.editor.label', "Html Preview"),
	'vs/workbench/parts/html/browser/htmlPreviewPart',
	'HtmlPreviewPart'),
	[new SyncDescriptor(HtmlInput)]);

// --- Register Commands

interface HtmlZoneParams {
	editorPosition: EditorPosition;
	lineNumber: number;
	resource: URI;
}

let warn = true;

CommandsRegistry.registerCommand('_workbench.htmlZone', function (accessor: ServicesAccessor, params: HtmlZoneParams) {

	if (warn) {
		console.warn(`'_workbench.htmlZone' is an EXPERIMENTAL feature and therefore subject to CHANGE and REMOVAL without notice.`);
		warn = false;
	}

	let codeEditor: ICommonCodeEditor;
	for (const editor of accessor.get(IWorkbenchEditorService).getVisibleEditors()) {
		if (editor.position === params.editorPosition) {
			const control = editor.getControl();
			if (isCommonCodeEditor(control)) {
				codeEditor = control;
			}
		}
	}

	if (!codeEditor) {
		console.warn('NO matching editor found');
		return undefined;
	}

	const textModelResolverService = accessor.get(ITextModelResolverService);

	return textModelResolverService.createModelReference(params.resource).then(ref => {
		const model = ref.object;
		const contents = model.textEditorModel.getValue();
		ref.dispose();

		HtmlZoneController.getInstance(codeEditor).addZone(params.lineNumber, contents);
	});

});

CommandsRegistry.registerCommand('_workbench.previewHtml', function (accessor: ServicesAccessor, resource: URI | string, position?: EditorPosition, label?: string) {

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

	// Otherwise, create new input and open it
	if (!input) {
		input = accessor.get(IInstantiationService).createInstance(HtmlInput, label, '', uri);
	} else {
		input.setName(label); // make sure to use passed in label
	}

	return accessor.get(IWorkbenchEditorService)
		.openEditor(input, { pinned: true }, position)
		.then(editor => true);
});

CommandsRegistry.registerCommand('_workbench.htmlPreview.postMessage', (accessor: ServicesAccessor, resource: URI | string, message: any) => {
	const uri = resource instanceof URI ? resource : URI.parse(resource);
	const activePreviews = accessor.get(IWorkbenchEditorService).getVisibleEditors()
		.filter(c => c instanceof HtmlPreviewPart)
		.map(e => e as HtmlPreviewPart)
		.filter(e => e.model.uri.scheme === uri.scheme && e.model.uri.fsPath === uri.fsPath);
	for (const preview of activePreviews) {
		preview.sendMessage(message);
	}
	return activePreviews.length > 0;
});
