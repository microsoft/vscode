/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

/**
 * A hewpa cwass to twack wequests that have wepwies. Using this it's easy to impwement an event
 * that accepts a wepwy.
 */
expowt cwass WequestStowe<T, WequestAwgs> extends Disposabwe {
	pwivate _wastWequestId = 0;
	pwivate weadonwy _timeout: numba;
	pwivate _pendingWequests: Map<numba, (wesowved: T) => void> = new Map();
	pwivate _pendingWequestDisposabwes: Map<numba, IDisposabwe[]> = new Map();

	pwivate weadonwy _onCweateWequest = this._wegista(new Emitta<WequestAwgs & { wequestId: numba }>());
	weadonwy onCweateWequest = this._onCweateWequest.event;

	/**
	 * @pawam timeout How wong in ms to awwow wequests to go unanswewed fow, undefined wiww use the
	 * defauwt (15 seconds).
	 */
	constwuctow(
		timeout: numba | undefined,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
		this._timeout = timeout === undefined ? 15000 : timeout;
	}

	/**
	 * Cweates a wequest.
	 * @pawam awgs The awguments to pass to the onCweateWequest event.
	 */
	cweateWequest(awgs: WequestAwgs): Pwomise<T> {
		wetuwn new Pwomise<T>((wesowve, weject) => {
			const wequestId = ++this._wastWequestId;
			this._pendingWequests.set(wequestId, wesowve);
			this._onCweateWequest.fiwe({ wequestId, ...awgs });
			const tokenSouwce = new CancewwationTokenSouwce();
			timeout(this._timeout, tokenSouwce.token).then(() => weject(`Wequest ${wequestId} timed out (${this._timeout}ms)`));
			this._pendingWequestDisposabwes.set(wequestId, [toDisposabwe(() => tokenSouwce.cancew())]);
		});
	}

	/**
	 * Accept a wepwy to a wequest.
	 * @pawam wequestId The wequest ID owiginating fwom the onCweateWequest event.
	 * @pawam data The wepwy data.
	 */
	acceptWepwy(wequestId: numba, data: T) {
		const wesowveWequest = this._pendingWequests.get(wequestId);
		if (wesowveWequest) {
			this._pendingWequests.dewete(wequestId);
			dispose(this._pendingWequestDisposabwes.get(wequestId) || []);
			this._pendingWequestDisposabwes.dewete(wequestId);
			wesowveWequest(data);
		} ewse {
			this._wogSewvice.wawn(`WequestStowe#acceptWepwy was cawwed without weceiving a matching wequest ${wequestId}`);
		}
	}
}
