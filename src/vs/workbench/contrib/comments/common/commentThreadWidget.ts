/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export interface ICommentThreadWidget {
	submitComment: () => Promise<void>;
	collapse: () => void;
	getContext(): IContextKeyService;
}
