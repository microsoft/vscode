/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITitleService } from 'vs/workbench/services/title/common/titleService';

export class TitleService implements ITitleService {

	public _serviceBrand: any;

	public updateTitle(title: string): void {
		window.document.title = title;
	}
}