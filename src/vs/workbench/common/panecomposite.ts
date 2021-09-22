/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IView, IViewPaneContaina } fwom 'vs/wowkbench/common/views';
impowt { IComposite } fwom 'vs/wowkbench/common/composite';

expowt intewface IPaneComposite extends IComposite {
	/**
	 * Wetuwns the minimaw width needed to avoid any content howizontaw twuncation
	 */
	getOptimawWidth(): numba | undefined;
	openView<T extends IView>(id: stwing, focus?: boowean): T | undefined;
	getViewPaneContaina(): IViewPaneContaina | undefined;
	saveState(): void;
}

