/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { IAction, Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { clipboard } from 'electron';
import { Marker } from 'vs/workbench/parts/markers/common/markersModel';
import Constants  from 'vs/workbench/parts/markers/common/constants';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Severity from 'vs/base/common/severity';


class CopyMarker extends Action {

	public static ID = Constants.MARKER_COPY_ACTION_ID;

	constructor(@IWorkspaceContextService private contextService: IWorkspaceContextService,) {
		super(CopyMarker.ID, localize('copyMarker', "Copy"));
	}

	public run(context): TPromise<any> {
		if (context.element) {
			const marker = <Marker>context.element;
			clipboard.writeText(`${this.printFormat(marker)}`);
		}
		return TPromise.as(true);
	}

	private printFormat(marker: Marker): string {
		return [`file: '${marker.marker.resource}'`,
				`severity: '${Severity.toString(marker.marker.severity)}'`,
				`message: '${marker.marker.message}'`,
				`at: '${marker.marker.startLineNumber},${marker.marker.startColumn}'`,
				`source: '${marker.marker.source ? marker.marker.source : ''}'`].join('\n');
	}
}

class MarkersViewerActionContributor extends ActionBarContributor {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasSecondaryActions(context: any): boolean {
		const element = context.element;
		return element instanceof Marker;
	}

	public getSecondaryActions(context: any): IAction[] {
		const actions: IAction[] = [];
		if (this.hasSecondaryActions(context)) {
			actions.push(this.instantiationService.createInstance(CopyMarker));
		}

		return actions;
	}
}

export function registerContributions(): void {
	const actionsRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
	actionsRegistry.registerActionBarContributor(Scope.VIEWER, MarkersViewerActionContributor);
}