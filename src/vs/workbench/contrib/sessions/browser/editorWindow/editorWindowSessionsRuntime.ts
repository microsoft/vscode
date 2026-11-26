/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IAgentsViewProvidersService } from '../agentsView/agentsViewProviders.js';

export interface IEditorWindowSessionsRuntimeOptions {
	/** The views that show sessions, such as a sessions list: while one of them shows, or the chat part does, the sessions are known. */
	readonly viewIds: readonly string[];
}

export const IEditorWindowSessionsRuntime = createDecorator<IEditorWindowSessionsRuntime>('editorWindowSessionsRuntime');

/**
 * The sessions of an editor window, for the features that show them there, such as a sessions list or the chat part: it
 * holds the sessions providers of the window (see `IAgentsViewProvidersService`) while what shows sessions shows. It does
 * nothing until a feature enables it.
 */
export interface IEditorWindowSessionsRuntime {
	readonly _serviceBrand: undefined;

	/** Whether a feature enabled it. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Holds the sessions providers while one of `options.viewIds`, or the chat part, shows, until the returned disposable is
	 * disposed. Features that enable it together share the providers: they are held while what any of them shows shows.
	 */
	enable(options: IEditorWindowSessionsRuntimeOptions): IDisposable;
}

export class EditorWindowSessionsRuntime extends Disposable implements IEditorWindowSessionsRuntime {

	declare readonly _serviceBrand: undefined;

	/** One per call of {@link enable}, also of the same options: each is removed by its own disposal only. */
	private readonly _owners = observableValue<readonly { readonly options: IEditorWindowSessionsRuntimeOptions }[]>(this, []);
	readonly enabled: IObservable<boolean> = derived(this, reader => this._owners.read(reader).length > 0);

	private readonly _hold = this._register(new MutableDisposable());
	/** What it listens to, from when a feature first enables it. */
	private readonly _listeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IViewsService private readonly _viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IAgentsViewProvidersService private readonly _providers: IAgentsViewProvidersService,
	) {
		super();
	}

	enable(options: IEditorWindowSessionsRuntimeOptions): IDisposable {
		const owner = { options };
		this._owners.set([...this._owners.get(), owner], undefined);
		this._listen();
		this._update();
		return toDisposable(() => {
			this._owners.set(this._owners.get().filter(candidate => candidate !== owner), undefined);
			if (!this._owners.get().length) {
				this._listeners.clear();
			}
			this._update();
		});
	}

	private _listen(): void {
		if (this._listeners.value) {
			return;
		}
		const listeners = this._listeners.value = new DisposableStore();
		listeners.add(this._viewsService.onDidChangeViewVisibility(e => {
			if (this._owners.get().some(owner => owner.options.viewIds.includes(e.id))) {
				this._update();
			}
		}));
		listeners.add(this._layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART) {
				this._update();
			}
		}));
		// The chat part restores shown with the window, without a change of its visibility
		void this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (!listeners.isDisposed) {
				this._update();
			}
		});
	}

	private _update(): void {
		if (this._store.isDisposed) {
			return;
		}
		const owners = this._owners.get();
		const shown = owners.length > 0 && (this._layoutService.isVisible(Parts.CHAT_PART) || owners.some(owner => owner.options.viewIds.some(id => this._viewsService.isViewVisible(id))));
		if (shown) {
			this._hold.value ??= this._providers.acquire();
		} else {
			this._hold.clear();
		}
	}
}
