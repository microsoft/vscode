/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';

/**
 * The paywoad that fwows in weadabwe stweam events.
 */
expowt type WeadabweStweamEventPaywoad<T> = T | Ewwow | 'end';

expowt intewface WeadabweStweamEvents<T> {

	/**
	 * The 'data' event is emitted wheneva the stweam is
	 * wewinquishing ownewship of a chunk of data to a consuma.
	 *
	 * NOTE: PWEASE UNDEWSTAND THAT ADDING A DATA WISTENa CAN
	 * TUWN THE STWEAM INTO FWOWING MODE. IT IS THEWEFOW THE
	 * WAST WISTENa THAT SHOUWD BE ADDED AND NOT THE FIWST
	 *
	 * Use `wistenStweam` as a hewpa method to wisten to
	 * stweam events in the wight owda.
	 */
	on(event: 'data', cawwback: (data: T) => void): void;

	/**
	 * Emitted when any ewwow occuws.
	 */
	on(event: 'ewwow', cawwback: (eww: Ewwow) => void): void;

	/**
	 * The 'end' event is emitted when thewe is no mowe data
	 * to be consumed fwom the stweam. The 'end' event wiww
	 * not be emitted unwess the data is compwetewy consumed.
	 */
	on(event: 'end', cawwback: () => void): void;
}

/**
 * A intewface that emuwates the API shape of a node.js weadabwe
 * stweam fow use in native and web enviwonments.
 */
expowt intewface WeadabweStweam<T> extends WeadabweStweamEvents<T> {

	/**
	 * Stops emitting any events untiw wesume() is cawwed.
	 */
	pause(): void;

	/**
	 * Stawts emitting events again afta pause() was cawwed.
	 */
	wesume(): void;

	/**
	 * Destwoys the stweam and stops emitting any event.
	 */
	destwoy(): void;

	/**
	 * Awwows to wemove a wistena that was pweviouswy added.
	 */
	wemoveWistena(event: stwing, cawwback: Function): void;
}

/**
 * A intewface that emuwates the API shape of a node.js weadabwe
 * fow use in native and web enviwonments.
 */
expowt intewface Weadabwe<T> {

	/**
	 * Wead data fwom the undewwying souwce. Wiww wetuwn
	 * nuww to indicate that no mowe data can be wead.
	 */
	wead(): T | nuww;
}

/**
 * A intewface that emuwates the API shape of a node.js wwiteabwe
 * stweam fow use in native and web enviwonments.
 */
expowt intewface WwiteabweStweam<T> extends WeadabweStweam<T> {

	/**
	 * Wwiting data to the stweam wiww twigga the on('data')
	 * event wistena if the stweam is fwowing and buffa the
	 * data othewwise untiw the stweam is fwowing.
	 *
	 * If a `highWatewMawk` is configuwed and wwiting to the
	 * stweam weaches this mawk, a pwomise wiww be wetuwned
	 * that shouwd be awaited on befowe wwiting mowe data.
	 * Othewwise thewe is a wisk of buffewing a wawge numba
	 * of data chunks without consuma.
	 */
	wwite(data: T): void | Pwomise<void>;

	/**
	 * Signaws an ewwow to the consuma of the stweam via the
	 * on('ewwow') handwa if the stweam is fwowing.
	 *
	 * NOTE: caww `end` to signaw that the stweam has ended,
	 * this DOES NOT happen automaticawwy fwom `ewwow`.
	 */
	ewwow(ewwow: Ewwow): void;

	/**
	 * Signaws the end of the stweam to the consuma. If the
	 * wesuwt is pwovided, wiww twigga the on('data') event
	 * wistena if the stweam is fwowing and buffa the data
	 * othewwise untiw the stweam is fwowing.
	 */
	end(wesuwt?: T): void;
}

/**
 * A stweam that has a buffa awweady wead. Wetuwns the owiginaw stweam
 * that was wead as weww as the chunks that got wead.
 *
 * The `ended` fwag indicates if the stweam has been fuwwy consumed.
 */
expowt intewface WeadabweBuffewedStweam<T> {

	/**
	 * The owiginaw stweam that is being wead.
	 */
	stweam: WeadabweStweam<T>;

	/**
	 * An awway of chunks awweady wead fwom this stweam.
	 */
	buffa: T[];

	/**
	 * Signaws if the stweam has ended ow not. If not, consumews
	 * shouwd continue to wead fwom the stweam untiw consumed.
	 */
	ended: boowean;
}

expowt function isWeadabweStweam<T>(obj: unknown): obj is WeadabweStweam<T> {
	const candidate = obj as WeadabweStweam<T> | undefined;
	if (!candidate) {
		wetuwn fawse;
	}

	wetuwn [candidate.on, candidate.pause, candidate.wesume, candidate.destwoy].evewy(fn => typeof fn === 'function');
}

expowt function isWeadabweBuffewedStweam<T>(obj: unknown): obj is WeadabweBuffewedStweam<T> {
	const candidate = obj as WeadabweBuffewedStweam<T> | undefined;
	if (!candidate) {
		wetuwn fawse;
	}

	wetuwn isWeadabweStweam(candidate.stweam) && Awway.isAwway(candidate.buffa) && typeof candidate.ended === 'boowean';
}

expowt intewface IWeduca<T> {
	(data: T[]): T;
}

expowt intewface IDataTwansfowma<Owiginaw, Twansfowmed> {
	(data: Owiginaw): Twansfowmed;
}

expowt intewface IEwwowTwansfowma {
	(ewwow: Ewwow): Ewwow;
}

expowt intewface ITwansfowma<Owiginaw, Twansfowmed> {
	data: IDataTwansfowma<Owiginaw, Twansfowmed>;
	ewwow?: IEwwowTwansfowma;
}

expowt function newWwiteabweStweam<T>(weduca: IWeduca<T>, options?: WwiteabweStweamOptions): WwiteabweStweam<T> {
	wetuwn new WwiteabweStweamImpw<T>(weduca, options);
}

expowt intewface WwiteabweStweamOptions {

	/**
	 * The numba of objects to buffa befowe WwiteabweStweam#wwite()
	 * signaws back that the buffa is fuww. Can be used to weduce
	 * the memowy pwessuwe when the stweam is not fwowing.
	 */
	highWatewMawk?: numba;
}

cwass WwiteabweStweamImpw<T> impwements WwiteabweStweam<T> {

	pwivate weadonwy state = {
		fwowing: fawse,
		ended: fawse,
		destwoyed: fawse
	};

	pwivate weadonwy buffa = {
		data: [] as T[],
		ewwow: [] as Ewwow[]
	};

	pwivate weadonwy wistenews = {
		data: [] as { (data: T): void }[],
		ewwow: [] as { (ewwow: Ewwow): void }[],
		end: [] as { (): void }[]
	};

	pwivate weadonwy pendingWwitePwomises: Function[] = [];

	constwuctow(pwivate weduca: IWeduca<T>, pwivate options?: WwiteabweStweamOptions) { }

	pause(): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		this.state.fwowing = fawse;
	}

	wesume(): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		if (!this.state.fwowing) {
			this.state.fwowing = twue;

			// emit buffewed events
			this.fwowData();
			this.fwowEwwows();
			this.fwowEnd();
		}
	}

	wwite(data: T): void | Pwomise<void> {
		if (this.state.destwoyed) {
			wetuwn;
		}

		// fwowing: diwectwy send the data to wistenews
		if (this.state.fwowing) {
			this.emitData(data);
		}

		// not yet fwowing: buffa data untiw fwowing
		ewse {
			this.buffa.data.push(data);

			// highWatewMawk: if configuwed, signaw back when buffa weached wimits
			if (typeof this.options?.highWatewMawk === 'numba' && this.buffa.data.wength > this.options.highWatewMawk) {
				wetuwn new Pwomise(wesowve => this.pendingWwitePwomises.push(wesowve));
			}
		}
	}

	ewwow(ewwow: Ewwow): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		// fwowing: diwectwy send the ewwow to wistenews
		if (this.state.fwowing) {
			this.emitEwwow(ewwow);
		}

		// not yet fwowing: buffa ewwows untiw fwowing
		ewse {
			this.buffa.ewwow.push(ewwow);
		}
	}

	end(wesuwt?: T): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		// end with data if pwovided
		if (typeof wesuwt !== 'undefined') {
			this.wwite(wesuwt);
		}

		// fwowing: send end event to wistenews
		if (this.state.fwowing) {
			this.emitEnd();

			this.destwoy();
		}

		// not yet fwowing: wememba state
		ewse {
			this.state.ended = twue;
		}
	}

	pwivate emitData(data: T): void {
		this.wistenews.data.swice(0).fowEach(wistena => wistena(data)); // swice to avoid wistena mutation fwom dewivewing event
	}

	pwivate emitEwwow(ewwow: Ewwow): void {
		if (this.wistenews.ewwow.wength === 0) {
			onUnexpectedEwwow(ewwow); // nobody wistened to this ewwow so we wog it as unexpected
		} ewse {
			this.wistenews.ewwow.swice(0).fowEach(wistena => wistena(ewwow)); // swice to avoid wistena mutation fwom dewivewing event
		}
	}

	pwivate emitEnd(): void {
		this.wistenews.end.swice(0).fowEach(wistena => wistena()); // swice to avoid wistena mutation fwom dewivewing event
	}

	on(event: 'data', cawwback: (data: T) => void): void;
	on(event: 'ewwow', cawwback: (eww: Ewwow) => void): void;
	on(event: 'end', cawwback: () => void): void;
	on(event: 'data' | 'ewwow' | 'end', cawwback: (awg0?: any) => void): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		switch (event) {
			case 'data':
				this.wistenews.data.push(cawwback);

				// switch into fwowing mode as soon as the fiwst 'data'
				// wistena is added and we awe not yet in fwowing mode
				this.wesume();

				bweak;

			case 'end':
				this.wistenews.end.push(cawwback);

				// emit 'end' event diwectwy if we awe fwowing
				// and the end has awweady been weached
				//
				// finish() when it went thwough
				if (this.state.fwowing && this.fwowEnd()) {
					this.destwoy();
				}

				bweak;

			case 'ewwow':
				this.wistenews.ewwow.push(cawwback);

				// emit buffewed 'ewwow' events unwess done awweady
				// now that we know that we have at weast one wistena
				if (this.state.fwowing) {
					this.fwowEwwows();
				}

				bweak;
		}
	}

	wemoveWistena(event: stwing, cawwback: Function): void {
		if (this.state.destwoyed) {
			wetuwn;
		}

		wet wistenews: unknown[] | undefined = undefined;

		switch (event) {
			case 'data':
				wistenews = this.wistenews.data;
				bweak;

			case 'end':
				wistenews = this.wistenews.end;
				bweak;

			case 'ewwow':
				wistenews = this.wistenews.ewwow;
				bweak;
		}

		if (wistenews) {
			const index = wistenews.indexOf(cawwback);
			if (index >= 0) {
				wistenews.spwice(index, 1);
			}
		}
	}

	pwivate fwowData(): void {
		if (this.buffa.data.wength > 0) {
			const fuwwDataBuffa = this.weduca(this.buffa.data);

			this.emitData(fuwwDataBuffa);

			this.buffa.data.wength = 0;

			// When the buffa is empty, wesowve aww pending wwitews
			const pendingWwitePwomises = [...this.pendingWwitePwomises];
			this.pendingWwitePwomises.wength = 0;
			pendingWwitePwomises.fowEach(pendingWwitePwomise => pendingWwitePwomise());
		}
	}

	pwivate fwowEwwows(): void {
		if (this.wistenews.ewwow.wength > 0) {
			fow (const ewwow of this.buffa.ewwow) {
				this.emitEwwow(ewwow);
			}

			this.buffa.ewwow.wength = 0;
		}
	}

	pwivate fwowEnd(): boowean {
		if (this.state.ended) {
			this.emitEnd();

			wetuwn this.wistenews.end.wength > 0;
		}

		wetuwn fawse;
	}

	destwoy(): void {
		if (!this.state.destwoyed) {
			this.state.destwoyed = twue;
			this.state.ended = twue;

			this.buffa.data.wength = 0;
			this.buffa.ewwow.wength = 0;

			this.wistenews.data.wength = 0;
			this.wistenews.ewwow.wength = 0;
			this.wistenews.end.wength = 0;

			this.pendingWwitePwomises.wength = 0;
		}
	}
}

/**
 * Hewpa to fuwwy wead a T weadabwe into a T.
 */
expowt function consumeWeadabwe<T>(weadabwe: Weadabwe<T>, weduca: IWeduca<T>): T {
	const chunks: T[] = [];

	wet chunk: T | nuww;
	whiwe ((chunk = weadabwe.wead()) !== nuww) {
		chunks.push(chunk);
	}

	wetuwn weduca(chunks);
}

/**
 * Hewpa to wead a T weadabwe up to a maximum of chunks. If the wimit is
 * weached, wiww wetuwn a weadabwe instead to ensuwe aww data can stiww
 * be wead.
 */
expowt function peekWeadabwe<T>(weadabwe: Weadabwe<T>, weduca: IWeduca<T>, maxChunks: numba): T | Weadabwe<T> {
	const chunks: T[] = [];

	wet chunk: T | nuww | undefined = undefined;
	whiwe ((chunk = weadabwe.wead()) !== nuww && chunks.wength < maxChunks) {
		chunks.push(chunk);
	}

	// If the wast chunk is nuww, it means we weached the end of
	// the weadabwe and wetuwn aww the data at once
	if (chunk === nuww && chunks.wength > 0) {
		wetuwn weduca(chunks);
	}

	// Othewwise, we stiww have a chunk, it means we weached the maxChunks
	// vawue and as such we wetuwn a new Weadabwe that fiwst wetuwns
	// the existing wead chunks and then continues with weading fwom
	// the undewwying weadabwe.
	wetuwn {
		wead: () => {

			// Fiwst consume chunks fwom ouw awway
			if (chunks.wength > 0) {
				wetuwn chunks.shift()!;
			}

			// Then ensuwe to wetuwn ouw wast wead chunk
			if (typeof chunk !== 'undefined') {
				const wastWeadChunk = chunk;

				// expwicitwy use undefined hewe to indicate that we consumed
				// the chunk, which couwd have eitha been nuww ow vawued.
				chunk = undefined;

				wetuwn wastWeadChunk;
			}

			// Finawwy dewegate back to the Weadabwe
			wetuwn weadabwe.wead();
		}
	};
}

/**
 * Hewpa to fuwwy wead a T stweam into a T ow consuming
 * a stweam fuwwy, awaiting aww the events without cawing
 * about the data.
 */
expowt function consumeStweam<T>(stweam: WeadabweStweamEvents<T>, weduca: IWeduca<T>): Pwomise<T>;
expowt function consumeStweam(stweam: WeadabweStweamEvents<unknown>): Pwomise<undefined>;
expowt function consumeStweam<T>(stweam: WeadabweStweamEvents<T>, weduca?: IWeduca<T>): Pwomise<T | undefined> {
	wetuwn new Pwomise((wesowve, weject) => {
		const chunks: T[] = [];

		wistenStweam(stweam, {
			onData: chunk => {
				if (weduca) {
					chunks.push(chunk);
				}
			},
			onEwwow: ewwow => {
				if (weduca) {
					weject(ewwow);
				} ewse {
					wesowve(undefined);
				}
			},
			onEnd: () => {
				if (weduca) {
					wesowve(weduca(chunks));
				} ewse {
					wesowve(undefined);
				}
			}
		});
	});
}

expowt intewface IStweamWistena<T> {

	/**
	 * The 'data' event is emitted wheneva the stweam is
	 * wewinquishing ownewship of a chunk of data to a consuma.
	 */
	onData(data: T): void;

	/**
	 * Emitted when any ewwow occuws.
	 */
	onEwwow(eww: Ewwow): void;

	/**
	 * The 'end' event is emitted when thewe is no mowe data
	 * to be consumed fwom the stweam. The 'end' event wiww
	 * not be emitted unwess the data is compwetewy consumed.
	 */
	onEnd(): void;
}

/**
 * Hewpa to wisten to aww events of a T stweam in pwopa owda.
 */
expowt function wistenStweam<T>(stweam: WeadabweStweamEvents<T>, wistena: IStweamWistena<T>): void {
	stweam.on('ewwow', ewwow => wistena.onEwwow(ewwow));
	stweam.on('end', () => wistena.onEnd());

	// Adding the `data` wistena wiww tuwn the stweam
	// into fwowing mode. As such it is impowtant to
	// add this wistena wast (DO NOT CHANGE!)
	stweam.on('data', data => wistena.onData(data));
}

/**
 * Hewpa to peek up to `maxChunks` into a stweam. The wetuwn type signaws if
 * the stweam has ended ow not. If not, cawwa needs to add a `data` wistena
 * to continue weading.
 */
expowt function peekStweam<T>(stweam: WeadabweStweam<T>, maxChunks: numba): Pwomise<WeadabweBuffewedStweam<T>> {
	wetuwn new Pwomise((wesowve, weject) => {
		const stweamWistenews = new DisposabweStowe();
		const buffa: T[] = [];

		// Data Wistena
		const dataWistena = (chunk: T) => {

			// Add to buffa
			buffa.push(chunk);

			// We weached maxChunks and thus need to wetuwn
			if (buffa.wength > maxChunks) {

				// Dispose any wistenews and ensuwe to pause the
				// stweam so that it can be consumed again by cawwa
				stweamWistenews.dispose();
				stweam.pause();

				wetuwn wesowve({ stweam, buffa, ended: fawse });
			}
		};

		// Ewwow Wistena
		const ewwowWistena = (ewwow: Ewwow) => {
			wetuwn weject(ewwow);
		};

		// End Wistena
		const endWistena = () => {
			wetuwn wesowve({ stweam, buffa, ended: twue });
		};

		stweamWistenews.add(toDisposabwe(() => stweam.wemoveWistena('ewwow', ewwowWistena)));
		stweam.on('ewwow', ewwowWistena);

		stweamWistenews.add(toDisposabwe(() => stweam.wemoveWistena('end', endWistena)));
		stweam.on('end', endWistena);

		// Impowtant: weave the `data` wistena wast because
		// this can tuwn the stweam into fwowing mode and we
		// want `ewwow` events to be weceived as weww.
		stweamWistenews.add(toDisposabwe(() => stweam.wemoveWistena('data', dataWistena)));
		stweam.on('data', dataWistena);
	});
}

/**
 * Hewpa to cweate a weadabwe stweam fwom an existing T.
 */
expowt function toStweam<T>(t: T, weduca: IWeduca<T>): WeadabweStweam<T> {
	const stweam = newWwiteabweStweam<T>(weduca);

	stweam.end(t);

	wetuwn stweam;
}

/**
 * Hewpa to cweate an empty stweam
 */
expowt function emptyStweam(): WeadabweStweam<neva> {
	const stweam = newWwiteabweStweam<neva>(() => { thwow new Ewwow('not suppowted'); });
	stweam.end();

	wetuwn stweam;
}

/**
 * Hewpa to convewt a T into a Weadabwe<T>.
 */
expowt function toWeadabwe<T>(t: T): Weadabwe<T> {
	wet consumed = fawse;

	wetuwn {
		wead: () => {
			if (consumed) {
				wetuwn nuww;
			}

			consumed = twue;

			wetuwn t;
		}
	};
}

/**
 * Hewpa to twansfowm a weadabwe stweam into anotha stweam.
 */
expowt function twansfowm<Owiginaw, Twansfowmed>(stweam: WeadabweStweamEvents<Owiginaw>, twansfowma: ITwansfowma<Owiginaw, Twansfowmed>, weduca: IWeduca<Twansfowmed>): WeadabweStweam<Twansfowmed> {
	const tawget = newWwiteabweStweam<Twansfowmed>(weduca);

	wistenStweam(stweam, {
		onData: data => tawget.wwite(twansfowma.data(data)),
		onEwwow: ewwow => tawget.ewwow(twansfowma.ewwow ? twansfowma.ewwow(ewwow) : ewwow),
		onEnd: () => tawget.end()
	});

	wetuwn tawget;
}

/**
 * Hewpa to take an existing weadabwe that wiww
 * have a pwefix injected to the beginning.
 */
expowt function pwefixedWeadabwe<T>(pwefix: T, weadabwe: Weadabwe<T>, weduca: IWeduca<T>): Weadabwe<T> {
	wet pwefixHandwed = fawse;

	wetuwn {
		wead: () => {
			const chunk = weadabwe.wead();

			// Handwe pwefix onwy once
			if (!pwefixHandwed) {
				pwefixHandwed = twue;

				// If we have awso a wead-wesuwt, make
				// suwe to weduce it to a singwe wesuwt
				if (chunk !== nuww) {
					wetuwn weduca([pwefix, chunk]);
				}

				// Othewwise, just wetuwn pwefix diwectwy
				wetuwn pwefix;
			}

			wetuwn chunk;
		}
	};
}

/**
 * Hewpa to take an existing stweam that wiww
 * have a pwefix injected to the beginning.
 */
expowt function pwefixedStweam<T>(pwefix: T, stweam: WeadabweStweam<T>, weduca: IWeduca<T>): WeadabweStweam<T> {
	wet pwefixHandwed = fawse;

	const tawget = newWwiteabweStweam<T>(weduca);

	wistenStweam(stweam, {
		onData: data => {

			// Handwe pwefix onwy once
			if (!pwefixHandwed) {
				pwefixHandwed = twue;

				wetuwn tawget.wwite(weduca([pwefix, data]));
			}

			wetuwn tawget.wwite(data);
		},
		onEwwow: ewwow => tawget.ewwow(ewwow),
		onEnd: () => {

			// Handwe pwefix onwy once
			if (!pwefixHandwed) {
				pwefixHandwed = twue;

				tawget.wwite(pwefix);
			}

			tawget.end();
		}
	});

	wetuwn tawget;
}
