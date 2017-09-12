/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/progressService2';
import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IActivityBarService, ProgressBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IProgressService2, IProgressOptions, ProgressLocation, IProgress, IProgressStep, Progress, emptyProgress } from 'vs/platform/progress/common/progress';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { Registry } from 'vs/platform/registry/common/platform';
import { StatusbarAlignment, IStatusbarRegistry, StatusbarItemDescriptor, Extensions, IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { always } from 'vs/base/common/async';

class WindowProgressItem implements IStatusbarItem {

	static Instance: WindowProgressItem;

	private _element: HTMLElement;
	private _label: OcticonLabel;

	constructor() {
		WindowProgressItem.Instance = this;
	}

	render(element: HTMLElement): IDisposable {
		this._element = element;
		this._label = new OcticonLabel(this._element);
		this._element.classList.add('progress');
		this.hide();
		return null;
	}

	set text(value: string) {
		this._label.text = value;
	}

	set title(value: string) {
		this._label.title = value;
	}

	hide() {
		dom.hide(this._element);
	}

	show() {
		dom.show(this._element);
	}
}


export class ProgressService2 implements IProgressService2 {

	_serviceBrand: any;

	private _stack: [IProgressOptions, Progress<IProgressStep>][] = [];

	constructor(
		@IActivityBarService private _activityBar: IActivityBarService,
		@IViewletService private _viewletService: IViewletService
	) {
		//
	}

	withProgress(options: IProgressOptions, task: (progress: IProgress<{ message?: string, percentage?: number }>) => TPromise<any>): void {
		const { location } = options;
		switch (location) {
			case ProgressLocation.Window:
				this._withWindowProgress(options, task);
				break;
			case ProgressLocation.Scm:
				this._withViewletProgress('workbench.view.scm', task);
				break;
			default:
				console.warn(`Bad progress location: ${location}`);
		}
	}


	private _withWindowProgress(options: IProgressOptions, callback: (progress: IProgress<{ message?: string, percentage?: number }>) => TPromise<any>): void {

		const task: [IProgressOptions, Progress<IProgressStep>] = [options, new Progress<IProgressStep>(() => this._updateWindowProgress())];

		const promise = callback(task[1]);

		let delayHandle = setTimeout(() => {
			delayHandle = undefined;
			this._stack.unshift(task);
			this._updateWindowProgress();

			// show progress for at least 150ms
			always(TPromise.join([
				TPromise.timeout(150),
				promise
			]), () => {
				const idx = this._stack.indexOf(task);
				this._stack.splice(idx, 1);
				this._updateWindowProgress();
			});

		}, 150);

		// cancel delay if promise finishes below 150ms
		always(promise, () => clearTimeout(delayHandle));
	}

	private _updateWindowProgress(idx: number = 0) {
		if (idx >= this._stack.length) {
			WindowProgressItem.Instance.hide();
		} else {
			const [options, progress] = this._stack[idx];

			let text = options.title;
			if (progress.value && progress.value.message) {
				text = progress.value.message;
			}

			if (!text) {
				// no message -> no progress. try with next on stack
				this._updateWindowProgress(idx + 1);
				return;
			}

			let title = text;
			if (options.title && options.title !== title) {
				title = localize('progress.subtitle', "{0} - {1}", options.title, title);
			}
			if (options.tooltip) {
				title = localize('progress.title', "{0}: {1}", options.tooltip, title);
			}

			WindowProgressItem.Instance.text = text;
			WindowProgressItem.Instance.title = title;
			WindowProgressItem.Instance.show();
		}
	}

	private _withViewletProgress(viewletId: string, task: (progress: IProgress<{ message?: string, percentage?: number }>) => TPromise<any>): void {

		const promise = task(emptyProgress);

		// show in viewlet
		const viewletProgress = this._viewletService.getProgressIndicator(viewletId);
		if (viewletProgress) {
			viewletProgress.showWhile(promise);
		}

		// show activity bar
		let activityProgress: IDisposable;
		let delayHandle = setTimeout(() => {
			delayHandle = undefined;
			const handle = this._activityBar.showActivity(
				viewletId,
				new ProgressBadge(() => ''),
				'progress-badge'
			);
			const startTimeVisible = Date.now();
			const minTimeVisible = 300;
			activityProgress = {
				dispose() {
					const d = Date.now() - startTimeVisible;
					if (d < minTimeVisible) {
						// should at least show for Nms
						setTimeout(() => handle.dispose(), minTimeVisible - d);
					} else {
						// shown long enough
						handle.dispose();
					}
				}
			};
		}, 300);

		always(promise, () => {
			clearTimeout(delayHandle);
			dispose(activityProgress);
		});
	}
}


Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(
	new StatusbarItemDescriptor(WindowProgressItem, StatusbarAlignment.LEFT)
);
