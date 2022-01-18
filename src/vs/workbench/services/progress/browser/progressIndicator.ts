/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { IProgressRunner, IProgressIndicator, emptyProgressRunner } from 'vs/platform/progress/common/progress';
import { IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { IViewsService } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { GroupModelChangeKind } from 'vs/workbench/common/editor';

class ProgressBarIndicator extends Disposable implements IProgressIndicator {

	constructor(protected progressbar: ProgressBar) {
		super();
	}

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

	async showWhile(promise: Promise<unknown>, delay?: number): Promise<void> {
		try {
			this.progressbar.infinite().show(delay);

			await promise;
		} catch (error) {
			// ignore
		} finally {
			this.progressbar.stop().hide();
		}
	}
}

export class EditorProgressIndicator extends ProgressBarIndicator {

	constructor(
		progressBar: ProgressBar,
		private readonly group: IEditorGroupView
	) {
		super(progressBar);

		this.registerListeners();
	}

	private registerListeners() {

		// Stop any running progress when the active editor changes or
		// the group becomes empty.
		// In contrast to the composite progress indicator, we do not
		// track active editor progress and replay it later (yet).
		this._register(this.group.onDidModelChange(e => {
			if (
				e.kind === GroupModelChangeKind.EDITOR_ACTIVE ||
				(e.kind === GroupModelChangeKind.EDITOR_CLOSE && this.group.isEmpty)
			) {
				this.progressbar.stop().hide();
			}
		}));
	}

	override show(infinite: true, delay?: number): IProgressRunner;
	override show(total: number, delay?: number): IProgressRunner;
	override show(infiniteOrTotal: true | number, delay?: number): IProgressRunner {

		// No editor open: ignore any progress reporting
		if (this.group.isEmpty) {
			return emptyProgressRunner;
		}

		if (infiniteOrTotal === true) {
			return super.show(true, delay);
		}

		return super.show(infiniteOrTotal, delay);
	}

	override async showWhile(promise: Promise<unknown>, delay?: number): Promise<void> {

		// No editor open: ignore any progress reporting
		if (this.group.isEmpty) {
			try {
				await promise;
			} catch (error) {
				// ignore
			}
		}

		return super.showWhile(promise, delay);
	}
}

namespace ProgressIndicatorState {

	export const enum Type {
		None,
		Done,
		Infinite,
		While,
		Work
	}

	export const None = { type: Type.None } as const;
	export const Done = { type: Type.Done } as const;
	export const Infinite = { type: Type.Infinite } as const;

	export class While {

		readonly type = Type.While;

		constructor(
			readonly whilePromise: Promise<unknown>,
			readonly whileStart: number,
			readonly whileDelay: number,
		) { }
	}

	export class Work {

		readonly type = Type.Work;

		constructor(
			readonly total: number | undefined,
			readonly worked: number | undefined
		) { }
	}

	export type State =
		typeof None
		| typeof Done
		| typeof Infinite
		| While
		| Work;
}

interface IProgressScope {

	/**
	 * Fired whenever `isActive` value changed.
	 */
	readonly onDidChangeActive: Event<void>;

	/**
	 * Whether progress should be active or not.
	 */
	readonly isActive: boolean;
}

class ScopedProgressIndicator extends Disposable implements IProgressIndicator {

	private progressState: ProgressIndicatorState.State = ProgressIndicatorState.None;

	constructor(
		private readonly progressbar: ProgressBar,
		private readonly scope: IProgressScope
	) {
		super();

		this.registerListeners();
	}

	registerListeners() {
		this._register(this.scope.onDidChangeActive(() => {
			if (this.scope.isActive) {
				this.onDidScopeActivate();
			} else {
				this.onDidScopeDeactivate();
			}
		}));
	}

	private onDidScopeActivate(): void {

		// Return early if progress state indicates that progress is done
		if (this.progressState.type === ProgressIndicatorState.Done.type) {
			return;
		}

		// Replay Infinite Progress from Promise
		if (this.progressState.type === ProgressIndicatorState.Type.While) {
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
		else if (this.progressState.type === ProgressIndicatorState.Type.Infinite) {
			this.progressbar.infinite().show();
		}

		// Replay Finite Progress (Total & Worked)
		else if (this.progressState.type === ProgressIndicatorState.Type.Work) {
			if (this.progressState.total) {
				this.progressbar.total(this.progressState.total).show();
			}

			if (this.progressState.worked) {
				this.progressbar.worked(this.progressState.worked).show();
			}
		}
	}

	private onDidScopeDeactivate(): void {
		this.progressbar.stop().hide();
	}

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: true | number, delay?: number): IProgressRunner {

		// Sort out Arguments
		if (typeof infiniteOrTotal === 'boolean') {
			this.progressState = ProgressIndicatorState.Infinite;
		} else {
			this.progressState = new ProgressIndicatorState.Work(infiniteOrTotal, undefined);
		}

		// Active: Show Progress
		if (this.scope.isActive) {

			// Infinite: Start Progressbar and Show after Delay
			if (this.progressState.type === ProgressIndicatorState.Type.Infinite) {
				this.progressbar.infinite().show(delay);
			}

			// Finite: Start Progressbar and Show after Delay
			else if (this.progressState.type === ProgressIndicatorState.Type.Work && typeof this.progressState.total === 'number') {
				this.progressbar.total(this.progressState.total).show(delay);
			}
		}

		return {
			total: (total: number) => {
				this.progressState = new ProgressIndicatorState.Work(
					total,
					this.progressState.type === ProgressIndicatorState.Type.Work ? this.progressState.worked : undefined);

				if (this.scope.isActive) {
					this.progressbar.total(total);
				}
			},

			worked: (worked: number) => {

				// Verify first that we are either not active or the progressbar has a total set
				if (!this.scope.isActive || this.progressbar.hasTotal()) {
					this.progressState = new ProgressIndicatorState.Work(
						this.progressState.type === ProgressIndicatorState.Type.Work ? this.progressState.total : undefined,
						this.progressState.type === ProgressIndicatorState.Type.Work && typeof this.progressState.worked === 'number' ? this.progressState.worked + worked : worked);

					if (this.scope.isActive) {
						this.progressbar.worked(worked);
					}
				}

				// Otherwise the progress bar does not support worked(), we fallback to infinite() progress
				else {
					this.progressState = ProgressIndicatorState.Infinite;
					this.progressbar.infinite().show();
				}
			},

			done: () => {
				this.progressState = ProgressIndicatorState.Done;

				if (this.scope.isActive) {
					this.progressbar.stop().hide();
				}
			}
		};
	}

	async showWhile(promise: Promise<unknown>, delay?: number): Promise<void> {

		// Join with existing running promise to ensure progress is accurate
		if (this.progressState.type === ProgressIndicatorState.Type.While) {
			promise = Promise.all([promise, this.progressState.whilePromise]);
		}

		// Keep Promise in State
		this.progressState = new ProgressIndicatorState.While(promise, delay || 0, Date.now());

		try {
			this.doShowWhile(delay);

			await promise;
		} catch (error) {
			// ignore
		} finally {

			// If this is not the last promise in the list of joined promises, skip this
			if (this.progressState.type !== ProgressIndicatorState.Type.While || this.progressState.whilePromise === promise) {

				// The while promise is either null or equal the promise we last hooked on
				this.progressState = ProgressIndicatorState.None;

				if (this.scope.isActive) {
					this.progressbar.stop().hide();
				}
			}
		}
	}

	private doShowWhile(delay?: number): void {

		// Show Progress when active
		if (this.scope.isActive) {
			this.progressbar.infinite().show(delay);
		}
	}
}

export class CompositeProgressScope extends Disposable implements IProgressScope {

	private readonly _onDidChangeActive = this._register(new Emitter<void>());
	readonly onDidChangeActive = this._onDidChangeActive.event;

	get isActive() { return this._isActive; }

	constructor(
		private paneCompositeService: IPaneCompositePartService,
		private viewsService: IViewsService,
		private scopeId: string,
		private _isActive: boolean
	) {
		super();

		this.registerListeners();
	}

	registerListeners(): void {
		this._register(this.viewsService.onDidChangeViewVisibility(e => e.visible ? this.onScopeOpened(e.id) : this.onScopeClosed(e.id)));

		this._register(this.paneCompositeService.onDidPaneCompositeOpen(e => this.onScopeOpened(e.composite.getId())));
		this._register(this.paneCompositeService.onDidPaneCompositeClose(e => this.onScopeClosed(e.composite.getId())));
	}

	private onScopeOpened(scopeId: string) {
		if (scopeId === this.scopeId) {
			if (!this._isActive) {
				this._isActive = true;

				this._onDidChangeActive.fire();
			}
		}
	}

	private onScopeClosed(scopeId: string) {
		if (scopeId === this.scopeId) {
			if (this._isActive) {
				this._isActive = false;

				this._onDidChangeActive.fire();
			}
		}
	}
}

export class CompositeProgressIndicator extends ScopedProgressIndicator {
	constructor(
		progressbar: ProgressBar,
		scopeId: string,
		isActive: boolean,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IViewsService viewsService: IViewsService
	) {
		super(progressbar, new CompositeProgressScope(paneCompositeService, viewsService, scopeId, isActive));
	}
}
