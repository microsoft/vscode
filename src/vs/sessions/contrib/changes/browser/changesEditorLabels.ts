/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

export interface IChangesEditorLabels {
	readonly label: string;
	readonly description: string;
}

function getChangesEditorDescription(uri: URI, label: string, labelService: Pick<ILabelService, 'getUriLabel' | 'getSeparator'>): string {
	const fullLabel = labelService.getUriLabel(uri, { relative: true });
	const separator = labelService.getSeparator(uri.scheme, uri.authority);
	const lastSeparatorIndex = fullLabel.lastIndexOf(separator);

	if (lastSeparatorIndex < 0) {
		return fullLabel === label ? '' : fullLabel;
	}

	return fullLabel.slice(0, lastSeparatorIndex);
}

export function getChangesEditorLabels(uri: URI, labelService: Pick<ILabelService, 'getUriBasenameLabel' | 'getUriLabel' | 'getSeparator'>): IChangesEditorLabels {
	const label = labelService.getUriBasenameLabel(uri);
	return {
		label,
		description: getChangesEditorDescription(uri, label, labelService),
	};
}
