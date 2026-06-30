/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { basename } from '../../../util/vs/base/common/path';

export class GhostTextLogContext extends InlineEditRequestLogContext {
	override getDebugName(): string {
		return `Ghost | ${basename(this.filePath)} (v${this.version})`;
	}
}
