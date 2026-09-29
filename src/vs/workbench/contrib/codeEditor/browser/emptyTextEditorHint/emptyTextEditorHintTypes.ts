/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';

export const EmptyTextEditorHintContributionId = 'editor.contrib.emptyTextEditorHint';

export interface IEmptyTextEditorHintContribution extends IEditorContribution {
	disposeHint(): void;
}
