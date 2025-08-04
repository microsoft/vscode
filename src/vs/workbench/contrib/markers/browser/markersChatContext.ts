/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { groupBy } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extUri } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, IChatContextPicker } from '../../chat/browser/chatContextPickService.js';
import { IDiagnosticVariableEntryFilterData } from '../../chat/common/chatVariableEntries.js';

class MarkerChatContextPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.diagnstic', 'Problems...');
	readonly icon = Codicon.error;
	readonly ordinal = -100;

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	asPicker(): IChatContextPicker {

		const markers = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
		const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));

		const severities = new Set<MarkerSeverity>();
		const items: (IChatContextPickerPickItem | IQuickPickSeparator)[] = [];

		let pickCount = 0;
		for (const group of grouped) {
			const resource = group[0].resource;

			items.push({ type: 'separator', label: this._labelService.getUriLabel(resource, { relative: true }) });
			for (const marker of group) {
				pickCount++;
				severities.add(marker.severity);

				items.push({
					label: marker.message,
					description: localize('markers.panel.at.ln.col.number', "[Ln {0}, Col {1}]", '' + marker.startLineNumber, '' + marker.startColumn),
					asAttachment() {
						return IDiagnosticVariableEntryFilterData.toEntry(IDiagnosticVariableEntryFilterData.fromMarker(marker));
					}
				});
			}
		}

		items.unshift({
			label: localize('markers.panel.allErrors', 'All Problems'),
			asAttachment() {
				return IDiagnosticVariableEntryFilterData.toEntry({
					filterSeverity: MarkerSeverity.Info
				});
			},
		});


		return {
			placeholder: localize('chatContext.diagnstic.placeholder', 'Select a problem to attach'),
			picks: Promise.resolve(items)
		};
	}
}


export class MarkerChatContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.markerChatContextContribution';

	constructor(
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(MarkerChatContextPick)));
	}
}
