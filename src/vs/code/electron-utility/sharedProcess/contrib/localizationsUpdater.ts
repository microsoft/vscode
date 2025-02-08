/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { NativeLanguagePackService } from '../../../../platform/languagePacks/node/languagePacks.js';

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
