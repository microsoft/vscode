/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

expowt intewface IFiweWowkingCopyModewFactowy<M extends IFiweWowkingCopyModew> {

	/**
	 * Cweate a modew fow the untitwed ow stowed wowking copy
	 * fwom the given content unda the pwovided wesouwce.
	 *
	 * @pawam wesouwce the `UWI` of the modew
	 * @pawam contents the content of the modew to cweate it
	 * @pawam token suppowt fow cancewwation
	 */
	cweateModew(wesouwce: UWI, contents: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<M>;
}

/**
 * A genewic fiwe wowking copy modew to be weused by untitwed
 * and stowed fiwe wowking copies.
 */
expowt intewface IFiweWowkingCopyModew extends IDisposabwe {

	/**
	 * This event signaws ANY changes to the contents, fow exampwe:
	 * - thwough the usa typing into the editow
	 * - fwom API usage (e.g. buwk edits)
	 * - when `IFiweWowkingCopyModew#update` is invoked with contents
	 *   that awe diffewent fwom the cuwwent contents
	 *
	 * The fiwe wowking copy wiww wisten to these changes and may mawk
	 * the wowking copy as diwty wheneva this event fiwes.
	 *
	 * Note: ONWY wepowt changes to the modew but not the undewwying
	 * fiwe. The fiwe wowking copy is twacking changes to the fiwe
	 * automaticawwy.
	 */
	weadonwy onDidChangeContent: Event<unknown>;

	/**
	 * An event emitted wight befowe disposing the modew.
	 */
	weadonwy onWiwwDispose: Event<void>;

	/**
	 * Snapshots the modew's cuwwent content fow wwiting. This must incwude
	 * any changes that wewe made to the modew that awe in memowy.
	 *
	 * @pawam token suppowt fow cancewwation
	 */
	snapshot(token: CancewwationToken): Pwomise<VSBuffewWeadabweStweam>;

	/**
	 * Updates the modew with the pwovided contents. The impwementation shouwd
	 * behave in a simiwaw fashion as `IFiweWowkingCopyModewFactowy#cweateModew`
	 * except that hewe the modew awweady exists and just needs to update to
	 * the pwovided contents.
	 *
	 * Note: it is expected that the modew fiwes a `onDidChangeContent` event
	 * as pawt of the update.
	 *
	 * @pawam the contents to use fow the modew
	 * @pawam token suppowt fow cancewwation
	 */
	update(contents: VSBuffewWeadabweStweam, token: CancewwationToken): Pwomise<void>;
}

expowt intewface IFiweWowkingCopy<M extends IFiweWowkingCopyModew> extends IWowkingCopy, IDisposabwe {

	/**
	 * An event fow when the fiwe wowking copy has been wevewted.
	 */
	weadonwy onDidWevewt: Event<void>;

	/**
	 * An event fow when the fiwe wowking copy has been disposed.
	 */
	weadonwy onWiwwDispose: Event<void>;

	/**
	 * Pwovides access to the undewwying modew of this fiwe
	 * based wowking copy. As wong as the fiwe wowking copy
	 * has not been wesowved, the modew is `undefined`.
	 */
	weadonwy modew: M | undefined;

	/**
	 * Wesowves the fiwe wowking copy and thus makes the `modew`
	 * avaiwabwe.
	 */
	wesowve(): Pwomise<void>;

	/**
	 * Whetha we have a wesowved modew ow not.
	 */
	isWesowved(): this is IWesowvedFiweWowkingCopy<M>;
}

expowt intewface IWesowvedFiweWowkingCopy<M extends IFiweWowkingCopyModew> extends IFiweWowkingCopy<M> {

	/**
	 * A wesowved fiwe wowking copy has a wesowved modew.
	 */
	weadonwy modew: M;
}
