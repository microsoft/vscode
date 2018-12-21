/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/holidays';
import { Action } from 'vs/base/common/actions';
import { $, append, addClass, removeClass, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { IDisposable, toDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

function animate(drawFn: () => void): IDisposable {
	let disposed = false;
	let scheduled = Disposable.None;

	const fn = () => {
		if (!disposed) {
			drawFn();
			scheduled = scheduleAtNextAnimationFrame(fn);
		}
	};

	fn();

	return toDisposable(() => {
		scheduled.dispose();
		disposed = true;
	});
}

function makeItSnow(canvas: HTMLCanvasElement): IDisposable {
	const ctx = canvas.getContext('2d')!;
	const flakes: any[] = [];

	function update() {
		const spawnCount = Math.ceil(Math.max(200 - flakes.length, 10) * Math.random() * 0.0005);

		for (let i = 0; i < spawnCount; i++) {
			const distance = Math.random();

			flakes.push({
				x: Math.random() * (canvas.width + 180 /* for wind */),
				y: -5,
				vx: (-(0.5 * distance)) * window.devicePixelRatio,
				vy: (0.2 + 1.5 * distance) * window.devicePixelRatio,
				size: (2 + 2 * distance) * window.devicePixelRatio,
				color: 170 + distance * 50
			});
		}

		for (let i = 0; i < flakes.length; i++) {
			const flake = flakes[i];
			flake.x += flake.vx;
			flake.y += flake.vy;

			if (flake.y > canvas.height) {
				flakes.splice(i--, 1);
			}
		}
	}

	function draw() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		for (const flake of flakes) {
			ctx.beginPath();
			ctx.arc(flake.x, flake.y, flake.size, 0, 2 * Math.PI);
			ctx.fillStyle = `rgba(${flake.color}, ${flake.color}, ${flake.color}, 1)`;
			ctx.fill();
		}
	}

	return animate(() => {
		update();
		draw();
	});
}

export class HappyHolidaysAction extends Action {

	static ID = 'happyholidays';
	static LABEL = 'Happy Holidays!';

	constructor(
		id: string,
		label: string
	) {
		super(id, label, '', true);
	}

	async run(): Promise<void> {
		const disposables: IDisposable[] = [];

		const workbench = document.querySelector('.monaco-workbench') as HTMLElement;
		addClass(workbench, 'blur');
		disposables.push(toDisposable(() => removeClass(workbench, 'blur')));

		const el = append(document.body, $('.happy-holidays'));
		disposables.push(toDisposable(() => document.body.removeChild(el)));

		const canvas: HTMLCanvasElement = append(el, $('canvas.happy-holidays-snow'));
		canvas.width = document.body.clientWidth * window.devicePixelRatio;
		canvas.height = document.body.clientHeight * window.devicePixelRatio;
		canvas.style.width = `${document.body.clientWidth}px`;
		canvas.style.height = `${document.body.clientHeight}px`;
		disposables.push(makeItSnow(canvas));

		const text = append(el, $('.happy-holidays-text'));
		text.innerText = `The VS Code team wishes you a great Holiday season!`;
		setTimeout(() => addClass(text, 'animate'), 50);

		const onKeyDown = domEvent(document.body, 'keydown', true);
		const onClick = domEvent(document.body, 'click', true);
		const onInteraction = Event.any<any>(onKeyDown, onClick);

		const close = () => dispose(disposables);
		Event.once(domEvent(window, 'resize'))(close, null, disposables);
		stop(Event.once(onInteraction))(close, null, disposables);
	}
}

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(HappyHolidaysAction, HappyHolidaysAction.ID, HappyHolidaysAction.LABEL), 'Show Release Notes');
