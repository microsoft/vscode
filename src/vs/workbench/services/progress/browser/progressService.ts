/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as types from 'vs/base/common/types';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';


namespace ProgressState {
	export const enum Type {
		None,
		Done,
		Infinite,
		While,
		Work
	}

	export const None = new class { readonly type = Type.None; };
	export const Done = new class { readonly type = Type.Done; };
	export const Infinite = new class { readonly type = Type.Infinite; };

	export class While {
		public readonly type = Type.While;
		constructor(
			public readonly whilePromise: Promise<any>,
			public readonly whileStart: number,
			public readonly whileDelay: number,
		) { }
	}

	export class Work {
		public readonly type = Type.Work;
		constructor(
			public readonly total: number | undefined,
			public readonly worked: number | undefined
		) { }
	}

	export type State =
		typeof None
		| typeof Done
		| typeof Infinite
		| While
		| Work;
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
	private progressState: ProgressState.State = ProgressState.None;

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
	}

	onScopeDeactivated(): void {
		this.isActive = false;
	}

	onScopeActivated(): void {
		this.isActive = true;

		// Return early if progress state indicates that progress is done
		if (this.progressState.type === ProgressState.Done.type) {
			return;
		}

		// Replay Infinite Progress from Promise
		if (this.progressState.type === ProgressState.Type.While) {
			let delay: number | undefined;
			if (this.progressState.whileDelay > 0) {
				const remainingDelay = this.progressState.whileDelay - (Date.now() - this.progressState.whileStart);
				if (remainingDelay > 0) {
					delay = remainingDelay;
				}
			}

			this.doShowWhile(delay);
		}

		// Replay Infinite Progress
		else if (this.progressState.type === ProgressState.Type.Infinite) {
			this.progressbar.infinite().show();
		}

		// Replay Finite Progress (Total & Worked)
		else if (this.progressState.type === ProgressState.Type.Work) {
			if (this.progressState.total) {
				this.progressbar.total(this.progressState.total).show();
			}

			if (this.progressState.worked) {
				this.progressbar.worked(this.progressState.worked).show();
			}
		}
	}

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: true | number, delay?: number): IProgressRunner {
		// Sort out Arguments
		if (typeof infiniteOrTotal === 'boolean') {
			this.progressState = ProgressState.Infinite;
		} else {
			this.progressState = new ProgressState.Work(infiniteOrTotal, undefined);
		}

		// Active: Show Progress
		if (this.isActive) {

			// Infinite: Start Progressbar and Show after Delay
			if (this.progressState.type === ProgressState.Type.Infinite) {
				this.progressbar.infinite().show(delay);
			}

			// Finite: Start Progressbar and Show after Delay
			else if (this.progressState.type === ProgressState.Type.Work && typeof this.progressState.total === 'number') {
				this.progressbar.total(this.progressState.total).show(delay);
			}
		}

		return {
			total: (total: number) => {
				this.progressState = new ProgressState.Work(
					total,
					this.progressState.type === ProgressState.Type.Work ? this.progressState.worked : undefined);

				if (this.isActive) {
					this.progressbar.total(total);
				}
			},

			worked: (worked: number) => {

				// Verify first that we are either not active or the progressbar has a total set
				if (!this.isActive || this.progressbar.hasTotal()) {
					this.progressState = new ProgressState.Work(
						this.progressState.type === ProgressState.Type.Work ? this.progressState.total : undefined,
						this.progressState.type === ProgressState.Type.Work && typeof this.progressState.worked === 'number' ? this.progressState.worked + worked : worked);

					if (this.isActive) {
						this.progressbar.worked(worked);
					}
				}

				// Otherwise the progress bar does not support worked(), we fallback to infinite() progress
				else {
					this.progressState = ProgressState.Infinite;
					this.progressbar.infinite().show();
				}
			},

			done: () => {
				this.progressState = ProgressState.Done;

				if (this.isActive) {
					this.progressbar.stop().hide();
				}
			}
		};
	}

	showWhile(promise: Promise<any>, delay?: number): Promise<void> {
		// Join with existing running promise to ensure progress is accurate
		if (this.progressState.type === ProgressState.Type.While) {
			promise = Promise.all([promise, this.progressState.whilePromise]);
		}

		// Keep Promise in State
		this.progressState = new ProgressState.While(promise, delay || 0, Date.now());

		let stop = () => {

			// If this is not the last promise in the list of joined promises, return early
			if (this.progressState.type === ProgressState.Type.While && this.progressState.whilePromise !== promise) {
				return;
			}

			// The while promise is either null or equal the promise we last hooked on
			this.progressState = ProgressState.None;

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

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: true | number, delay?: number): IProgressRunner {
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

	showWhile(promise: Promise<any>, delay?: number): Promise<void> {
		const stop = () => {
			this.progressbar.stop().hide();
		};

		this.progressbar.infinite().show(delay);

		return promise.then(stop, stop);
	}
}
