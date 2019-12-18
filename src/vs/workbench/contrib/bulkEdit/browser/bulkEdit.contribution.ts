/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceEdit } from 'vs/editor/common/modes';
import { BulkEditPanel } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPanel';
import { Extensions as PanelExtensions, PanelDescriptor, PanelRegistry } from 'vs/workbench/browser/panel';
import { localize } from 'vs/nls';

class BulkEditPreviewContribution {

	constructor(
		@IPanelService private _panelService: IPanelService,
		@IBulkEditService bulkEditService: IBulkEditService,
	) {

		bulkEditService.setPreviewHandler(edit => this._previewEdit(edit));
	}

	private async _previewEdit(edit: WorkspaceEdit) {

		const panel = this._panelService.openPanel(BulkEditPanel.ID, true);
		if (!(panel instanceof BulkEditPanel)) {
			// error?
			return edit;
		}

		const apply = await panel.setInput(edit);
		if (!apply) {
			return { edits: [] };
		}
		// todo@joh get 'real' edit
		return edit;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	BulkEditPreviewContribution, LifecyclePhase.Ready
);

Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(PanelDescriptor.create(
	BulkEditPanel,
	BulkEditPanel.ID,
	localize('panel', "Refactor Preview"),
	'bulkEditPanel',
	10
));
