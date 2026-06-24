/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { groupBy } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extUri } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, IChatContextPicker, picksWithPromiseFn } from '../../chat/browser/attachments/chatContextPickService.js';
import { IDiagnosticVariableEntryFilterData } from '../../chat/common/attachments/chatVariableEntries.js';
import { IChatWidget } from '../../chat/browser/chat.js';

class MarkerChatContextPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.diagnstic', 'Problems...');
	readonly icon = Codicon.error;
	readonly ordinal = -100;

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@ILabelService private readonly _labelService: ILabelService,
		@IEditorService private readonly _editorService: IEditorService,
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		return !!widget.attachmentCapabilities.supportsProblemAttachments;
	}
	asPicker(): IChatContextPicker {
		return {
			placeholder: localize('chatContext.diagnstic.placeholder', 'Select a problem to attach'),
			picks: picksWithPromiseFn(async (query: string, token: CancellationToken) => {
				return this.getPicksForQuery(query);
			})
		};
	}

	/**
	 * @internal For testing purposes only
	 */
	getPicksForQuery(query: string): (IChatContextPickerPickItem | IQuickPickSeparator)[] {
		const markers = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
		const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));

		// Get the active editor URI for prioritization
		const activeEditorUri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor);

		// Sort groups to prioritize active file
		const sortedGroups = grouped.sort((groupA, groupB) => {
			const resourceA = groupA[0].resource;
			const resourceB = groupB[0].resource;

			// If one group is from the active file, prioritize it
			if (activeEditorUri) {
				const isAActiveFile = extUri.isEqual(resourceA, activeEditorUri);
				const isBActiveFile = extUri.isEqual(resourceB, activeEditorUri);

				if (isAActiveFile && !isBActiveFile) {
					return -1; // A comes first
				}
				if (!isAActiveFile && isBActiveFile) {
					return 1; // B comes first
				}
			}

			// Otherwise, sort by resource URI as before
			return extUri.compare(resourceA, resourceB);
		});

		const severities = new Set<MarkerSeverity>();
		const items: (IChatContextPickerPickItem | IQuickPickSeparator)[] = [];

		let pickCount = 0;
		for (const group of sortedGroups) {
			const resource = group[0].resource;
			const isActiveFile = activeEditorUri && extUri.isEqual(resource, activeEditorUri);
			const fileLabel = this._labelService.getUriLabel(resource, { relative: true });
			const separatorLabel = isActiveFile ? `${fileLabel} (current file)` : fileLabel;

			items.push({ type: 'separator', label: separatorLabel });
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

		return items;
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
