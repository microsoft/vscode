/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

export interface IChangesEditorLabels {
	readonly label: string;
	readonly description: string;
}

export function getChangesEditorLabels(uri: URI, labelService: Pick<ILabelService, 'getUriBasenameLabel' | 'getUriLabel'>): IChangesEditorLabels {
	return {
		label: labelService.getUriBasenameLabel(uri),
		description: labelService.getUriLabel(dirname(uri), { relative: true }),
	};
}
