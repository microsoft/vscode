/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservableSignal, observableSignal } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatLayoutService } from '../common/chatLayoutService.js';

export class ChatLayoutService extends Disposable implements IChatLayoutService {
	declare readonly _serviceBrand: undefined;

	private readonly _fontSizeDefault = 13;

	readonly configurationChangedSignal: IObservableSignal<void>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILayoutService layoutService: ILayoutService
	) {
		super();

		this.configurationChangedSignal = observableSignal<void>(this);

		const chatFontSize = observableConfigValue<number>('chat.fontSize', this._fontSizeDefault, configurationService);
		const chatFontFamily = observableConfigValue<string>('chat.fontFamily', 'default', configurationService);

		this._register(autorun(reader => {
			const fontSize = chatFontSize.read(reader);
			const fontFamily = chatFontFamily.read(reader);

			layoutService.mainContainer.style.setProperty('--vscode-chat-font-family', fontFamily === 'default' ? null : fontFamily);

			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-body-xs', `${Math.round(fontSize * (11 / this._fontSizeDefault))}px`);
			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-body-s', `${Math.round(fontSize * (12 / this._fontSizeDefault))}px`);
			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-body-m', `${Math.round(fontSize * (13 / this._fontSizeDefault))}px`);
			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-body-l', `${Math.round(fontSize * (14 / this._fontSizeDefault))}px`);

			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-title-s', `${Math.round(fontSize * (14 / this._fontSizeDefault))}px`);
			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-title-m', `${Math.round(fontSize * (16 / this._fontSizeDefault))}px`);
			layoutService.mainContainer.style.setProperty('--vscode-chat-font-size-title-l', `${Math.round(fontSize * (20 / this._fontSizeDefault))}px`);

			this.configurationChangedSignal.trigger(undefined);
		}));
	}
}
