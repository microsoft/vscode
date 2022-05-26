/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { language } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';

export class NativeLocaleService implements ILocaleService {
	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async setLocale(locale: string | undefined): Promise<boolean> {
		try {
			if (locale === language || (!locale && language === 'en')) {
				return false;
			}
			await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: locale }], true);
			return true;
		} catch (err) {
			this.notificationService.error(err);
			return false;
		}
	}
}

registerSingleton(ILocaleService, NativeLocaleService, true);
