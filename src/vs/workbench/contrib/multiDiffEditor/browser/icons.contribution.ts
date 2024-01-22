/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const MultiDiffEditorIcon = registerIcon('multi-diff-editor-label-icon', Codicon.diffMultiple, localize('multiDiffEditorLabelIcon', 'Icon of the multi diff editor label.'));
