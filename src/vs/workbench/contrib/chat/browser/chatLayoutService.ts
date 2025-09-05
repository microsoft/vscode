/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ChatFontSize, IChatLayoutService } from '../common/chatLayoutService.js';

export class ChatLayoutService extends Disposable implements IChatLayoutService {
	declare readonly _serviceBrand: undefined;

	private readonly _fontSizeDefault = 13;

	readonly fontFamily: IObservable<string | null>;
	readonly fontSize: IObservable<ChatFontSize>;

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super();

		const chatFontFamily = observableConfigValue<string>('chat.fontFamily', 'default', configurationService);
		const chatFontSize = observableConfigValue<number>('chat.fontSize', this._fontSizeDefault, configurationService);

		this.fontFamily = derived(reader => {
			const fontFamily = chatFontFamily.read(reader);
			return fontFamily === 'default' ? null : fontFamily;
		});

		this.fontSize = derived(reader => {
			const fontSize = chatFontSize.read(reader);
			return {
				xs: Math.round(fontSize * (11 / this._fontSizeDefault)),
				s: Math.round(fontSize * (12 / this._fontSizeDefault)),
				m: Math.round(fontSize * (13 / this._fontSizeDefault)),
				l: Math.round(fontSize * (14 / this._fontSizeDefault)),
				xl: Math.round(fontSize * (16 / this._fontSizeDefault)),
				xxl: Math.round(fontSize * (20 / this._fontSizeDefault)),
			};
		});
	}
}
