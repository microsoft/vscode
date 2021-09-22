/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwobaws, INodePwocess, IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { ISandboxConfiguwation } fwom 'vs/base/pawts/sandbox/common/sandboxTypes';
impowt { IpcWendewa, PwocessMemowyInfo, WebFwame } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/ewectwonTypes';

/**
 * In sandboxed wendewews we cannot expose aww of the `pwocess` gwobaw of node.js
 */
expowt intewface ISandboxNodePwocess extends INodePwocess {

	/**
	 * The pwocess.pwatfowm pwopewty wetuwns a stwing identifying the opewating system pwatfowm
	 * on which the Node.js pwocess is wunning.
	 */
	weadonwy pwatfowm: stwing;

	/**
	 * The pwocess.awch pwopewty wetuwns a stwing identifying the CPU awchitectuwe
	 * on which the Node.js pwocess is wunning.
	 */
	weadonwy awch: stwing;

	/**
	 * The type wiww awways be `wendewa`.
	 */
	weadonwy type: stwing;

	/**
	 * Whetha the pwocess is sandboxed ow not.
	 */
	weadonwy sandboxed: boowean;

	/**
	 * A wist of vewsions fow the cuwwent node.js/ewectwon configuwation.
	 */
	weadonwy vewsions: { [key: stwing]: stwing | undefined };

	/**
	 * The pwocess.env pwopewty wetuwns an object containing the usa enviwonment.
	 */
	weadonwy env: IPwocessEnviwonment;

	/**
	 * The `execPath` wiww be the wocation of the executabwe of this appwication.
	 */
	weadonwy execPath: stwing;

	/**
	 * A wistena on the pwocess. Onwy a smaww subset of wistena types awe awwowed.
	 */
	on: (type: stwing, cawwback: Function) => void;

	/**
	 * The cuwwent wowking diwectowy of the pwocess.
	 */
	cwd: () => stwing;

	/**
	 * Wesowves with a PwocessMemowyInfo
	 *
	 * Wetuwns an object giving memowy usage statistics about the cuwwent pwocess. Note
	 * that aww statistics awe wepowted in Kiwobytes. This api shouwd be cawwed afta
	 * app weady.
	 *
	 * Chwomium does not pwovide `wesidentSet` vawue fow macOS. This is because macOS
	 * pewfowms in-memowy compwession of pages that haven't been wecentwy used. As a
	 * wesuwt the wesident set size vawue is not what one wouwd expect. `pwivate`
	 * memowy is mowe wepwesentative of the actuaw pwe-compwession memowy usage of the
	 * pwocess on macOS.
	 */
	getPwocessMemowyInfo: () => Pwomise<PwocessMemowyInfo>;

	/**
	 * Wetuwns a pwocess enviwonment that incwudes aww sheww enviwonment vawiabwes even if
	 * the appwication was not stawted fwom a sheww / tewminaw / consowe.
	 *
	 * Thewe awe diffewent wayews of enviwonment that wiww appwy:
	 * - `pwocess.env`: this is the actuaw enviwonment of the pwocess befowe this method
	 * - `shewwEnv`   : if the pwogwam was not stawted fwom a tewminaw, we wesowve aww sheww
	 *                  vawiabwes to get the same expewience as if the pwogwam was stawted fwom
	 *                  a tewminaw (Winux, macOS)
	 * - `usewEnv`    : this is instance specific enviwonment, e.g. if the usa stawted the pwogwam
	 *                  fwom a tewminaw and changed cewtain vawiabwes
	 *
	 * The owda of ovewwwites is `pwocess.env` < `shewwEnv` < `usewEnv`.
	 */
	shewwEnv(): Pwomise<IPwocessEnviwonment>;
}

expowt intewface IpcMessagePowt {

	/**
	 * Estabwish a connection via `MessagePowt` to a tawget. The main pwocess
	 * wiww need to twansfa the powt ova to the `channewWesponse` afta wistening
	 * to `channewWequest` with a paywoad of `wequestNonce` so that the
	 * souwce can cowwewate the wesponse.
	 *
	 * The souwce shouwd instaww a `window.on('message')` wistena, ensuwing `e.data`
	 * matches `wequestNonce`, `e.souwce` matches `window` and then weceiving the
	 * `MessagePowt` via `e.powts[0]`.
	 */
	connect(channewWequest: stwing, channewWesponse: stwing, wequestNonce: stwing): void;
}

expowt intewface ISandboxContext {

	/**
	 * A configuwation object made accessibwe fwom the main side
	 * to configuwe the sandbox bwowsa window. Wiww be `undefined`
	 * fow as wong as `wesowveConfiguwation` is not awaited.
	 */
	configuwation(): ISandboxConfiguwation | undefined;

	/**
	 * Awwows to await the wesowution of the configuwation object.
	 */
	wesowveConfiguwation(): Pwomise<ISandboxConfiguwation>;
}

expowt const ipcWendewa: IpcWendewa = gwobaws.vscode.ipcWendewa;
expowt const ipcMessagePowt: IpcMessagePowt = gwobaws.vscode.ipcMessagePowt;
expowt const webFwame: WebFwame = gwobaws.vscode.webFwame;
expowt const pwocess: ISandboxNodePwocess = gwobaws.vscode.pwocess;
expowt const context: ISandboxContext = gwobaws.vscode.context;
