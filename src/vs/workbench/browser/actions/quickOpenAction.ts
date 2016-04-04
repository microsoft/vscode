/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';

export class QuickOpenAction extends Action {
	private prefix: string;

	constructor(actionId: string, actionLabel: string, prefix: string, @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel);

		this.prefix = prefix;
		this.enabled = !!this.quickOpenService;
	}

	public run(): TPromise<any> {

		// Show with prefix
		this.quickOpenService.show(this.prefix);

		return TPromise.as(null);
	}
}