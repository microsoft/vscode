/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { LanguagePackService } from 'vs/platform/languagePacks/node/languagePacks';

export class LocalizationsUpdater extends Disposable {

	constructor(
		@ILanguagePackService private readonly localizationsService: LanguagePackService
	) {
		super();

		this.updateLocalizations();
	}

	private updateLocalizations(): void {
		this.localizationsService.update();
	}
}
