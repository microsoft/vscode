/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LocalizationsBaseService } from 'vs/platform/localizations/common/localizations';

export class LocalizationsService extends LocalizationsBaseService {
	getInstalledLanguages(): Promise<{ locale: string; label?: string | undefined }[]> {
		// In web, there is no concept of "installed languages".
		return Promise.resolve([]);
	}
}
