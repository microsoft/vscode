/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { IProgressRunner, IProgressIndicator, emptyProgressRunner } from '../../../../platform/progress/common/progress.js';
import { IEditorGroupView } from '../../../browser/parts/editor/editor.js';
import { GroupModelChangeKind } from '../../../common/editor.js';

export class EditorProgressIndicator extends Disposable implements IProgressIndicator {

	constructor(
		private readonly progressBar: ProgressBar,
		private readonly group: IEditorGroupView
	) {
		super();

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
				this.progressBar.stop().hide();
			}
		}));
	}

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(infiniteOrTotal: true | number, delay?: number): IProgressRunner {

		// No editor open: ignore any progress reporting
		if (this.group.isEmpty) {
			return emptyProgressRunner;
		}

		if (infiniteOrTotal === true) {
			return this.doShow(true, delay);
		}

		return this.doShow(infiniteOrTotal, delay);
	}

	private doShow(infinite: true, delay?: number): IProgressRunner;
	private doShow(total: number, delay?: number): IProgressRunner;
	private doShow(infiniteOrTotal: true | number, delay?: number): IProgressRunner {
		if (typeof infiniteOrTotal === 'boolean') {
			this.progressBar.infinite().show(delay);
		} else {
			this.progressBar.total(infiniteOrTotal).show(delay);
		}

		return {
			total: (total: number) => {
				this.progressBar.total(total);
			},

			worked: (worked: number) => {
				if (this.progressBar.hasTotal()) {
					this.progressBar.worked(worked);
				} else {
					this.progressBar.infinite().show();
				}
			},

			done: () => {
				this.progressBar.stop().hide();
			}
		};
	}

	async showWhile(promise: Promise<unknown>, delay?: number): Promise<void> {

		// No editor open: ignore any progress reporting
		if (this.group.isEmpty) {
			try {
				await promise;
			} catch (error) {
				// ignore
			}
		}

		return this.doShowWhile(promise, delay);
	}

	private async doShowWhile(promise: Promise<unknown>, delay?: number): Promise<void> {
		try {
			this.progressBar.infinite().show(delay);

			await promise;
		} catch (error) {
			// ignore
		} finally {
			this.progressBar.stop().hide();
		}
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

export interface IProgressScope {

	/**
	 * Fired whenever `isActive` value changed.
	 */
	readonly onDidChangeActive: Event<void>;

	/**
	 * Whether progress should be active or not.
	 */
	readonly isActive: boolean;
}

export class ScopedProgressIndicator extends Disposable implements IProgressIndicator {

	private progressState: ProgressIndicatorState.State = ProgressIndicatorState.None;

	constructor(
		private readonly progressBar: ProgressBar,
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
			this.progressBar.infinite().show();
		}

		// Replay Finite Progress (Total & Worked)
		else if (this.progressState.type === ProgressIndicatorState.Type.Work) {
			if (this.progressState.total) {
				this.progressBar.total(this.progressState.total).show();
			}

			if (this.progressState.worked) {
				this.progressBar.worked(this.progressState.worked).show();
			}
		}
	}

	private onDidScopeDeactivate(): void {
		this.progressBar.stop().hide();
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
				this.progressBar.infinite().show(delay);
			}

			// Finite: Start Progressbar and Show after Delay
			else if (this.progressState.type === ProgressIndicatorState.Type.Work && typeof this.progressState.total === 'number') {
				this.progressBar.total(this.progressState.total).show(delay);
			}
		}

		return {
			total: (total: number) => {
				this.progressState = new ProgressIndicatorState.Work(
					total,
					this.progressState.type === ProgressIndicatorState.Type.Work ? this.progressState.worked : undefined);

				if (this.scope.isActive) {
					this.progressBar.total(total);
				}
			},

			worked: (worked: number) => {

				// Verify first that we are either not active or the progressbar has a total set
				if (!this.scope.isActive || this.progressBar.hasTotal()) {
					this.progressState = new ProgressIndicatorState.Work(
						this.progressState.type === ProgressIndicatorState.Type.Work ? this.progressState.total : undefined,
						this.progressState.type === ProgressIndicatorState.Type.Work && typeof this.progressState.worked === 'number' ? this.progressState.worked + worked : worked);

					if (this.scope.isActive) {
						this.progressBar.worked(worked);
					}
				}

				// Otherwise the progress bar does not support worked(), we fallback to infinite() progress
				else {
					this.progressState = ProgressIndicatorState.Infinite;
					this.progressBar.infinite().show();
				}
			},

			done: () => {
				this.progressState = ProgressIndicatorState.Done;

				if (this.scope.isActive) {
					this.progressBar.stop().hide();
				}
			}
		};
	}

	async showWhile(promise: Promise<unknown>, delay?: number): Promise<void> {

		// Join with existing running promise to ensure progress is accurate
		if (this.progressState.type === ProgressIndicatorState.Type.While) {
			promise = Promise.allSettled([promise, this.progressState.whilePromise]);
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
					this.progressBar.stop().hide();
				}
			}
		}
	}

	private doShowWhile(delay?: number): void {

		// Show Progress when active
		if (this.scope.isActive) {
			this.progressBar.infinite().show(delay);
		}
	}
}

export abstract class AbstractProgressScope extends Disposable implements IProgressScope {

	private readonly _onDidChangeActive = this._register(new Emitter<void>());
	readonly onDidChangeActive = this._onDidChangeActive.event;

	get isActive() { return this._isActive; }

	constructor(
		private scopeId: string,
		private _isActive: boolean
	) {
		super();
	}

	protected onScopeOpened(scopeId: string) {
		if (scopeId === this.scopeId) {
			if (!this._isActive) {
				this._isActive = true;

				this._onDidChangeActive.fire();
			}
		}
	}

	protected onScopeClosed(scopeId: string) {
		if (scopeId === this.scopeId) {
			if (this._isActive) {
				this._isActive = false;

				this._onDidChangeActive.fire();
			}
		}
	}
}
