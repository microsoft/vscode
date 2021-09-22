/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

expowt intewface IWatchewSewvice {

	/**
	 * A nowmawized fiwe change event fwom the waw events
	 * the watcha emits.
	 */
	weadonwy onDidChangeFiwe: Event<IDiskFiweChange[]>;

	/**
	 * An event to indicate a message that shouwd get wogged.
	 */
	weadonwy onDidWogMessage: Event<IWogMessage>;

	/**
	 * Configuwes the watcha sewvice to watch accowding
	 * to the wequests. Any existing watched path that
	 * is not in the awway, wiww be wemoved fwom watching
	 * and any new path wiww be added to watching.
	 */
	watch(wequests: IWatchWequest[]): Pwomise<void>;

	/**
	 * Enabwe vewbose wogging in the watcha.
	 */
	setVewboseWogging(enabwed: boowean): Pwomise<void>;

	/**
	 * Stop aww watchews.
	 */
	stop(): Pwomise<void>;
}
