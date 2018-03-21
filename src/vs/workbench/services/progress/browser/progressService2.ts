/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/progressService2';
import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IProgressService2, IProgressOptions, ProgressLocation, IProgress, IProgressStep, Progress, emptyProgress } from 'vs/platform/progress/common/progress';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { Registry } from 'vs/platform/registry/common/platform';
import { StatusbarAlignment, IStatusbarRegistry, StatusbarItemDescriptor, Extensions, IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { TPromise } from 'vs/base/common/winjs.base';
import { always } from 'vs/base/common/async';
import { ProgressBadge, IActivityService } from 'vs/workbench/services/activity/common/activity';

class WindowProgressItem implements IStatusbarItem {

	static Instance: WindowProgressItem;

	private _element: HTMLElement;
	private _label: OcticonLabel;

	constructor() {
		WindowProgressItem.Instance = this;
	}

	render(element: HTMLElement): IDisposable {
		this._element = element;
		this._element.classList.add('progress');

		const container = document.createElement('span');
		this._element.appendChild(container);

		const spinnerContainer = document.createElement('span');
		spinnerContainer.classList.add('spinner-container');
		container.appendChild(spinnerContainer);

		const spinner = new OcticonLabel(spinnerContainer);
		spinner.text = '$(sync~spin)';

		const labelContainer = document.createElement('span');
		container.appendChild(labelContainer);

		this._label = new OcticonLabel(labelContainer);

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
		@IActivityService private readonly _activityBar: IActivityService,
		@IViewletService private readonly _viewletService: IViewletService
	) {
		//
	}

	withProgress<P extends Thenable<R>, R=any>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => P): P {

		const { location } = options;
		switch (location) {
			case ProgressLocation.Window:
				return this._withWindowProgress(options, task);
			case ProgressLocation.Explorer:
				return this._withViewletProgress('workbench.view.explorer', task);
			case ProgressLocation.Scm:
				return this._withViewletProgress('workbench.view.scm', task);
			case ProgressLocation.Extensions:
				return this._withViewletProgress('workbench.view.extensions', task);
			default:
				console.warn(`Bad progress location: ${location}`);
				return undefined;
		}
	}

	private _withWindowProgress<P extends Thenable<R>, R=any>(options: IProgressOptions, callback: (progress: IProgress<{ message?: string, percentage?: number }>) => P): P {

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
		always(TPromise.wrap(promise), () => clearTimeout(delayHandle));
		return promise;
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

	private _withViewletProgress<P extends Thenable<R>, R=any>(viewletId: string, task: (progress: IProgress<{ message?: string, percentage?: number }>) => P): P {

		const promise = task(emptyProgress);

		// show in viewlet
		const viewletProgress = this._viewletService.getProgressIndicator(viewletId);
		if (viewletProgress) {
			viewletProgress.showWhile(TPromise.wrap(promise));
		}

		// show activity bar
		let activityProgress: IDisposable;
		let delayHandle = setTimeout(() => {
			delayHandle = undefined;
			const handle = this._activityBar.showActivity(
				viewletId,
				new ProgressBadge(() => ''),
				'progress-badge',
				100
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

		const onDone = () => {
			clearTimeout(delayHandle);
			dispose(activityProgress);
		};

		promise.then(onDone, onDone);
		return promise;
	}
}


Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(
	new StatusbarItemDescriptor(WindowProgressItem, StatusbarAlignment.LEFT)
);
