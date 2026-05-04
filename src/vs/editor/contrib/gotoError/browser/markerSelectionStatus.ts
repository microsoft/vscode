/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { Range } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';

class MarkerSelectionStatus extends Disposable implements IEditorContribution {

	static readonly ID = 'editor.contrib.markerSelectionStatus';

	private readonly _ctxHasDiagnostics: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMarkerService private readonly _markerService: IMarkerService,
	) {
		super();

		this._ctxHasDiagnostics = EditorContextKeys.selectionHasDiagnostics.bindTo(contextKeyService);

		this._store.add(this._editor.onDidChangeCursorSelection(() => this._update()));
		this._store.add(this._editor.onDidChangeModel(() => this._update()));
		this._store.add(this._markerService.onMarkerChanged(e => {
			const model = this._editor.getModel();
			if (model && e.some(uri => isEqual(uri, model.uri))) {
				this._update();
			}
		}));

		this._update();
	}

	override dispose(): void {
		this._ctxHasDiagnostics.reset();
		super.dispose();
	}

	private _update(): void {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (!model || !selection) {
			this._ctxHasDiagnostics.reset();
			return;
		}

		const markers = this._markerService.read({
			resource: model.uri,
			severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
		});

		const hasIntersecting = markers.some(marker => Range.areIntersecting(
			{ startLineNumber: marker.startLineNumber, startColumn: marker.startColumn, endLineNumber: marker.endLineNumber, endColumn: marker.endColumn },
			selection
		));

		this._ctxHasDiagnostics.set(hasIntersecting);
	}
}

registerEditorContribution(MarkerSelectionStatus.ID, MarkerSelectionStatus, EditorContributionInstantiation.AfterFirstRender);
