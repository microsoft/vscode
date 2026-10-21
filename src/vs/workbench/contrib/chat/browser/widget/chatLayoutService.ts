/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getUITypography, onDidChangeUITypography } from '../../../../../base/browser/fonts.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { IConfigurationService, isConfigured } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IChatLayoutService } from '../../common/widget/chatLayoutService.js';

const FONT_SIZE = 13;

export class ChatLayoutService extends Disposable implements IChatLayoutService {
	declare readonly _serviceBrand: undefined;

	readonly fontFamily: IObservable<string | null>;
	readonly fontSize: IObservable<number>;

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super();

		// Chat follows the UI typography unless configured otherwise
		const uiTypography = observableFromEvent(this, onDidChangeUITypography, () => getUITypography());

		const chatFontFamily = observableConfigValue<string>('chat.fontFamily', 'default', configurationService);
		this.fontFamily = derived(reader => {
			const fontFamily = chatFontFamily.read(reader);
			return fontFamily === 'default' ? uiTypography.read(reader).fontFamily ?? null : fontFamily;
		});

		const chatFontSize = observableConfigValue<number>('chat.fontSize', FONT_SIZE, configurationService);
		this.fontSize = derived(reader => {
			const fontSize = chatFontSize.read(reader);
			return isConfigured(configurationService.inspect<number>('chat.fontSize')) ? fontSize : uiTypography.read(reader).fontSize;
		});
	}
}
