/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IInstantiationService, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {HtmlInput} from '../common/htmlInput';
import {HtmlPreviewPart} from 'vs/workbench/parts/html/browser/htmlPreviewPart';
import {Registry} from 'vs/platform/platform';
import {EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions} from 'vs/workbench/browser/parts/editor/baseEditor';


import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

// --- Register Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(HtmlPreviewPart.ID,
	localize('html.editor.label', "Html Preview"),
	'vs/workbench/parts/html/browser/htmlPreviewPart',
	'HtmlPreviewPart'),
	[new SyncDescriptor(HtmlInput)]);

// --- Register Commands

KeybindingsRegistry.registerCommandDesc({
	id: '_workbench.previewHtml',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor, args: [URI, EditorPosition]) {

		let [resource, position] = args;
		let name = resource.fsPath;
		let input = accessor.get(IInstantiationService).createInstance(HtmlInput, name, undefined, resource);

		return accessor.get(IWorkbenchEditorService).openEditor(input, null, position)
			.then(editor => true);
	},
	context: undefined,
	primary: undefined
});
