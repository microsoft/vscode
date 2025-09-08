/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatLayoutService } from '../common/chatLayoutService.js';

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

export abstract class ChatListDelegate<T> implements IListVirtualDelegate<T> {
	constructor(@IChatLayoutService private readonly chatLayoutService: IChatLayoutService) { }

	getHeight(_element: T): number {
		return this._getHeight();
	}

	getDynamicHeight(_element: T): number | null {
		return this._getHeight();
	}

	hasDynamicHeight(_element: T): boolean {
		return true;
	}

	private _getHeight(): number {
		const fontSize = this.chatLayoutService.fontSize.get();

		// For the default font size of 13px, return 22. After that
		// as font size increases by 2px, increase the height by 2px
		return 22 + 2 * Math.floor(Math.max(0, fontSize - FONT_SIZE) / 2);
	}

	abstract getTemplateId(element: T): string;
}
