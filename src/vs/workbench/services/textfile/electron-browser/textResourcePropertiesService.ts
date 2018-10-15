/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { OperatingSystem, OS } from 'vs/base/common/platform';

export class TextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: any;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService
	) { }

	getEOL(resource: URI, language?: string): string {
		const filesConfiguration = this.configurationService.getValue<{ eol: string }>('files', { overrideIdentifier: language, resource });
		if (filesConfiguration && filesConfiguration.eol && filesConfiguration.eol !== 'auto') {
			return filesConfiguration.eol;
		}
		return OS === OperatingSystem.Linux || OS === OperatingSystem.Macintosh ? '\n' : '\r\n';
	}

}