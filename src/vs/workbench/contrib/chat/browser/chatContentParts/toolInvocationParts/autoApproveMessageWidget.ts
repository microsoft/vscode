/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';

export class AutoApproveMessageWidget {
	constructor(public readonly message: IMarkdownString) { }
}
