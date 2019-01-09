/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkersModel, compareMarkersByUri, Marker } from './markersModel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkerService, MarkerSeverity, IMarker, IMarkerData } from 'vs/platform/markers/common/markers';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { localize } from 'vs/nls';
import Constants from './constants';
import { URI } from 'vs/base/common/uri';
import { groupBy } from 'vs/base/common/arrays';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IAction, Action } from 'vs/base/common/actions';
import { applyCodeAction } from 'vs/editor/contrib/codeAction/codeActionCommands';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IEditorService, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeAction } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { getCodeActions } from 'vs/editor/contrib/codeAction/codeAction';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/codeActionTrigger';
import { timeout } from 'vs/base/common/async';

export const IMarkersWorkbenchService = createDecorator<IMarkersWorkbenchService>('markersWorkbenchService');

export interface IFilter {
	filterText: string;
	useFilesExclude: boolean;
}

export interface IMarkersWorkbenchService {
	_serviceBrand: any;
	readonly markersModel: MarkersModel;
	hasQuickFixes(marker: Marker): Promise<boolean>;
	getQuickFixActions(marker: Marker): Promise<IAction[]>;
}

export class MarkersWorkbenchService extends Disposable implements IMarkersWorkbenchService {
	_serviceBrand: any;

	readonly markersModel: MarkersModel;

	private readonly allFixesCache: Map<string, Promise<CodeAction[]>> = new Map<string, Promise<CodeAction[]>>();
	private readonly codeActionsPromises: Map<string, Map<string, Promise<CodeAction[]>>> = new Map<string, Map<string, Promise<CodeAction[]>>>();
	private readonly codeActions: Map<string, Map<string, CodeAction[]>> = new Map<string, Map<string, CodeAction[]>>();

	constructor(
		@IMarkerService private readonly markerService: IMarkerService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
		this.markersModel = this._register(instantiationService.createInstance(MarkersModel, this.readMarkers()));

		for (const group of groupBy(this.readMarkers(), compareMarkersByUri)) {
			this.markersModel.setResourceMarkers(group[0].resource, group);
		}

		this._register(markerService.onMarkerChanged(resources => this.onMarkerChanged(resources)));
	}

	private onMarkerChanged(resources: URI[]): void {
		for (const resource of resources) {
			this.allFixesCache.delete(resource.toString());
			this.codeActionsPromises.delete(resource.toString());
			this.codeActions.delete(resource.toString());
			this.markersModel.setResourceMarkers(resource, this.readMarkers(resource));
		}
	}

	private readMarkers(resource?: URI): IMarker[] {
		return this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
	}

	getQuickFixActions(marker: Marker): Promise<IAction[]> {
		const markerKey = IMarkerData.makeKey(marker.marker);
		let codeActionsPerMarker = this.codeActions.get(marker.resource.toString());
		if (!codeActionsPerMarker) {
			codeActionsPerMarker = new Map<string, CodeAction[]>();
			this.codeActions.set(marker.resource.toString(), codeActionsPerMarker);
		}
		const codeActions = codeActionsPerMarker.get(markerKey);
		if (codeActions) {
			return Promise.resolve(this.toActions(codeActions, marker));
		} else {
			let codeActionsPromisesPerMarker = this.codeActionsPromises.get(marker.resource.toString());
			if (!codeActionsPromisesPerMarker) {
				codeActionsPromisesPerMarker = new Map<string, Promise<CodeAction[]>>();
				this.codeActionsPromises.set(marker.resource.toString(), codeActionsPromisesPerMarker);
			}
			if (!codeActionsPromisesPerMarker.has(markerKey)) {
				const codeActionsPromise = this.getFixes(marker);
				codeActionsPromisesPerMarker.set(markerKey, codeActionsPromise);
				codeActionsPromise.then(codeActions => codeActionsPerMarker!.set(markerKey, codeActions));
			}
			// Wait for 100ms for code actions fetching.
			return timeout(100).then(() => this.toActions(codeActionsPerMarker!.get(markerKey) || [], marker));
		}
	}

	private toActions(codeActions: CodeAction[], marker: Marker): IAction[] {
		return codeActions.map(codeAction => new Action(
			codeAction.command ? codeAction.command.id : codeAction.title,
			codeAction.title,
			undefined,
			true,
			() => {
				return this.openFileAtMarker(marker)
					.then(() => applyCodeAction(codeAction, this.bulkEditService, this.commandService));
			}));
	}

	async hasQuickFixes(marker: Marker): Promise<boolean> {
		if (!this.modelService.getModel(marker.resource)) {
			// Return early, If the model is not yet created
			return false;
		}
		let allFixesPromise = this.allFixesCache.get(marker.resource.toString());
		if (!allFixesPromise) {
			allFixesPromise = this._getFixes(marker.resource);
			this.allFixesCache.set(marker.resource.toString(), allFixesPromise);
		}
		const allFixes = await allFixesPromise;
		if (allFixes.length) {
			const markerKey = IMarkerData.makeKey(marker.marker);
			for (const fix of allFixes) {
				if (fix.diagnostics && fix.diagnostics.some(d => IMarkerData.makeKey(d) === markerKey)) {
					return true;
				}
			}
		}
		return false;
	}

	private openFileAtMarker(element: Marker): Promise<void> {
		const { resource, selection } = { resource: element.resource, selection: element.range };
		return this.editorService.openEditor({
			resource,
			options: {
				selection,
				preserveFocus: true,
				pinned: false,
				revealIfVisible: true
			},
		}, ACTIVE_GROUP).then(() => undefined);
	}

	private getFixes(marker: Marker): Promise<CodeAction[]> {
		return this._getFixes(marker.resource, new Range(marker.range.startLineNumber, marker.range.startColumn, marker.range.endLineNumber, marker.range.endColumn));
	}

	private async _getFixes(uri: URI, range?: Range): Promise<CodeAction[]> {
		const model = this.modelService.getModel(uri);
		if (model) {
			const codeActions = await getCodeActions(model, range ? range : model.getFullModelRange(), { type: 'manual', filter: { kind: CodeActionKind.QuickFix } });
			return codeActions;
		}
		return [];
	}

}

export class ActivityUpdater extends Disposable implements IWorkbenchContribution {

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IMarkersWorkbenchService private readonly markersWorkbenchService: IMarkersWorkbenchService
	) {
		super();
		this._register(this.markersWorkbenchService.markersModel.onDidChange(() => this.updateBadge()));
		this.updateBadge();
	}

	private updateBadge(): void {
		const total = this.markersWorkbenchService.markersModel.resourceMarkers.reduce((r, rm) => r + rm.markers.length, 0);
		const message = localize('totalProblems', 'Total {0} Problems', total);
		this.activityService.showActivity(Constants.MARKERS_PANEL_ID, new NumberBadge(total, () => message));
	}
}