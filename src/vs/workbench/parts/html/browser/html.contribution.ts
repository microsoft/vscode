/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';
import {IInstantiationService, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import URI from 'vs/base/common/uri';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {HtmlInput} from '../common/htmlInput';
import {HtmlPreviewPart} from 'vs/workbench/parts/html/browser/htmlPreviewPart';
import {Registry} from 'vs/platform/platform';
import {EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IEditorRegistry, Extensions as EditorExtensions} from 'vs/workbench/common/editor';
import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

// --- Register Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(HtmlPreviewPart.ID,
	localize('html.editor.label', "Html Preview"),
	'vs/workbench/parts/html/browser/htmlPreviewPart',
	'HtmlPreviewPart'),
	[new SyncDescriptor(HtmlInput)]);

// --- Register Commands

CommandsRegistry.registerCommand('_workbench.previewHtml', function (accessor: ServicesAccessor, resource: URI | string, position?: EditorPosition, label?: string) {

	let uri = resource instanceof URI ? resource : URI.parse(resource);
	label = label || uri.fsPath;
	let input = accessor.get(IInstantiationService).createInstance(HtmlInput, label, '', uri);

	return accessor.get(IWorkbenchEditorService)
		.openEditor(input, { pinned: true }, position)
		.then(editor => true);
});
