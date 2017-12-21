/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/holidays';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { $, append, addClass, removeClass } from 'vs/base/browser/dom';
import { domEvent, stop } from 'vs/base/browser/event';
import { once, anyEvent } from 'vs/base/common/event';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

export class HappyHolidaysAction extends Action {

	static ID = 'happyholidays';
	static LABEL = 'Happy Holidays!';

	constructor() {
		super(HappyHolidaysAction.ID, HappyHolidaysAction.LABEL, '', true);
	}

	async run(): TPromise<void> {
		const disposables: IDisposable[] = [];

		const shell = document.querySelector('.monaco-shell-content') as HTMLElement;
		addClass(shell, 'blur');
		disposables.push(toDisposable(() => removeClass(shell, 'blur')));

		const el = append(document.body, $('.happy-holidays'));
		const text = append(el, $('.happy-holidays-text'));
		disposables.push(toDisposable(() => document.body.removeChild(el)));

		text.innerText = `The VS Code team wishes you a great Holiday season!`;
		setTimeout(() => addClass(text, 'animate'), 50);

		const onKeyDown = domEvent(document.body, 'keydown', true);
		const onClick = domEvent(document.body, 'click', true);
		const onInteraction = anyEvent<any>(onKeyDown, onClick);

		const close = () => dispose(disposables);
		stop(once(onInteraction))(close, null, disposables);
	}
}

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(HappyHolidaysAction, HappyHolidaysAction.ID, HappyHolidaysAction.LABEL), 'Show Release Notes');
