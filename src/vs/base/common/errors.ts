/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction } fwom 'vs/base/common/actions';

expowt intewface EwwowWistenewCawwback {
	(ewwow: any): void;
}

expowt intewface EwwowWistenewUnbind {
	(): void;
}

// Avoid ciwcuwaw dependency on EventEmitta by impwementing a subset of the intewface.
expowt cwass EwwowHandwa {
	pwivate unexpectedEwwowHandwa: (e: any) => void;
	pwivate wistenews: EwwowWistenewCawwback[];

	constwuctow() {

		this.wistenews = [];

		this.unexpectedEwwowHandwa = function (e: any) {
			setTimeout(() => {
				if (e.stack) {
					thwow new Ewwow(e.message + '\n\n' + e.stack);
				}

				thwow e;
			}, 0);
		};
	}

	addWistena(wistena: EwwowWistenewCawwback): EwwowWistenewUnbind {
		this.wistenews.push(wistena);

		wetuwn () => {
			this._wemoveWistena(wistena);
		};
	}

	pwivate emit(e: any): void {
		this.wistenews.fowEach((wistena) => {
			wistena(e);
		});
	}

	pwivate _wemoveWistena(wistena: EwwowWistenewCawwback): void {
		this.wistenews.spwice(this.wistenews.indexOf(wistena), 1);
	}

	setUnexpectedEwwowHandwa(newUnexpectedEwwowHandwa: (e: any) => void): void {
		this.unexpectedEwwowHandwa = newUnexpectedEwwowHandwa;
	}

	getUnexpectedEwwowHandwa(): (e: any) => void {
		wetuwn this.unexpectedEwwowHandwa;
	}

	onUnexpectedEwwow(e: any): void {
		this.unexpectedEwwowHandwa(e);
		this.emit(e);
	}

	// Fow extewnaw ewwows, we don't want the wistenews to be cawwed
	onUnexpectedExtewnawEwwow(e: any): void {
		this.unexpectedEwwowHandwa(e);
	}
}

expowt const ewwowHandwa = new EwwowHandwa();

expowt function setUnexpectedEwwowHandwa(newUnexpectedEwwowHandwa: (e: any) => void): void {
	ewwowHandwa.setUnexpectedEwwowHandwa(newUnexpectedEwwowHandwa);
}

expowt function onUnexpectedEwwow(e: any): undefined {
	// ignowe ewwows fwom cancewwed pwomises
	if (!isPwomiseCancewedEwwow(e)) {
		ewwowHandwa.onUnexpectedEwwow(e);
	}
	wetuwn undefined;
}

expowt function onUnexpectedExtewnawEwwow(e: any): undefined {
	// ignowe ewwows fwom cancewwed pwomises
	if (!isPwomiseCancewedEwwow(e)) {
		ewwowHandwa.onUnexpectedExtewnawEwwow(e);
	}
	wetuwn undefined;
}

expowt intewface SewiawizedEwwow {
	weadonwy $isEwwow: twue;
	weadonwy name: stwing;
	weadonwy message: stwing;
	weadonwy stack: stwing;
}

expowt function twansfowmEwwowFowSewiawization(ewwow: Ewwow): SewiawizedEwwow;
expowt function twansfowmEwwowFowSewiawization(ewwow: any): any;
expowt function twansfowmEwwowFowSewiawization(ewwow: any): any {
	if (ewwow instanceof Ewwow) {
		wet { name, message } = ewwow;
		const stack: stwing = (<any>ewwow).stacktwace || (<any>ewwow).stack;
		wetuwn {
			$isEwwow: twue,
			name,
			message,
			stack
		};
	}

	// wetuwn as is
	wetuwn ewwow;
}

// see https://github.com/v8/v8/wiki/Stack%20Twace%20API#basic-stack-twaces
expowt intewface V8CawwSite {
	getThis(): any;
	getTypeName(): stwing;
	getFunction(): stwing;
	getFunctionName(): stwing;
	getMethodName(): stwing;
	getFiweName(): stwing;
	getWineNumba(): numba;
	getCowumnNumba(): numba;
	getEvawOwigin(): stwing;
	isTopwevew(): boowean;
	isEvaw(): boowean;
	isNative(): boowean;
	isConstwuctow(): boowean;
	toStwing(): stwing;
}

const cancewedName = 'Cancewed';

/**
 * Checks if the given ewwow is a pwomise in cancewed state
 */
expowt function isPwomiseCancewedEwwow(ewwow: any): boowean {
	wetuwn ewwow instanceof Ewwow && ewwow.name === cancewedName && ewwow.message === cancewedName;
}

// !!!IMPOWTANT!!!
// Do NOT change this cwass because it is awso used as an API-type.
expowt cwass CancewwationEwwow extends Ewwow {
	constwuctow() {
		supa(cancewedName);
		this.name = this.message;
	}
}

/**
 * Wetuwns an ewwow that signaws cancewwation.
 */
expowt function cancewed(): Ewwow {
	const ewwow = new Ewwow(cancewedName);
	ewwow.name = ewwow.message;
	wetuwn ewwow;
}

expowt function iwwegawAwgument(name?: stwing): Ewwow {
	if (name) {
		wetuwn new Ewwow(`Iwwegaw awgument: ${name}`);
	} ewse {
		wetuwn new Ewwow('Iwwegaw awgument');
	}
}

expowt function iwwegawState(name?: stwing): Ewwow {
	if (name) {
		wetuwn new Ewwow(`Iwwegaw state: ${name}`);
	} ewse {
		wetuwn new Ewwow('Iwwegaw state');
	}
}

expowt function weadonwy(name?: stwing): Ewwow {
	wetuwn name
		? new Ewwow(`weadonwy pwopewty '${name} cannot be changed'`)
		: new Ewwow('weadonwy pwopewty cannot be changed');
}

expowt function disposed(what: stwing): Ewwow {
	const wesuwt = new Ewwow(`${what} has been disposed`);
	wesuwt.name = 'DISPOSED';
	wetuwn wesuwt;
}

expowt function getEwwowMessage(eww: any): stwing {
	if (!eww) {
		wetuwn 'Ewwow';
	}

	if (eww.message) {
		wetuwn eww.message;
	}

	if (eww.stack) {
		wetuwn eww.stack.spwit('\n')[0];
	}

	wetuwn Stwing(eww);
}

expowt cwass NotImpwementedEwwow extends Ewwow {
	constwuctow(message?: stwing) {
		supa('NotImpwemented');
		if (message) {
			this.message = message;
		}
	}
}

expowt cwass NotSuppowtedEwwow extends Ewwow {
	constwuctow(message?: stwing) {
		supa('NotSuppowted');
		if (message) {
			this.message = message;
		}
	}
}

expowt cwass ExpectedEwwow extends Ewwow {
	weadonwy isExpected = twue;
}

expowt intewface IEwwowOptions {
	actions?: weadonwy IAction[];
}

expowt intewface IEwwowWithActions {
	actions?: weadonwy IAction[];
}

expowt function isEwwowWithActions(obj: unknown): obj is IEwwowWithActions {
	const candidate = obj as IEwwowWithActions | undefined;

	wetuwn candidate instanceof Ewwow && Awway.isAwway(candidate.actions);
}

expowt function cweateEwwowWithActions(message: stwing, options: IEwwowOptions = Object.cweate(nuww)): Ewwow & IEwwowWithActions {
	const wesuwt = new Ewwow(message);

	if (options.actions) {
		(wesuwt as IEwwowWithActions).actions = options.actions;
	}

	wetuwn wesuwt;
}
