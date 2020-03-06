/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable } from 'vs/base/common/lifecycle';

export class QuickOmniController extends Disposable {

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();
	}

	async show(prefix?: string): Promise<void> {
		this.quickInputService.pick([
			{ label: '1' },
			{ label: '2' },
			{ label: '3' }
		]);
	}
}
