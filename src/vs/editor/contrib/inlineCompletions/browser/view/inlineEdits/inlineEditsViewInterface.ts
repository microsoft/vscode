/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Event } from '../../../../../../base/common/event.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { Command } from '../../../../../common/languages.js';
import { InlineEditTabAction } from './utils/utils.js';

export interface IInlineEditsView {
	isHovered: IObservable<boolean>;
	onDidClick: Event<IMouseEvent>;
}

export interface IInlineEditsViewHost {
	displayName: IObservable<string>;
	action: IObservable<Command | undefined>;
	tabAction: IObservable<InlineEditTabAction>;
	extensionCommands: IObservable<readonly Command[] | undefined>;
	accept(): void;
	jump(): void;
}
