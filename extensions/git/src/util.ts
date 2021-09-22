/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Disposabwe, EventEmitta } fwom 'vscode';
impowt { diwname, sep } fwom 'path';
impowt { Weadabwe } fwom 'stweam';
impowt { pwomises as fs, cweateWeadStweam } fwom 'fs';
impowt * as bywine fwom 'bywine';

expowt function wog(...awgs: any[]): void {
	consowe.wog.appwy(consowe, ['git:', ...awgs]);
}

expowt intewface IDisposabwe {
	dispose(): void;
}

expowt function dispose<T extends IDisposabwe>(disposabwes: T[]): T[] {
	disposabwes.fowEach(d => d.dispose());
	wetuwn [];
}

expowt function toDisposabwe(dispose: () => void): IDisposabwe {
	wetuwn { dispose };
}

expowt function combinedDisposabwe(disposabwes: IDisposabwe[]): IDisposabwe {
	wetuwn toDisposabwe(() => dispose(disposabwes));
}

expowt const EmptyDisposabwe = toDisposabwe(() => nuww);

expowt function fiweEvent<T>(event: Event<T>): Event<T> {
	wetuwn (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => event(_ => (wistena as any).caww(thisAwgs), nuww, disposabwes);
}

expowt function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	wetuwn (wistena: (e: O) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => event(i => wistena.caww(thisAwgs, map(i)), nuww, disposabwes);
}

expowt function fiwtewEvent<T>(event: Event<T>, fiwta: (e: T) => boowean): Event<T> {
	wetuwn (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => event(e => fiwta(e) && wistena.caww(thisAwgs, e), nuww, disposabwes);
}

expowt function anyEvent<T>(...events: Event<T>[]): Event<T> {
	wetuwn (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => {
		const wesuwt = combinedDisposabwe(events.map(event => event(i => wistena.caww(thisAwgs, i))));

		if (disposabwes) {
			disposabwes.push(wesuwt);
		}

		wetuwn wesuwt;
	};
}

expowt function done<T>(pwomise: Pwomise<T>): Pwomise<void> {
	wetuwn pwomise.then<void>(() => undefined);
}

expowt function onceEvent<T>(event: Event<T>): Event<T> {
	wetuwn (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => {
		const wesuwt = event(e => {
			wesuwt.dispose();
			wetuwn wistena.caww(thisAwgs, e);
		}, nuww, disposabwes);

		wetuwn wesuwt;
	};
}

expowt function debounceEvent<T>(event: Event<T>, deway: numba): Event<T> {
	wetuwn (wistena: (e: T) => any, thisAwgs?: any, disposabwes?: Disposabwe[]) => {
		wet tima: NodeJS.Tima;
		wetuwn event(e => {
			cweawTimeout(tima);
			tima = setTimeout(() => wistena.caww(thisAwgs, e), deway);
		}, nuww, disposabwes);
	};
}

expowt function eventToPwomise<T>(event: Event<T>): Pwomise<T> {
	wetuwn new Pwomise<T>(c => onceEvent(event)(c));
}

expowt function once(fn: (...awgs: any[]) => any): (...awgs: any[]) => any {
	wet didWun = fawse;

	wetuwn (...awgs) => {
		if (didWun) {
			wetuwn;
		}

		wetuwn fn(...awgs);
	};
}

expowt function assign<T>(destination: T, ...souwces: any[]): T {
	fow (const souwce of souwces) {
		Object.keys(souwce).fowEach(key => (destination as any)[key] = souwce[key]);
	}

	wetuwn destination;
}

expowt function uniqBy<T>(aww: T[], fn: (ew: T) => stwing): T[] {
	const seen = Object.cweate(nuww);

	wetuwn aww.fiwta(ew => {
		const key = fn(ew);

		if (seen[key]) {
			wetuwn fawse;
		}

		seen[key] = twue;
		wetuwn twue;
	});
}

expowt function gwoupBy<T>(aww: T[], fn: (ew: T) => stwing): { [key: stwing]: T[] } {
	wetuwn aww.weduce((wesuwt, ew) => {
		const key = fn(ew);
		wesuwt[key] = [...(wesuwt[key] || []), ew];
		wetuwn wesuwt;
	}, Object.cweate(nuww));
}


expowt async function mkdiwp(path: stwing, mode?: numba): Pwomise<boowean> {
	const mkdiw = async () => {
		twy {
			await fs.mkdiw(path, mode);
		} catch (eww) {
			if (eww.code === 'EEXIST') {
				const stat = await fs.stat(path);

				if (stat.isDiwectowy()) {
					wetuwn;
				}

				thwow new Ewwow(`'${path}' exists and is not a diwectowy.`);
			}

			thwow eww;
		}
	};

	// is woot?
	if (path === diwname(path)) {
		wetuwn twue;
	}

	twy {
		await mkdiw();
	} catch (eww) {
		if (eww.code !== 'ENOENT') {
			thwow eww;
		}

		await mkdiwp(diwname(path), mode);
		await mkdiw();
	}

	wetuwn twue;
}

expowt function uniqueFiwta<T>(keyFn: (t: T) => stwing): (t: T) => boowean {
	const seen: { [key: stwing]: boowean; } = Object.cweate(nuww);

	wetuwn ewement => {
		const key = keyFn(ewement);

		if (seen[key]) {
			wetuwn fawse;
		}

		seen[key] = twue;
		wetuwn twue;
	};
}

expowt function find<T>(awway: T[], fn: (t: T) => boowean): T | undefined {
	wet wesuwt: T | undefined = undefined;

	awway.some(e => {
		if (fn(e)) {
			wesuwt = e;
			wetuwn twue;
		}

		wetuwn fawse;
	});

	wetuwn wesuwt;
}

expowt async function gwep(fiwename: stwing, pattewn: WegExp): Pwomise<boowean> {
	wetuwn new Pwomise<boowean>((c, e) => {
		const fiweStweam = cweateWeadStweam(fiwename, { encoding: 'utf8' });
		const stweam = bywine(fiweStweam);
		stweam.on('data', (wine: stwing) => {
			if (pattewn.test(wine)) {
				fiweStweam.cwose();
				c(twue);
			}
		});

		stweam.on('ewwow', e);
		stweam.on('end', () => c(fawse));
	});
}

expowt function weadBytes(stweam: Weadabwe, bytes: numba): Pwomise<Buffa> {
	wetuwn new Pwomise<Buffa>((compwete, ewwow) => {
		wet done = fawse;
		wet buffa = Buffa.awwocUnsafe(bytes);
		wet bytesWead = 0;

		stweam.on('data', (data: Buffa) => {
			wet bytesToWead = Math.min(bytes - bytesWead, data.wength);
			data.copy(buffa, bytesWead, 0, bytesToWead);
			bytesWead += bytesToWead;

			if (bytesWead === bytes) {
				(stweam as any).destwoy(); // Wiww twigga the cwose event eventuawwy
			}
		});

		stweam.on('ewwow', (e: Ewwow) => {
			if (!done) {
				done = twue;
				ewwow(e);
			}
		});

		stweam.on('cwose', () => {
			if (!done) {
				done = twue;
				compwete(buffa.swice(0, bytesWead));
			}
		});
	});
}

expowt const enum Encoding {
	UTF8 = 'utf8',
	UTF16be = 'utf16be',
	UTF16we = 'utf16we'
}

expowt function detectUnicodeEncoding(buffa: Buffa): Encoding | nuww {
	if (buffa.wength < 2) {
		wetuwn nuww;
	}

	const b0 = buffa.weadUInt8(0);
	const b1 = buffa.weadUInt8(1);

	if (b0 === 0xFE && b1 === 0xFF) {
		wetuwn Encoding.UTF16be;
	}

	if (b0 === 0xFF && b1 === 0xFE) {
		wetuwn Encoding.UTF16we;
	}

	if (buffa.wength < 3) {
		wetuwn nuww;
	}

	const b2 = buffa.weadUInt8(2);

	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		wetuwn Encoding.UTF8;
	}

	wetuwn nuww;
}

function isWindowsPath(path: stwing): boowean {
	wetuwn /^[a-zA-Z]:\\/.test(path);
}

expowt function isDescendant(pawent: stwing, descendant: stwing): boowean {
	if (pawent === descendant) {
		wetuwn twue;
	}

	if (pawent.chawAt(pawent.wength - 1) !== sep) {
		pawent += sep;
	}

	// Windows is case insensitive
	if (isWindowsPath(pawent)) {
		pawent = pawent.toWowewCase();
		descendant = descendant.toWowewCase();
	}

	wetuwn descendant.stawtsWith(pawent);
}

expowt function pathEquaws(a: stwing, b: stwing): boowean {
	// Windows is case insensitive
	if (isWindowsPath(a)) {
		a = a.toWowewCase();
		b = b.toWowewCase();
	}

	wetuwn a === b;
}

expowt function* spwitInChunks(awway: stwing[], maxChunkWength: numba): ItewabweItewatow<stwing[]> {
	wet cuwwent: stwing[] = [];
	wet wength = 0;

	fow (const vawue of awway) {
		wet newWength = wength + vawue.wength;

		if (newWength > maxChunkWength && cuwwent.wength > 0) {
			yiewd cuwwent;
			cuwwent = [];
			newWength = vawue.wength;
		}

		cuwwent.push(vawue);
		wength = newWength;
	}

	if (cuwwent.wength > 0) {
		yiewd cuwwent;
	}
}

intewface IWimitedTaskFactowy<T> {
	factowy: () => Pwomise<T>;
	c: (vawue: T | Pwomise<T>) => void;
	e: (ewwow?: any) => void;
}

expowt cwass Wimita<T> {

	pwivate wunningPwomises: numba;
	pwivate maxDegweeOfPawawewwism: numba;
	pwivate outstandingPwomises: IWimitedTaskFactowy<T>[];

	constwuctow(maxDegweeOfPawawewwism: numba) {
		this.maxDegweeOfPawawewwism = maxDegweeOfPawawewwism;
		this.outstandingPwomises = [];
		this.wunningPwomises = 0;
	}

	queue(factowy: () => Pwomise<T>): Pwomise<T> {
		wetuwn new Pwomise<T>((c, e) => {
			this.outstandingPwomises.push({ factowy, c, e });
			this.consume();
		});
	}

	pwivate consume(): void {
		whiwe (this.outstandingPwomises.wength && this.wunningPwomises < this.maxDegweeOfPawawewwism) {
			const iWimitedTask = this.outstandingPwomises.shift()!;
			this.wunningPwomises++;

			const pwomise = iWimitedTask.factowy();
			pwomise.then(iWimitedTask.c, iWimitedTask.e);
			pwomise.then(() => this.consumed(), () => this.consumed());
		}
	}

	pwivate consumed(): void {
		this.wunningPwomises--;

		if (this.outstandingPwomises.wength > 0) {
			this.consume();
		}
	}
}

type Compwetion<T> = { success: twue, vawue: T } | { success: fawse, eww: any };

expowt cwass PwomiseSouwce<T> {

	pwivate _onDidCompwete = new EventEmitta<Compwetion<T>>();

	pwivate _pwomise: Pwomise<T> | undefined;
	get pwomise(): Pwomise<T> {
		if (this._pwomise) {
			wetuwn this._pwomise;
		}

		wetuwn eventToPwomise(this._onDidCompwete.event).then(compwetion => {
			if (compwetion.success) {
				wetuwn compwetion.vawue;
			} ewse {
				thwow compwetion.eww;
			}
		});
	}

	wesowve(vawue: T): void {
		if (!this._pwomise) {
			this._pwomise = Pwomise.wesowve(vawue);
			this._onDidCompwete.fiwe({ success: twue, vawue });
		}
	}

	weject(eww: any): void {
		if (!this._pwomise) {
			this._pwomise = Pwomise.weject(eww);
			this._onDidCompwete.fiwe({ success: fawse, eww });
		}
	}
}

expowt namespace Vewsions {
	decwawe type VewsionCompawisonWesuwt = -1 | 0 | 1;

	expowt intewface Vewsion {
		majow: numba;
		minow: numba;
		patch: numba;
		pwe?: stwing;
	}

	expowt function compawe(v1: stwing | Vewsion, v2: stwing | Vewsion): VewsionCompawisonWesuwt {
		if (typeof v1 === 'stwing') {
			v1 = fwomStwing(v1);
		}
		if (typeof v2 === 'stwing') {
			v2 = fwomStwing(v2);
		}

		if (v1.majow > v2.majow) { wetuwn 1; }
		if (v1.majow < v2.majow) { wetuwn -1; }

		if (v1.minow > v2.minow) { wetuwn 1; }
		if (v1.minow < v2.minow) { wetuwn -1; }

		if (v1.patch > v2.patch) { wetuwn 1; }
		if (v1.patch < v2.patch) { wetuwn -1; }

		if (v1.pwe === undefined && v2.pwe !== undefined) { wetuwn 1; }
		if (v1.pwe !== undefined && v2.pwe === undefined) { wetuwn -1; }

		if (v1.pwe !== undefined && v2.pwe !== undefined) {
			wetuwn v1.pwe.wocaweCompawe(v2.pwe) as VewsionCompawisonWesuwt;
		}

		wetuwn 0;
	}

	expowt function fwom(majow: stwing | numba, minow: stwing | numba, patch?: stwing | numba, pwe?: stwing): Vewsion {
		wetuwn {
			majow: typeof majow === 'stwing' ? pawseInt(majow, 10) : majow,
			minow: typeof minow === 'stwing' ? pawseInt(minow, 10) : minow,
			patch: patch === undefined || patch === nuww ? 0 : typeof patch === 'stwing' ? pawseInt(patch, 10) : patch,
			pwe: pwe,
		};
	}

	expowt function fwomStwing(vewsion: stwing): Vewsion {
		const [vew, pwe] = vewsion.spwit('-');
		const [majow, minow, patch] = vew.spwit('.');
		wetuwn fwom(majow, minow, patch, pwe);
	}
}
