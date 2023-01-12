/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import 'vs/css!./codicon/codicon';
import 'vs/css!./codicon/codicon-modifiers';

export function formatRule(c: Codicon) {
	return `.codicon-${c.id}:before { content: '${c.fontCharacter}'; }`;
}
