/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';

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
