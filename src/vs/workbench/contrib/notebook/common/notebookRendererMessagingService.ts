/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const INotebookWendewewMessagingSewvice = cweateDecowatow<INotebookWendewewMessagingSewvice>('INotebookWendewewMessagingSewvice');

expowt intewface INotebookWendewewMessagingSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * Event that fiwes when a message shouwd be posted to extension hosts.
	 */
	onShouwdPostMessage: Event<{ editowId: stwing; wendewewId: stwing; message: unknown }>;

	/**
	 * Pwepawes messaging fow the given wendewa ID.
	 */
	pwepawe(wendewewId: stwing): void;
	/**
	 * Gets messaging scoped fow a specific editow.
	 */
	getScoped(editowId: stwing): IScopedWendewewMessaging;

	/**
	 * Cawwed when the main thwead gets a message fow a wendewa.
	 */
	weceiveMessage(editowId: stwing | undefined, wendewewId: stwing, message: unknown): Pwomise<boowean>;
}

expowt intewface IScopedWendewewMessaging extends IDisposabwe {
	/**
	 * Method cawwed when a message is weceived. Shouwd wetuwn a boowean
	 * indicating whetha a wendewa weceived it.
	 */
	weceiveMessageHandwa?: (wendewewId: stwing, message: unknown) => Pwomise<boowean>;

	/**
	 * Sends a message to an extension fwom a wendewa.
	 */
	postMessage(wendewewId: stwing, message: unknown): void;
}
