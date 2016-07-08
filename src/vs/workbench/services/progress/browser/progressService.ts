/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {EventType, CompositeEvent} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {IProgressService, IProgressRunner} from 'vs/platform/progress/common/progress';

interface ProgressState {
	infinite?: boolean;
	total?: number;
	worked?: number;
	done?: boolean;
	whilePromise?: TPromise<any>;
}

export abstract class ScopedService {
	private _eventService: IEventService;
	private scopeId: string;

	constructor(eventService: IEventService, scopeId: string) {
		this._eventService = eventService;
		this.scopeId = scopeId;

		this.registerListeners();
	}

	public get eventService(): IEventService {
		return this._eventService;
	}

	public registerListeners(): void {
		this.eventService.addListener2(EventType.COMPOSITE_CLOSED, (e: CompositeEvent) => {
			if (e.compositeId === this.scopeId) {
				this.onScopeDeactivated();
			}
		});

		this.eventService.addListener2(EventType.COMPOSITE_OPENED, (e: CompositeEvent) => {
			if (e.compositeId === this.scopeId) {
				this.onScopeActivated();
			}
		});
	}

	public abstract onScopeActivated(): void;

	public abstract onScopeDeactivated(): void;
}

export class WorkbenchProgressService extends ScopedService implements IProgressService {
	public _serviceBrand: any;
	private isActive: boolean;
	private progressbar: ProgressBar;
	private progressState: ProgressState;

	constructor(eventService: IEventService, progressbar: ProgressBar, scopeId?: string, isActive?: boolean) {
		super(eventService, scopeId);

		this.progressbar = progressbar;
		this.isActive = isActive || types.isUndefinedOrNull(scopeId); // If service is unscoped, enable by default
		this.progressState = Object.create(null);
	}

	public onScopeDeactivated(): void {
		this.isActive = false;
	}

	public onScopeActivated(): void {
		this.isActive = true;

		// Return early if progress state indicates that progress is done
		if (this.progressState.done) {
			return;
		}

		// Replay Infinite Progress from Promise
		if (this.progressState.whilePromise) {
			this.doShowWhile();
		}

		// Replay Infinite Progress
		else if (this.progressState.infinite) {
			this.progressbar.infinite().getContainer().show();
		}

		// Replay Finite Progress (Total & Worked)
		else {
			if (this.progressState.total) {
				this.progressbar.total(this.progressState.total).getContainer().show();
			}

			if (this.progressState.worked) {
				this.progressbar.worked(this.progressState.worked).getContainer().show();
			}
		}
	}

	private clearProgressState(): void {
		this.progressState.infinite = void 0;
		this.progressState.done = void 0;
		this.progressState.worked = void 0;
		this.progressState.total = void 0;
		this.progressState.whilePromise = void 0;
	}

	public show(infinite: boolean, delay?: number): IProgressRunner;
	public show(total: number, delay?: number): IProgressRunner;
	public show(infiniteOrTotal: any, delay?: number): IProgressRunner {
		let infinite: boolean;
		let total: number;

		// Sort out Arguments
		if (infiniteOrTotal === false || infiniteOrTotal === true) {
			infinite = infiniteOrTotal;
		} else {
			total = infiniteOrTotal;
		}

		// Reset State
		this.clearProgressState();

		// Keep in State
		this.progressState.infinite = infinite;
		this.progressState.total = total;

		// Active: Show Progress
		if (this.isActive) {

			// Infinite: Start Progressbar and Show after Delay
			if (!types.isUndefinedOrNull(infinite)) {
				if (types.isUndefinedOrNull(delay)) {
					this.progressbar.infinite().getContainer().show();
				} else {
					this.progressbar.infinite().getContainer().showDelayed(delay);
				}
			}

			// Finite: Start Progressbar and Show after Delay
			else if (!types.isUndefinedOrNull(total)) {
				if (types.isUndefinedOrNull(delay)) {
					this.progressbar.total(total).getContainer().show();
				} else {
					this.progressbar.total(total).getContainer().showDelayed(delay);
				}
			}
		}

		return {
			total: (total: number) => {
				this.progressState.infinite = false;
				this.progressState.total = total;

				if (this.isActive) {
					this.progressbar.total(total);
				}
			},

			worked: (worked: number) => {

				// Verify first that we are either not active or the progressbar has a total set
				if (!this.isActive || this.progressbar.hasTotal()) {
					this.progressState.infinite = false;
					if (this.progressState.worked) {
						this.progressState.worked += worked;
					} else {
						this.progressState.worked = worked;
					}

					if (this.isActive) {
						this.progressbar.worked(worked);
					}
				}

				// Otherwise the progress bar does not support worked(), we fallback to infinite() progress
				else {
					this.progressState.infinite = true;
					this.progressState.worked = void 0;
					this.progressState.total = void 0;
					this.progressbar.infinite().getContainer().show();
				}
			},

			done: () => {
				this.progressState.infinite = false;
				this.progressState.done = true;

				if (this.isActive) {
					this.progressbar.stop().getContainer().hide();
				}
			}
		};
	}

	public showWhile(promise: TPromise<any>, delay?: number): TPromise<void> {
		let stack: boolean = !!this.progressState.whilePromise;

		// Reset State
		if (!stack) {
			this.clearProgressState();
		}

		// Otherwise join with existing running promise to ensure progress is accurate
		else {
			promise = TPromise.join([promise, this.progressState.whilePromise]);
		}

		// Keep Promise in State
		this.progressState.whilePromise = promise;

		let stop = () => {

			// If this is not the last promise in the list of joined promises, return early
			if (!!this.progressState.whilePromise && this.progressState.whilePromise !== promise) {
				return;
			}

			// The while promise is either null or equal the promise we last hooked on
			this.clearProgressState();

			if (this.isActive) {
				this.progressbar.stop().getContainer().hide();
			}
		};

		this.doShowWhile(delay);

		return promise.then(stop, stop);
	}

	private doShowWhile(delay?: number): void {

		// Show Progress when active
		if (this.isActive) {
			if (types.isUndefinedOrNull(delay)) {
				this.progressbar.infinite().getContainer().show();
			} else {
				this.progressbar.infinite().getContainer().showDelayed(delay);
			}
		}
	}
}