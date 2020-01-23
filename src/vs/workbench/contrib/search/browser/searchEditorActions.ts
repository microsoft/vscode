/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { isDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SearchEditor } from 'vs/workbench/contrib/search/browser/searchEditor';
import { getOrMakeSearchEditorInput } from 'vs/workbench/contrib/search/browser/searchEditorInput';
import { serializeSearchResultForEditor, serializeSearchConfiguration } from 'vs/workbench/contrib/search/browser/searchEditorSerialization';

export const openNewSearchEditor =
	async (editorService: IEditorService, instantiationService: IInstantiationService) => {
		const activeEditor = editorService.activeTextEditorWidget;
		let activeModel: ICodeEditor | undefined;
		if (isDiffEditor(activeEditor)) {
			if (activeEditor.getOriginalEditor().hasTextFocus()) {
				activeModel = activeEditor.getOriginalEditor();
			} else {
				activeModel = activeEditor.getModifiedEditor();
			}
		} else {
			activeModel = activeEditor as ICodeEditor | undefined;
		}
		const selection = activeModel?.getSelection();
		let selected = (selection && activeModel?.getModel()?.getValueInRange(selection)) ?? '';


		const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { text: serializeSearchConfiguration({ query: selected }) });
		await editorService.openEditor(input, { pinned: true });
	};

export const createEditorFromSearchResult =
	async (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelService: ILabelService, editorService: IEditorService, instantiationService: IInstantiationService) => {
		if (!searchResult.query) {
			console.error('Expected searchResult.query to be defined. Got', searchResult);
			return;
		}

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const { text, matchRanges } = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, true);

		const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { text });
		const editor = await editorService.openEditor(input, { pinned: true }) as SearchEditor;
		const model = assertIsDefined(editor.getModel());
		model.deltaDecorations([], matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	};
