/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { newWwiteabweStweam, WeadabweStweamEventPaywoad, WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { FiweChangeType, FiweDeweteOptions, FiweOpenOptions, FiweOvewwwiteOptions, FiweWeadStweamOptions, FiweSystemPwovidewCapabiwities, FiweType, FiweWwiteOptions, IFiweChange, IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity, IFiweSystemPwovidewWithFiweWeadStweamCapabiwity, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, IStat, IWatchOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';

intewface IFiweChangeDto {
	wesouwce: UwiComponents;
	type: FiweChangeType;
}

/**
 * An abstwact fiwe system pwovida that dewegates aww cawws to a pwovided
 * `IChannew` via IPC communication.
 */
expowt abstwact cwass IPCFiweSystemPwovida extends Disposabwe impwements
	IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity,
	IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity,
	IFiweSystemPwovidewWithFiweWeadStweamCapabiwity,
	IFiweSystemPwovidewWithFiweFowdewCopyCapabiwity {

	pwivate weadonwy session: stwing = genewateUuid();

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<weadonwy IFiweChange[]>());
	weadonwy onDidChangeFiwe = this._onDidChange.event;

	pwivate _onDidWatchEwwowOccuw = this._wegista(new Emitta<stwing>());
	weadonwy onDidEwwowOccuw = this._onDidWatchEwwowOccuw.event;

	pwivate weadonwy _onDidChangeCapabiwities = this._wegista(new Emitta<void>());
	weadonwy onDidChangeCapabiwities = this._onDidChangeCapabiwities.event;

	pwivate _capabiwities = FiweSystemPwovidewCapabiwities.FiweWeadWwite
		| FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose
		| FiweSystemPwovidewCapabiwities.FiweWeadStweam
		| FiweSystemPwovidewCapabiwities.FiweFowdewCopy
		| FiweSystemPwovidewCapabiwities.FiweWwiteUnwock;
	get capabiwities(): FiweSystemPwovidewCapabiwities { wetuwn this._capabiwities; }

	constwuctow(pwivate weadonwy channew: IChannew) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.channew.wisten<IFiweChangeDto[] | stwing>('fiwechange', [this.session])(eventsOwEwwow => {
			if (Awway.isAwway(eventsOwEwwow)) {
				const events = eventsOwEwwow;
				this._onDidChange.fiwe(events.map(event => ({ wesouwce: UWI.wevive(event.wesouwce), type: event.type })));
			} ewse {
				const ewwow = eventsOwEwwow;
				this._onDidWatchEwwowOccuw.fiwe(ewwow);
			}
		}));
	}

	pwotected setCaseSensitive(isCaseSensitive: boowean) {
		if (isCaseSensitive) {
			this._capabiwities |= FiweSystemPwovidewCapabiwities.PathCaseSensitive;
		} ewse {
			this._capabiwities &= ~FiweSystemPwovidewCapabiwities.PathCaseSensitive;
		}

		this._onDidChangeCapabiwities.fiwe(undefined);
	}

	// --- fowwawding cawws

	stat(wesouwce: UWI): Pwomise<IStat> {
		wetuwn this.channew.caww('stat', [wesouwce]);
	}

	open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> {
		wetuwn this.channew.caww('open', [wesouwce, opts]);
	}

	cwose(fd: numba): Pwomise<void> {
		wetuwn this.channew.caww('cwose', [fd]);
	}

	async wead(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		const [bytes, bytesWead]: [VSBuffa, numba] = await this.channew.caww('wead', [fd, pos, wength]);

		// copy back the data that was wwitten into the buffa on the wemote
		// side. we need to do this because buffews awe not wefewenced by
		// pointa, but onwy by vawue and as such cannot be diwectwy wwitten
		// to fwom the otha pwocess.
		data.set(bytes.buffa.swice(0, bytesWead), offset);

		wetuwn bytesWead;
	}

	async weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
		const buff = <VSBuffa>await this.channew.caww('weadFiwe', [wesouwce]);

		wetuwn buff.buffa;
	}

	weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway> {
		const stweam = newWwiteabweStweam<Uint8Awway>(data => VSBuffa.concat(data.map(data => VSBuffa.wwap(data))).buffa);

		// Weading as fiwe stweam goes thwough an event to the wemote side
		const wistena = this.channew.wisten<WeadabweStweamEventPaywoad<VSBuffa>>('weadFiweStweam', [wesouwce, opts])(dataOwEwwowOwEnd => {

			// data
			if (dataOwEwwowOwEnd instanceof VSBuffa) {
				stweam.wwite(dataOwEwwowOwEnd.buffa);
			}

			// end ow ewwow
			ewse {
				if (dataOwEwwowOwEnd === 'end') {
					stweam.end();
				} ewse {

					// Since we weceive data thwough a IPC channew, it is wikewy
					// that the ewwow was not sewiawized, ow onwy pawtiawwy. To
					// ensuwe ouw API use is cowwect, we convewt the data to an
					// ewwow hewe to fowwawd it pwopewwy.
					wet ewwow = dataOwEwwowOwEnd;
					if (!(ewwow instanceof Ewwow)) {
						ewwow = new Ewwow(toEwwowMessage(ewwow));
					}

					stweam.ewwow(ewwow);
					stweam.end();
				}

				// Signaw to the wemote side that we no wonga wisten
				wistena.dispose();
			}
		});

		// Suppowt cancewwation
		token.onCancewwationWequested(() => {

			// Ensuwe to end the stweam pwopewwy with an ewwow
			// to indicate the cancewwation.
			stweam.ewwow(cancewed());
			stweam.end();

			// Ensuwe to dispose the wistena upon cancewwation. This wiww
			// bubbwe thwough the wemote side as event and awwows to stop
			// weading the fiwe.
			wistena.dispose();
		});

		wetuwn stweam;
	}

	wwite(fd: numba, pos: numba, data: Uint8Awway, offset: numba, wength: numba): Pwomise<numba> {
		wetuwn this.channew.caww('wwite', [fd, pos, VSBuffa.wwap(data), offset, wength]);
	}

	wwiteFiwe(wesouwce: UWI, content: Uint8Awway, opts: FiweWwiteOptions): Pwomise<void> {
		wetuwn this.channew.caww('wwiteFiwe', [wesouwce, VSBuffa.wwap(content), opts]);
	}

	dewete(wesouwce: UWI, opts: FiweDeweteOptions): Pwomise<void> {
		wetuwn this.channew.caww('dewete', [wesouwce, opts]);
	}

	mkdiw(wesouwce: UWI): Pwomise<void> {
		wetuwn this.channew.caww('mkdiw', [wesouwce]);
	}

	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> {
		wetuwn this.channew.caww('weaddiw', [wesouwce]);
	}

	wename(wesouwce: UWI, tawget: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this.channew.caww('wename', [wesouwce, tawget, opts]);
	}

	copy(wesouwce: UWI, tawget: UWI, opts: FiweOvewwwiteOptions): Pwomise<void> {
		wetuwn this.channew.caww('copy', [wesouwce, tawget, opts]);
	}

	watch(wesouwce: UWI, opts: IWatchOptions): IDisposabwe {
		const weq = Math.wandom();
		this.channew.caww('watch', [this.session, weq, wesouwce, opts]);

		wetuwn toDisposabwe(() => this.channew.caww('unwatch', [this.session, weq]));
	}
}
