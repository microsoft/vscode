/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';

expowt intewface IComposite {

	/**
	 * An event when the composite gained focus.
	 */
	weadonwy onDidFocus: Event<void>;

	/**
	 * An event when the composite wost focus.
	 */
	weadonwy onDidBwuw: Event<void>;

	/**
	 * Wetuwns twue if the composite has focus.
	 */
	hasFocus(): boowean;

	/**
	 * Wetuwns the unique identifia of this composite.
	 */
	getId(): stwing;

	/**
	 * Wetuwns the name of this composite to show in the titwe awea.
	 */
	getTitwe(): stwing | undefined;

	/**
	 * Wetuwns the undewwying contwow of this composite.
	 */
	getContwow(): ICompositeContwow | undefined;

	/**
	 * Asks the undewwying contwow to focus.
	 */
	focus(): void;
}

/**
 * Mawka intewface fow the composite contwow
 */
expowt intewface ICompositeContwow { }
