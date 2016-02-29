/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import URI from 'vs/base/common/uri';
import {IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput} from 'vs/workbench/common/editor';
import {MarkdownEditorInput} from 'vs/workbench/parts/markdown/common/markdownEditorInput';
import {MarkdownFileTracker} from 'vs/workbench/parts/markdown/browser/markdownExtension';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

// Register Editor Input Factory
class MarkdownInputFactory implements IEditorInputFactory {

	constructor() {}

	public serialize(editorInput: EditorInput): string {
		let markdownInput = <MarkdownEditorInput>editorInput;

		return markdownInput.getResource().toString();
	}

	public deserialize(instantiationService: IInstantiationService, resourceRaw: string): EditorInput {
		return instantiationService.createInstance(MarkdownEditorInput, URI.parse(resourceRaw), void 0, void 0);
	}
}

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditorInputFactory(MarkdownEditorInput.ID, MarkdownInputFactory);

// Register Markdown File Tracker
(<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	MarkdownFileTracker
);