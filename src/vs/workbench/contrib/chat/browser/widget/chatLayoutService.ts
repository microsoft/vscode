/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IChatLayoutService } from '../../common/widget/chatLayoutService.js';

const FONT_SIZE = 13;

export class ChatLayoutService extends Disposable implements IChatLayoutService {
	declare readonly _serviceBrand: undefined;

	readonly fontFamily: IObservable<string | null>;
	readonly fontSize: IObservable<number>;

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super();

		const chatFontFamily = observableConfigValue<string>('chat.fontFamily', 'default', configurationService);
		this.fontFamily = derived(reader => {
			const fontFamily = chatFontFamily.read(reader);
			return fontFamily === 'default' ? null : fontFamily;
		});

		this.fontSize = observableConfigValue<number>('chat.fontSize', FONT_SIZE, configurationService);
	}
}
