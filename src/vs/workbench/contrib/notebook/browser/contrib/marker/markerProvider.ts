/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IMarkerListProvider, MarkerList, IMarkerNavigationService } from 'vs/editor/contrib/gotoError/browser/markerNavigationService';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markerDecorations';
import { INotebookDeltaDecoration, INotebookEditor, INotebookEditorContribution, NotebookOverviewRulerLane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { throttle } from 'vs/base/common/decorators';
import { editorErrorForeground, editorWarningForeground } from 'vs/platform/theme/common/colorRegistry';

class MarkerListProvider implements IMarkerListProvider {

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
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService
	) {
		super();

		this._update();
		this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
		this._register(this._markerDecorationsService.onDidChangeMarker(e => {
			const data = CellUri.parse(e.uri);
			if (!data) {
				return;
			}
			if (data.notebook.toString() === this._notebookEditor.textModel?.uri.toString()) {
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
			const liveMarkers = this._markerDecorationsService.getLiveMarkers(cell.uri);
			for (const [range, marker] of liveMarkers) {
				if (marker.severity === MarkerSeverity.Error) {
					cellDecorations.push({
						handle: cell.handle,
						options: {
							overviewRuler: {
								color: editorErrorForeground,
								modelRanges: [range],
								includeOutput: false,
								position: NotebookOverviewRulerLane.Right
							}
						}
					});
				} else if (marker.severity === MarkerSeverity.Warning) {
					cellDecorations.push({
						handle: cell.handle,
						options: {
							overviewRuler: {
								color: editorWarningForeground,
								modelRanges: [range],
								includeOutput: false,
								position: NotebookOverviewRulerLane.Right
							}
						}
					});
				}
			}
		});

		this._markersOverviewRulerDecorations = this._notebookEditor.deltaCellDecorations(this._markersOverviewRulerDecorations, cellDecorations);
	}
}

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MarkerListProvider, LifecyclePhase.Ready);

registerNotebookContribution(NotebookMarkerDecorationContribution.id, NotebookMarkerDecorationContribution);
