/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as types from 'vs/base/common/types';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';

interface ProgressState {
	infinite?: boolean;
	total?: number;
	worked?: number;
	done?: boolean;
	whilePromise?: TPromise<any>;
	whileStart?: number;
	whileDelay?: number;
}

export abstract class ScopedService extends Disposable {

	constructor(private viewletService: IViewletService, private panelService: IPanelService, private scopeId: string) {
		super();

		this.registerListeners();
	}

	registerListeners(): void {
		this._register(this.viewletService.onDidViewletOpen(viewlet => this.onScopeOpened(viewlet.getId())));
		this._register(this.panelService.onDidPanelOpen(({ panel }) => this.onScopeOpened(panel.getId())));

		this._register(this.viewletService.onDidViewletClose(viewlet => this.onScopeClosed(viewlet.getId())));
		this._register(this.panelService.onDidPanelClose(panel => this.onScopeClosed(panel.getId())));
	}

	private onScopeClosed(scopeId: string) {
		if (scopeId === this.scopeId) {
			this.onScopeDeactivated();
		}
	}

	private onScopeOpened(scopeId: string) {
		if (scopeId === this.scopeId) {
			this.onScopeActivated();
		}
	}

	abstract onScopeActivated(): void;

	abstract onScopeDeactivated(): void;
}

export class ScopedProgressService extends ScopedService implements IProgressService {
	_serviceBrand: any;
	private isActive: boolean;
	private progressbar: ProgressBar;
	private progressState: ProgressState;

	constructor(
		progressbar: ProgressBar,
		scopeId: string,
		isActive: boolean,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService
	) {
		super(viewletService, panelService, scopeId);

		this.progressbar = progressbar;
		this.isActive = isActive || types.isUndefinedOrNull(scopeId); // If service is unscoped, enable by default
		this.progressState = Object.create(null);
	}

	onScopeDeactivated(): void {
		this.isActive = false;
	}

	onScopeActivated(): void {
		this.isActive = true;

		// Return early if progress state indicates that progress is done
		if (this.progressState.done) {
			return;
		}

		// Replay Infinite Progress from Promise
		if (this.progressState.whilePromise) {
			let delay: number;
			if (this.progressState.whileDelay > 0) {
				const remainingDelay = this.progressState.whileDelay - (Date.now() - this.progressState.whileStart);
				if (remainingDelay > 0) {
					delay = remainingDelay;
				}
			}

			this.doShowWhile(delay);
		}

		// Replay Infinite Progress
		else if (this.progressState.infinite) {
			this.progressbar.infinite().show();
		}

		// Replay Finite Progress (Total & Worked)
		else {
			if (this.progressState.total) {
				this.progressbar.total(this.progressState.total).show();
			}

			if (this.progressState.worked) {
				this.progressbar.worked(this.progressState.worked).show();
			}
		}
	}

	private clearProgressState(): void {
		this.progressState.infinite = void 0;
		this.progressState.done = void 0;
		this.progressState.worked = void 0;
		this.progressState.total = void 0;
		this.progressState.whilePromise = void 0;
		this.progressState.whileStart = void 0;
		this.progressState.whileDelay = void 0;
	}

	show(infinite: boolean, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: boolean | number, delay?: number): IProgressRunner {
		let infinite: boolean;
		let total: number;

		// Sort out Arguments
		if (typeof infiniteOrTotal === 'boolean') {
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
				this.progressbar.infinite().show(delay);
			}

			// Finite: Start Progressbar and Show after Delay
			else if (!types.isUndefinedOrNull(total)) {
				this.progressbar.total(total).show(delay);
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
					this.progressbar.infinite().show();
				}
			},

			done: () => {
				this.progressState.infinite = false;
				this.progressState.done = true;

				if (this.isActive) {
					this.progressbar.stop().hide();
				}
			}
		};
	}

	showWhile(promise: TPromise<any>, delay?: number): TPromise<void> {
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
		this.progressState.whileDelay = delay || 0;
		this.progressState.whileStart = Date.now();

		let stop = () => {

			// If this is not the last promise in the list of joined promises, return early
			if (!!this.progressState.whilePromise && this.progressState.whilePromise !== promise) {
				return;
			}

			// The while promise is either null or equal the promise we last hooked on
			this.clearProgressState();

			if (this.isActive) {
				this.progressbar.stop().hide();
			}
		};

		this.doShowWhile(delay);

		return promise.then(stop, stop);
	}

	private doShowWhile(delay?: number): void {

		// Show Progress when active
		if (this.isActive) {
			this.progressbar.infinite().show(delay);
		}
	}
}

export class ProgressService implements IProgressService {

	_serviceBrand: any;

	constructor(private progressbar: ProgressBar) { }

	show(infinite: boolean, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: boolean | number, delay?: number): IProgressRunner {
		if (typeof infiniteOrTotal === 'boolean') {
			this.progressbar.infinite().show(delay);
		} else {
			this.progressbar.total(infiniteOrTotal).show(delay);
		}

		return {
			total: (total: number) => {
				this.progressbar.total(total);
			},

			worked: (worked: number) => {
				if (this.progressbar.hasTotal()) {
					this.progressbar.worked(worked);
				} else {
					this.progressbar.infinite().show();
				}
			},

			done: () => {
				this.progressbar.stop().hide();
			}
		};
	}

	showWhile(promise: TPromise<any>, delay?: number): TPromise<void> {
		const stop = () => {
			this.progressbar.stop().hide();
		};

		this.progressbar.infinite().show(delay);

		return promise.then(stop, stop);
	}
}
