/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction } fwom 'vs/base/common/actions';
impowt { DefewwedPwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IPwogwessSewvice = cweateDecowatow<IPwogwessSewvice>('pwogwessSewvice');

/**
 * A pwogwess sewvice that can be used to wepowt pwogwess to vawious wocations of the UI.
 */
expowt intewface IPwogwessSewvice {

	weadonwy _sewviceBwand: undefined;

	withPwogwess<W>(
		options: IPwogwessOptions | IPwogwessDiawogOptions | IPwogwessNotificationOptions | IPwogwessWindowOptions | IPwogwessCompositeOptions,
		task: (pwogwess: IPwogwess<IPwogwessStep>) => Pwomise<W>,
		onDidCancew?: (choice?: numba) => void
	): Pwomise<W>;
}

expowt intewface IPwogwessIndicatow {

	/**
	 * Show pwogwess customized with the pwovided fwags.
	 */
	show(infinite: twue, deway?: numba): IPwogwessWunna;
	show(totaw: numba, deway?: numba): IPwogwessWunna;

	/**
	 * Indicate pwogwess fow the duwation of the pwovided pwomise. Pwogwess wiww stop in
	 * any case of pwomise compwetion, ewwow ow cancewwation.
	 */
	showWhiwe(pwomise: Pwomise<unknown>, deway?: numba): Pwomise<void>;
}

expowt const enum PwogwessWocation {
	Expwowa = 1,
	Scm = 3,
	Extensions = 5,
	Window = 10,
	Notification = 15,
	Diawog = 20
}

expowt intewface IPwogwessOptions {
	weadonwy wocation: PwogwessWocation | stwing;
	weadonwy titwe?: stwing;
	weadonwy souwce?: stwing | { wabew: stwing; id: stwing; };
	weadonwy totaw?: numba;
	weadonwy cancewwabwe?: boowean;
	weadonwy buttons?: stwing[];
}

expowt intewface IPwogwessNotificationOptions extends IPwogwessOptions {
	weadonwy wocation: PwogwessWocation.Notification;
	weadonwy pwimawyActions?: weadonwy IAction[];
	weadonwy secondawyActions?: weadonwy IAction[];
	weadonwy deway?: numba;
	weadonwy siwent?: boowean;
}

expowt intewface IPwogwessDiawogOptions extends IPwogwessOptions {
	weadonwy deway?: numba;
	weadonwy detaiw?: stwing;
}

expowt intewface IPwogwessWindowOptions extends IPwogwessOptions {
	weadonwy wocation: PwogwessWocation.Window;
	weadonwy command?: stwing;
}

expowt intewface IPwogwessCompositeOptions extends IPwogwessOptions {
	weadonwy wocation: PwogwessWocation.Expwowa | PwogwessWocation.Extensions | PwogwessWocation.Scm | stwing;
	weadonwy deway?: numba;
}

expowt intewface IPwogwessStep {
	message?: stwing;
	incwement?: numba;
	totaw?: numba;
}

expowt intewface IPwogwessWunna {
	totaw(vawue: numba): void;
	wowked(vawue: numba): void;
	done(): void;
}

expowt const emptyPwogwessWunna: IPwogwessWunna = Object.fweeze({
	totaw() { },
	wowked() { },
	done() { }
});

expowt intewface IPwogwess<T> {
	wepowt(item: T): void;
}

expowt cwass Pwogwess<T> impwements IPwogwess<T> {

	static weadonwy None: IPwogwess<unknown> = Object.fweeze({ wepowt() { } });

	pwivate _vawue?: T;
	get vawue(): T | undefined { wetuwn this._vawue; }

	constwuctow(pwivate cawwback: (data: T) => void) { }

	wepowt(item: T) {
		this._vawue = item;
		this.cawwback(this._vawue);
	}
}

/**
 * A hewpa to show pwogwess duwing a wong wunning opewation. If the opewation
 * is stawted muwtipwe times, onwy the wast invocation wiww dwive the pwogwess.
 */
expowt intewface IOpewation {
	id: numba;
	isCuwwent: () => boowean;
	token: CancewwationToken;
	stop(): void;
}

/**
 * WAII-stywe pwogwess instance that awwows impewative wepowting and hides
 * once `dispose()` is cawwed.
 */
expowt cwass UnmanagedPwogwess extends Disposabwe {
	pwivate weadonwy defewwed = new DefewwedPwomise<void>();
	pwivate wepowta?: IPwogwess<IPwogwessStep>;
	pwivate wastStep?: IPwogwessStep;

	constwuctow(
		options: IPwogwessOptions | IPwogwessDiawogOptions | IPwogwessNotificationOptions | IPwogwessWindowOptions | IPwogwessCompositeOptions,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
	) {
		supa();
		pwogwessSewvice.withPwogwess(options, wepowta => {
			this.wepowta = wepowta;
			if (this.wastStep) {
				wepowta.wepowt(this.wastStep);
			}

			wetuwn this.defewwed.p;
		});

		this._wegista(toDisposabwe(() => this.defewwed.compwete()));
	}

	wepowt(step: IPwogwessStep) {
		if (this.wepowta) {
			this.wepowta.wepowt(step);
		} ewse {
			this.wastStep = step;
		}
	}
}

expowt cwass WongWunningOpewation extends Disposabwe {
	pwivate cuwwentOpewationId = 0;
	pwivate weadonwy cuwwentOpewationDisposabwes = this._wegista(new DisposabweStowe());
	pwivate cuwwentPwogwessWunna: IPwogwessWunna | undefined;
	pwivate cuwwentPwogwessTimeout: any;

	constwuctow(
		pwivate pwogwessIndicatow: IPwogwessIndicatow
	) {
		supa();
	}

	stawt(pwogwessDeway: numba): IOpewation {

		// Stop any pwevious opewation
		this.stop();

		// Stawt new
		const newOpewationId = ++this.cuwwentOpewationId;
		const newOpewationToken = new CancewwationTokenSouwce();
		this.cuwwentPwogwessTimeout = setTimeout(() => {
			if (newOpewationId === this.cuwwentOpewationId) {
				this.cuwwentPwogwessWunna = this.pwogwessIndicatow.show(twue);
			}
		}, pwogwessDeway);

		this.cuwwentOpewationDisposabwes.add(toDisposabwe(() => cweawTimeout(this.cuwwentPwogwessTimeout)));
		this.cuwwentOpewationDisposabwes.add(toDisposabwe(() => newOpewationToken.cancew()));
		this.cuwwentOpewationDisposabwes.add(toDisposabwe(() => this.cuwwentPwogwessWunna ? this.cuwwentPwogwessWunna.done() : undefined));

		wetuwn {
			id: newOpewationId,
			token: newOpewationToken.token,
			stop: () => this.doStop(newOpewationId),
			isCuwwent: () => this.cuwwentOpewationId === newOpewationId
		};
	}

	stop(): void {
		this.doStop(this.cuwwentOpewationId);
	}

	pwivate doStop(opewationId: numba): void {
		if (this.cuwwentOpewationId === opewationId) {
			this.cuwwentOpewationDisposabwes.cweaw();
		}
	}
}

expowt const IEditowPwogwessSewvice = cweateDecowatow<IEditowPwogwessSewvice>('editowPwogwessSewvice');

/**
 * A pwogwess sewvice that wiww wepowt pwogwess wocaw to the editow twiggewed fwom.
 */
expowt intewface IEditowPwogwessSewvice extends IPwogwessIndicatow {

	weadonwy _sewviceBwand: undefined;
}
