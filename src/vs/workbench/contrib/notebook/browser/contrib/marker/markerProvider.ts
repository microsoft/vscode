/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { IMarkerListProvider, MarkerList, IMarkerNavigationService } from '../../../../../../editor/contrib/gotoError/browser/markerNavigationService.js';
import { CellUri } from '../../../common/notebookCommon.js';
import { IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { throttle } from '../../../../../../base/common/decorators.js';
import { editorErrorForeground, editorWarningForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { isEqual } from '../../../../../../base/common/resources.js';

class MarkerListProvider implements IMarkerListProvider {

	static readonly ID = 'workbench.contrib.markerListProvider';

	private readonly _dispoables: IDisposable;

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@IMarkerNavigationService markerNavigation: IMarkerNavigationService,
		@IConfigurationService private readonly _configService: IConfigurationService
	) {
		this._dispoables = markerNavigation.registerProvider(this);
	}

	dispose() {
		this._dispoables.dispose();
	}

	getMarkerList(resource: URI | undefined): MarkerList | undefined {
		if (!resource) {
			return undefined;
		}
		const data = CellUri.parse(resource);
		if (!data) {
			return undefined;
		}
		return new MarkerList(uri => {
			const otherData = CellUri.parse(uri);
			return otherData?.notebook.toString() === data.notebook.toString();
		}, this._markerService, this._configService);
	}
}

class NotebookMarkerDecorationContribution extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.markerDecoration';
	private _markersOverviewRulerDecorations: string[] = [];
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IMarkerService private readonly _markerService: IMarkerService
	) {
		super();

		this._update();
		this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
		this._register(this._markerService.onMarkerChanged(e => {
			if (e.some(uri => this._notebookEditor.getCellsInRange().some(cell => isEqual(cell.uri, uri)))) {
				this._update();
			}
		}));
	}

	@throttle(100)
	private _update() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const cellDecorations: INotebookDeltaDecoration[] = [];
		this._notebookEditor.getCellsInRange().forEach(cell => {
			const marker = this._markerService.read({ resource: cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
			marker.forEach(m => {
				const color = m.severity === MarkerSeverity.Error ? editorErrorForeground : editorWarningForeground;
				const range = { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn };
				cellDecorations.push({
					handle: cell.handle,
					options: {
						overviewRuler: {
							color: color,
							modelRanges: [range],
							includeOutput: false,
							position: NotebookOverviewRulerLane.Right
						}
					}
				});
			});
		});

		this._markersOverviewRulerDecorations = this._notebookEditor.deltaCellDecorations(this._markersOverviewRulerDecorations, cellDecorations);
	}
}

registerWorkbenchContribution2(MarkerListProvider.ID, MarkerListProvider, WorkbenchPhase.BlockRestore);

registerNotebookContribution(NotebookMarkerDecorationContribution.id, NotebookMarkerDecorationContribution);
