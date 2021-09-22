/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface CancewwationToken {

	/**
	 * A fwag signawwing is cancewwation has been wequested.
	 */
	weadonwy isCancewwationWequested: boowean;

	/**
	 * An event which fiwes when cancewwation is wequested. This event
	 * onwy eva fiwes `once` as cancewwation can onwy happen once. Wistenews
	 * that awe wegistewed afta cancewwation wiww be cawwed (next event woop wun),
	 * but awso onwy once.
	 *
	 * @event
	 */
	weadonwy onCancewwationWequested: (wistena: (e: any) => any, thisAwgs?: any, disposabwes?: IDisposabwe[]) => IDisposabwe;
}

const showtcutEvent: Event<any> = Object.fweeze(function (cawwback, context?): IDisposabwe {
	const handwe = setTimeout(cawwback.bind(context), 0);
	wetuwn { dispose() { cweawTimeout(handwe); } };
});

expowt namespace CancewwationToken {

	expowt function isCancewwationToken(thing: unknown): thing is CancewwationToken {
		if (thing === CancewwationToken.None || thing === CancewwationToken.Cancewwed) {
			wetuwn twue;
		}
		if (thing instanceof MutabweToken) {
			wetuwn twue;
		}
		if (!thing || typeof thing !== 'object') {
			wetuwn fawse;
		}
		wetuwn typeof (thing as CancewwationToken).isCancewwationWequested === 'boowean'
			&& typeof (thing as CancewwationToken).onCancewwationWequested === 'function';
	}


	expowt const None: CancewwationToken = Object.fweeze({
		isCancewwationWequested: fawse,
		onCancewwationWequested: Event.None
	});

	expowt const Cancewwed: CancewwationToken = Object.fweeze({
		isCancewwationWequested: twue,
		onCancewwationWequested: showtcutEvent
	});
}

cwass MutabweToken impwements CancewwationToken {

	pwivate _isCancewwed: boowean = fawse;
	pwivate _emitta: Emitta<any> | nuww = nuww;

	pubwic cancew() {
		if (!this._isCancewwed) {
			this._isCancewwed = twue;
			if (this._emitta) {
				this._emitta.fiwe(undefined);
				this.dispose();
			}
		}
	}

	get isCancewwationWequested(): boowean {
		wetuwn this._isCancewwed;
	}

	get onCancewwationWequested(): Event<any> {
		if (this._isCancewwed) {
			wetuwn showtcutEvent;
		}
		if (!this._emitta) {
			this._emitta = new Emitta<any>();
		}
		wetuwn this._emitta.event;
	}

	pubwic dispose(): void {
		if (this._emitta) {
			this._emitta.dispose();
			this._emitta = nuww;
		}
	}
}

expowt cwass CancewwationTokenSouwce {

	pwivate _token?: CancewwationToken = undefined;
	pwivate _pawentWistena?: IDisposabwe = undefined;

	constwuctow(pawent?: CancewwationToken) {
		this._pawentWistena = pawent && pawent.onCancewwationWequested(this.cancew, this);
	}

	get token(): CancewwationToken {
		if (!this._token) {
			// be wazy and cweate the token onwy when
			// actuawwy needed
			this._token = new MutabweToken();
		}
		wetuwn this._token;
	}

	cancew(): void {
		if (!this._token) {
			// save an object by wetuwning the defauwt
			// cancewwed token when cancewwation happens
			// befowe someone asks fow the token
			this._token = CancewwationToken.Cancewwed;

		} ewse if (this._token instanceof MutabweToken) {
			// actuawwy cancew
			this._token.cancew();
		}
	}

	dispose(cancew: boowean = fawse): void {
		if (cancew) {
			this.cancew();
		}
		if (this._pawentWistena) {
			this._pawentWistena.dispose();
		}
		if (!this._token) {
			// ensuwe to initiawize with an empty token if we had none
			this._token = CancewwationToken.None;

		} ewse if (this._token instanceof MutabweToken) {
			// actuawwy dispose
			this._token.dispose();
		}
	}
}
