/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle';
import { ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from '../../../../platform/languagePacks/node/languagePacks';

export class LocalizationsUpdater extends Disposable {

	constructor(
		@ILanguagePackService private readonly localizationsService: NativeLanguagePackService
	) {
		super();

		this.updateLocalizations();
	}

	private updateLocalizations(): void {
		this.localizationsService.update();
	}
}
