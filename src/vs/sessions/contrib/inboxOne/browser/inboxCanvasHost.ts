/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICanvas } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';

export interface IInboxCanvasHost extends IDisposable {
	layout(): void;
	setVisible(visible: boolean): void;
	createAccessibleProvider(): AccessibleContentProvider;
}

export const IInboxCanvasHostService = createDecorator<IInboxCanvasHostService>('inboxCanvasHostService');

export interface IInboxCanvasHostService {
	readonly _serviceBrand: undefined;
	readonly supported: boolean;
	readonly enabled: IObservable<boolean>;
	create(container: HTMLElement, viewport: HTMLElement, session: ISession, chat: IChat, canvas: ICanvas): IInboxCanvasHost;
}

export class UnsupportedInboxCanvasHostService implements IInboxCanvasHostService {
	declare readonly _serviceBrand: undefined;
	readonly supported = false;
	readonly enabled = constObservable(false);

	create(): IInboxCanvasHost {
		throw new Error(localize('inbox.canvas.desktopOnly', "Interactive extension canvases require the desktop application."));
	}
}
