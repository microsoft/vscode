/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { SessionBranchPickerVisibleContext, SessionEnvironmentPickerVisibleContext, SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionSyncActionVisibleContext, SessionWorkspacePickerVisibleContext, SessionWorktreePickerVisibleContext } from '../../../common/contextkeys.js';

export interface ISessionPickerVisibility {
	readonly workspace: boolean;
	readonly harness: boolean;
	readonly isolation: boolean;
	readonly environment: boolean;
	readonly branch: boolean;
	readonly worktree: boolean;
	readonly sync: boolean;
}

export const noSessionPickerVisibility: ISessionPickerVisibility = { workspace: false, harness: false, isolation: false, environment: false, branch: false, worktree: false, sync: false };

export const ISessionInputPickerVisibility = createDecorator<ISessionInputPickerVisibility>('sessionInputPickerVisibility');

/** Composer-owned rendering state shared with its contributed pickers, independently of context-key scopes. */
export interface ISessionInputPickerVisibility {
	readonly _serviceBrand: undefined;
	readonly visibility: IObservable<ISessionPickerVisibility>;
	setVisible(picker: keyof ISessionPickerVisibility, visible: boolean): void;
	registerPicker(picker: 'branch' | 'worktree' | 'sync', focus: () => void): IDisposable;
	focusPicker(picker: 'branch' | 'worktree' | 'sync'): void;
}

export class SessionInputPickerVisibility extends Disposable implements ISessionInputPickerVisibility {
	declare readonly _serviceBrand: undefined;

	private readonly _visibility = observableValue<ISessionPickerVisibility>(this, noSessionPickerVisibility);
	readonly visibility: IObservable<ISessionPickerVisibility> = this._visibility;
	private readonly _pickers = new Map<string, () => void>();

	registerPicker(picker: 'branch' | 'worktree' | 'sync', focus: () => void): IDisposable {
		this._pickers.set(picker, focus);
		this.setVisible(picker, true);
		return toDisposable(() => {
			if (this._pickers.get(picker) === focus) {
				this._pickers.delete(picker);
				this.setVisible(picker, false);
			}
		});
	}

	focusPicker(picker: 'branch' | 'worktree' | 'sync'): void {
		this._pickers.get(picker)?.();
	}

	setVisible(picker: keyof ISessionPickerVisibility, visible: boolean): void {
		const current = this._visibility.get();
		if (current[picker] !== visible) {
			this._visibility.set({ ...current, [picker]: visible }, undefined);
		}
	}

	override dispose(): void {
		this._pickers.clear();
		this._visibility.set(noSessionPickerVisibility, undefined);
		super.dispose();
	}
}

/** Projects the same view-owned state into either its local scope or the active view's global scope. */
export class SessionPickerVisibilityContextKeys extends Disposable {
	private readonly _workspace: IContextKey<boolean>;
	private readonly _harness: IContextKey<boolean>;
	private readonly _isolation: IContextKey<boolean>;
	private readonly _environment: IContextKey<boolean>;
	private readonly _branch: IContextKey<boolean>;
	private readonly _worktree: IContextKey<boolean>;
	private readonly _sync: IContextKey<boolean>;

	constructor(private readonly _contextKeyService: IContextKeyService) {
		super();
		this._workspace = SessionWorkspacePickerVisibleContext.bindTo(_contextKeyService);
		this._harness = SessionHarnessPickerVisibleContext.bindTo(_contextKeyService);
		this._isolation = SessionIsolationPickerVisibleContext.bindTo(_contextKeyService);
		this._environment = SessionEnvironmentPickerVisibleContext.bindTo(_contextKeyService);
		this._branch = SessionBranchPickerVisibleContext.bindTo(_contextKeyService);
		this._worktree = SessionWorktreePickerVisibleContext.bindTo(_contextKeyService);
		this._sync = SessionSyncActionVisibleContext.bindTo(_contextKeyService);
		this._register(toDisposable(() => this.set(noSessionPickerVisibility)));
	}

	set(visibility: ISessionPickerVisibility): void {
		this._contextKeyService.bufferChangeEvents(() => {
			this._workspace.set(visibility.workspace);
			this._harness.set(visibility.harness);
			this._isolation.set(visibility.isolation);
			this._environment.set(visibility.environment);
			this._branch.set(visibility.branch);
			this._worktree.set(visibility.worktree);
			this._sync.set(visibility.sync);
		});
	}
}
