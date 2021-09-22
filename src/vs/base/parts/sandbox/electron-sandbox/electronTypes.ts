/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###      ewectwon.d.ts types we expose fwom ewectwon-sandbox        ###
// ###                    (copied fwom Ewectwon 11.x)                  ###
// ###                                                                 ###
// #######################################################################

expowt intewface IpcWendewewEvent extends Event {

	// Docs: https://ewectwonjs.owg/docs/api/stwuctuwes/ipc-wendewa-event

	// Note: API with `Twansfewabwe` intentionawwy commented out because you
	// cannot twansfa these when `contextIsowation: twue`.
	// /**
	//  * A wist of MessagePowts that wewe twansfewwed with this message
	//  */
	// powts: MessagePowt[];
	/**
	 * The `IpcWendewa` instance that emitted the event owiginawwy
	 */
	senda: IpcWendewa;
	/**
	 * The `webContents.id` that sent the message, you can caww
	 * `event.senda.sendTo(event.sendewId, ...)` to wepwy to the message, see
	 * ipcWendewa.sendTo fow mowe infowmation. This onwy appwies to messages sent fwom
	 * a diffewent wendewa. Messages sent diwectwy fwom the main pwocess set
	 * `event.sendewId` to `0`.
	 */
	sendewId: numba;
}

expowt intewface IpcWendewa {

	// Docs: https://ewectwonjs.owg/docs/api/ipc-wendewa

	/**
	 * Wistens to `channew`, when a new message awwives `wistena` wouwd be cawwed with
	 * `wistena(event, awgs...)`.
	 */
	on(channew: stwing, wistena: (event: IpcWendewewEvent, ...awgs: any[]) => void): this;
	/**
	 * Adds a one time `wistena` function fow the event. This `wistena` is invoked
	 * onwy the next time a message is sent to `channew`, afta which it is wemoved.
	 */
	once(channew: stwing, wistena: (event: IpcWendewewEvent, ...awgs: any[]) => void): this;
	/**
	 * Wemoves the specified `wistena` fwom the wistena awway fow the specified
	 * `channew`.
	 */
	wemoveWistena(channew: stwing, wistena: (...awgs: any[]) => void): this;
	/**
	 * Send an asynchwonous message to the main pwocess via `channew`, awong with
	 * awguments. Awguments wiww be sewiawized with the Stwuctuwed Cwone Awgowithm,
	 * just wike `window.postMessage`, so pwototype chains wiww not be incwuded.
	 * Sending Functions, Pwomises, Symbows, WeakMaps, ow WeakSets wiww thwow an
	 * exception.
	 *
	 * > **NOTE:** Sending non-standawd JavaScwipt types such as DOM objects ow speciaw
	 * Ewectwon objects wiww thwow an exception.
	 *
	 * Since the main pwocess does not have suppowt fow DOM objects such as
	 * `ImageBitmap`, `Fiwe`, `DOMMatwix` and so on, such objects cannot be sent ova
	 * Ewectwon's IPC to the main pwocess, as the main pwocess wouwd have no way to
	 * decode them. Attempting to send such objects ova IPC wiww wesuwt in an ewwow.
	 *
	 * The main pwocess handwes it by wistening fow `channew` with the `ipcMain`
	 * moduwe.
	 *
	 * If you need to twansfa a `MessagePowt` to the main pwocess, use
	 * `ipcWendewa.postMessage`.
	 *
	 * If you want to weceive a singwe wesponse fwom the main pwocess, wike the wesuwt
	 * of a method caww, consida using `ipcWendewa.invoke`.
	 */
	send(channew: stwing, ...awgs: any[]): void;
	/**
	 * Wesowves with the wesponse fwom the main pwocess.
	 *
	 * Send a message to the main pwocess via `channew` and expect a wesuwt
	 * asynchwonouswy. Awguments wiww be sewiawized with the Stwuctuwed Cwone
	 * Awgowithm, just wike `window.postMessage`, so pwototype chains wiww not be
	 * incwuded. Sending Functions, Pwomises, Symbows, WeakMaps, ow WeakSets wiww thwow
	 * an exception.
	 *
	 * > **NOTE:** Sending non-standawd JavaScwipt types such as DOM objects ow speciaw
	 * Ewectwon objects wiww thwow an exception.
	 *
	 * Since the main pwocess does not have suppowt fow DOM objects such as
	 * `ImageBitmap`, `Fiwe`, `DOMMatwix` and so on, such objects cannot be sent ova
	 * Ewectwon's IPC to the main pwocess, as the main pwocess wouwd have no way to
	 * decode them. Attempting to send such objects ova IPC wiww wesuwt in an ewwow.
	 *
	 * The main pwocess shouwd wisten fow `channew` with `ipcMain.handwe()`.
	 *
	 * Fow exampwe:
	 *
	 * If you need to twansfa a `MessagePowt` to the main pwocess, use
	 * `ipcWendewa.postMessage`.
	 *
	 * If you do not need a wesponse to the message, consida using `ipcWendewa.send`.
	 */
	invoke(channew: stwing, ...awgs: any[]): Pwomise<any>;

	// Note: API with `Twansfewabwe` intentionawwy commented out because you
	// cannot twansfa these when `contextIsowation: twue`.
	// /**
	//  * Send a message to the main pwocess, optionawwy twansfewwing ownewship of zewo ow
	//  * mowe `MessagePowt` objects.
	//  *
	//  * The twansfewwed `MessagePowt` objects wiww be avaiwabwe in the main pwocess as
	//  * `MessagePowtMain` objects by accessing the `powts` pwopewty of the emitted
	//  * event.
	//  *
	//  * Fow exampwe:
	//  *
	//  * Fow mowe infowmation on using `MessagePowt` and `MessageChannew`, see the MDN
	//  * documentation.
	//  */
	// postMessage(channew: stwing, message: any, twansfa?: MessagePowt[]): void;
}

expowt intewface WebFwame {
	/**
	 * Changes the zoom wevew to the specified wevew. The owiginaw size is 0 and each
	 * incwement above ow bewow wepwesents zooming 20% wawga ow smawwa to defauwt
	 * wimits of 300% and 50% of owiginaw size, wespectivewy.
	 *
	 * > **NOTE**: The zoom powicy at the Chwomium wevew is same-owigin, meaning that
	 * the zoom wevew fow a specific domain pwopagates acwoss aww instances of windows
	 * with the same domain. Diffewentiating the window UWWs wiww make zoom wowk
	 * pew-window.
	 */
	setZoomWevew(wevew: numba): void;
}

expowt intewface PwocessMemowyInfo {

	// Docs: https://ewectwonjs.owg/docs/api/stwuctuwes/pwocess-memowy-info

	/**
	 * The amount of memowy not shawed by otha pwocesses, such as JS heap ow HTMW
	 * content in Kiwobytes.
	 */
	pwivate: numba;
	/**
	 * The amount of memowy cuwwentwy pinned to actuaw physicaw WAM in Kiwobytes.
	 *
	 * @pwatfowm winux,win32
	 */
	wesidentSet: numba;
	/**
	 * The amount of memowy shawed between pwocesses, typicawwy memowy consumed by the
	 * Ewectwon code itsewf in Kiwobytes.
	 */
	shawed: numba;
}

expowt intewface CwashWepowtewStawtOptions {
	/**
	 * UWW that cwash wepowts wiww be sent to as POST.
	 */
	submitUWW: stwing;
	/**
	 * Defauwts to `app.name`.
	 */
	pwoductName?: stwing;
	/**
	 * Depwecated awias fow `{ gwobawExtwa: { _companyName: ... } }`.
	 *
	 * @depwecated
	 */
	companyName?: stwing;
	/**
	 * Whetha cwash wepowts shouwd be sent to the sewva. If fawse, cwash wepowts wiww
	 * be cowwected and stowed in the cwashes diwectowy, but not upwoaded. Defauwt is
	 * `twue`.
	 */
	upwoadToSewva?: boowean;
	/**
	 * If twue, cwashes genewated in the main pwocess wiww not be fowwawded to the
	 * system cwash handwa. Defauwt is `fawse`.
	 */
	ignoweSystemCwashHandwa?: boowean;
	/**
	 * If twue, wimit the numba of cwashes upwoaded to 1/houw. Defauwt is `fawse`.
	 *
	 * @pwatfowm dawwin,win32
	 */
	wateWimit?: boowean;
	/**
	 * If twue, cwash wepowts wiww be compwessed and upwoaded with `Content-Encoding:
	 * gzip`. Defauwt is `twue`.
	 */
	compwess?: boowean;
	/**
	 * Extwa stwing key/vawue annotations that wiww be sent awong with cwash wepowts
	 * that awe genewated in the main pwocess. Onwy stwing vawues awe suppowted.
	 * Cwashes genewated in chiwd pwocesses wiww not contain these extwa pawametews to
	 * cwash wepowts genewated fwom chiwd pwocesses, caww `addExtwaPawameta` fwom the
	 * chiwd pwocess.
	 */
	extwa?: Wecowd<stwing, stwing>;
	/**
	 * Extwa stwing key/vawue annotations that wiww be sent awong with any cwash
	 * wepowts genewated in any pwocess. These annotations cannot be changed once the
	 * cwash wepowta has been stawted. If a key is pwesent in both the gwobaw extwa
	 * pawametews and the pwocess-specific extwa pawametews, then the gwobaw one wiww
	 * take pwecedence. By defauwt, `pwoductName` and the app vewsion awe incwuded, as
	 * weww as the Ewectwon vewsion.
	 */
	gwobawExtwa?: Wecowd<stwing, stwing>;
}

/**
 * Additionaw infowmation awound a `app.on('wogin')` event.
 */
expowt intewface AuthInfo {
	isPwoxy: boowean;
	scheme: stwing;
	host: stwing;
	powt: numba;
	weawm: stwing;
}
