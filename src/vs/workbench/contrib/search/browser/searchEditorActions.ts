/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { isDiffEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SearchEditor } from 'vs/workbench/contrib/search/browser/searchEditor';
import { getOrMakeSearchEditorInput, SearchEditorInput } from 'vs/workbench/contrib/search/browser/searchEditorInput';
import { serializeSearchResultForEditor } from 'vs/workbench/contrib/search/browser/searchEditorSerialization';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';


export const openNewSearchEditor =
	async (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const instantiationService = accessor.get(IInstantiationService);

		const activeEditor = editorService.activeTextEditorWidget;
		let activeModel: ICodeEditor | undefined;
		let selected = '';
		if (activeEditor) {
			if (isDiffEditor(activeEditor)) {
				if (activeEditor.getOriginalEditor().hasTextFocus()) {
					activeModel = activeEditor.getOriginalEditor();
				} else {
					activeModel = activeEditor.getModifiedEditor();
				}
			} else {
				activeModel = activeEditor as ICodeEditor;
			}
			const selection = activeModel?.getSelection();
			selected = (selection && activeModel?.getModel()?.getValueInRange(selection)) ?? '';
		} else {
			if (editorService.activeEditor instanceof SearchEditorInput) {
				const active = editorService.activeControl as SearchEditor;
				selected = active.getSelected();
			}
		}

		telemetryService.publicLog2('searchEditor/openNewSearchEditor');

		const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { config: { query: selected } });
		await editorService.openEditor(input, { pinned: true });
	};

export const createEditorFromSearchResult =
	async (accessor: ServicesAccessor, searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string) => {
		if (!searchResult.query) {
			console.error('Expected searchResult.query to be defined. Got', searchResult);
			return;
		}

		const editorService = accessor.get(IEditorService);
		const telemetryService = accessor.get(ITelemetryService);
		const instantiationService = accessor.get(IInstantiationService);
		const labelService = accessor.get(ILabelService);


		telemetryService.publicLog2('searchEditor/createEditorFromSearchResult');

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const { text, matchRanges } = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, 0, labelFormatter, true);

		const input = instantiationService.invokeFunction(getOrMakeSearchEditorInput, { text });
		const editor = await editorService.openEditor(input, { pinned: true }) as SearchEditor;
		const model = assertIsDefined(editor.getModel());
		model.deltaDecorations([], matchRanges.map(range => ({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
	};
