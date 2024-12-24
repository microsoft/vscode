/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const MultiDiffEditorIcon = registerIcon('multi-diff-editor-label-icon', Codicon.diffMultiple, localize('multiDiffEditorLabelIcon', 'Icon of the multi diff editor label.'));
