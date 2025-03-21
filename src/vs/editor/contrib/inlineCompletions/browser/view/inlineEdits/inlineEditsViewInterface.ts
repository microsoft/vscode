/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Event } from '../../../../../../base/common/event.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { Command } from '../../../../../common/languages.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';

export enum InlineEditTabAction {
	Jump = 'jump',
	Accept = 'accept',
	Inactive = 'inactive'
}

export interface IInlineEditsView {
	isHovered: IObservable<boolean>;
	onDidClick: Event<IMouseEvent>;
}

export interface IInlineEditHost {
	inAcceptFlow: IObservable<boolean>;
	inPartialAcceptFlow: IObservable<boolean>;
}

export interface IInlineEditModel {
	displayName: string;
	action: Command | undefined;
	extensionCommands: Command[];
	inlineEdit: InlineEditWithChanges;
	tabAction: IObservable<InlineEditTabAction>;
	showCollapsed: IObservable<boolean>;

	handleInlineEditShown(): void;
	accept(): void;
	jump(): void;
	abort(reason: string): void;
}
