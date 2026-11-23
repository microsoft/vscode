/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ITransaction } from '../../../../base/common/observable.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * How a custom view renders the actions in its header: as an icon toolbar or as
 * a row of labelled buttons. Both render the same menu, so contributed actions
 * and their `when` clauses are identical either way.
 */
export type CustomViewActionsStyle = 'toolbar' | 'buttonBar';

export interface ICustomViewActions {
	readonly style: CustomViewActionsStyle;
	readonly menuId: MenuId;
}

export interface ICustomViewDescriptor {

	/** Stable id, used by `ICustomViewService.showCustomView`. */
	readonly id: string;

	readonly ctor: SyncDescriptor<AbstractCustomView>;

	readonly actions?: ICustomViewActions;

	/** Handle an unparameterized New Session action without leaving this view. */
	readonly openNewSession?: () => Promise<void> | undefined;

	/**
	 * Whether an opening may show `state`, such as an item that still exists. History skips
	 * openings that the view declines. Views without it accept every state.
	 */
	readonly acceptsState?: (state: string) => boolean;
}

/**
 * A full-surface view hosted in the custom view grid, in place of the sessions
 * grid. The host renders the surrounding chrome (header with title, description
 * and actions, plus the scroll container); a view only fills its content area
 * and is disposed when it is hidden.
 */
export abstract class AbstractCustomView extends Disposable {

	/** Shown in the header. Observable so it can settle after an async load. */
	abstract readonly title: IObservable<string>;

	/** Optional secondary line below the title. */
	readonly description: IObservable<string | undefined> = constObservable(undefined);

	/**
	 * Width the content is capped to. Defaults to the same measure the session
	 * views use.
	 */
	readonly maxWidth: number | undefined = undefined;

	/** Renders the content into the host-provided container. Called once. */
	abstract render(container: HTMLElement): void;

	/** Called whenever the available content area changes. */
	abstract layout(width: number, height: number): void;

	focus(): void { }
}

export const ICustomViewService = createDecorator<ICustomViewService>('customViewService');

export interface ICustomViewOpenRequest {
	readonly descriptor: ICustomViewDescriptor;
	readonly source: 'explicit' | 'history' | 'restore';
	/** Identifies what this opening shows, such as one of several items, so navigation history can return to it. */
	readonly state?: string;
}

/**
 * Owns which custom view (if any) should be rendered in place of the sessions
 * grid. Only one view can be shown at a time. The Agents workbench observes
 * {@link activeCustomView} and, while it is set, renders the custom view grid
 * and hides the sessions grid, the side panel and the bottom panel.
 */
export interface ICustomViewService {

	readonly _serviceBrand: undefined;

	/** The view that should currently be rendered, or `undefined` for none. */
	readonly activeCustomView: IObservable<ICustomViewDescriptor | undefined>;

	/** The current opening, including repeated explicit opens of the same view. */
	readonly activeCustomViewOpen: IObservable<ICustomViewOpenRequest | undefined>;

	registerCustomView(descriptor: ICustomViewDescriptor, options?: { readonly restore?: boolean }): IDisposable;

	/**
	 * Shows the registered view with the given id, replacing any shown view. `state` identifies
	 * what this opening shows; history records it and passes it back when it reopens the view.
	 */
	showCustomView(id: string, options?: { readonly source?: 'history'; readonly state?: string }): void;

	hideCustomView(tx?: ITransaction): void;
}
