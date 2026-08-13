/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatModel } from '../common/model/chatModel.js';
import { IChatPetActivity, IChatPetService } from './chatPetService.js';

export interface IChatPetHostOptions {
	readonly hostVisible: IObservable<boolean>;
	readonly hostPreferred: IObservable<boolean>;
	readonly model: IObservable<IChatModel | undefined>;
	readonly hasInput: IObservable<boolean>;
	readonly getScreenBounds: () => IRectangle | undefined;
}

export interface IChatPetHostRegistration extends IDisposable {
	readonly visible: IObservable<boolean>;
	readonly activity?: IObservable<IChatPetActivity | undefined>;
}

export const IChatPetHostService = createDecorator<IChatPetHostService>('chatPetHostService');

export interface IChatPetHostService {
	readonly _serviceBrand: undefined;
	registerHost(options: IChatPetHostOptions): IChatPetHostRegistration;
}

class BrowserChatPetHostRegistration extends Disposable implements IChatPetHostRegistration {

	readonly visible: IObservable<boolean>;

	constructor(options: IChatPetHostOptions, chatPetService: IChatPetService) {
		super();
		this.visible = derived(this, reader => chatPetService.enabled.read(reader) && options.hostPreferred.read(reader));
	}
}

export class BrowserChatPetHostService implements IChatPetHostService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
	) { }

	registerHost(options: IChatPetHostOptions): IChatPetHostRegistration {
		return new BrowserChatPetHostRegistration(options, this.chatPetService);
	}
}
