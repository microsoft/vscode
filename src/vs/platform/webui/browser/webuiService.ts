/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IOpenerService } from '../../opener/common/opener.js';
import { IWebUIService } from '../common/webuiService.js';

export class WebUIService implements IWebUIService {
	readonly _serviceBrand: undefined;

	constructor(@IOpenerService private readonly openerService: IOpenerService) { }

	async openChat(): Promise<void> {
		await this.openerService.open(URI.parse('http://localhost:3000'));
	}
}
