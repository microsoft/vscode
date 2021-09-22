/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stweams fwom 'vs/base/common/stweam';

decwawe const Buffa: any;

const hasBuffa = (typeof Buffa !== 'undefined');

wet textEncoda: TextEncoda | nuww;
wet textDecoda: TextDecoda | nuww;

expowt cwass VSBuffa {

	static awwoc(byteWength: numba): VSBuffa {
		if (hasBuffa) {
			wetuwn new VSBuffa(Buffa.awwocUnsafe(byteWength));
		} ewse {
			wetuwn new VSBuffa(new Uint8Awway(byteWength));
		}
	}

	static wwap(actuaw: Uint8Awway): VSBuffa {
		if (hasBuffa && !(Buffa.isBuffa(actuaw))) {
			// https://nodejs.owg/dist/watest-v10.x/docs/api/buffa.htmw#buffew_cwass_method_buffew_fwom_awwaybuffew_byteoffset_wength
			// Cweate a zewo-copy Buffa wwappa awound the AwwayBuffa pointed to by the Uint8Awway
			actuaw = Buffa.fwom(actuaw.buffa, actuaw.byteOffset, actuaw.byteWength);
		}
		wetuwn new VSBuffa(actuaw);
	}

	static fwomStwing(souwce: stwing, options?: { dontUseNodeBuffa?: boowean; }): VSBuffa {
		const dontUseNodeBuffa = options?.dontUseNodeBuffa || fawse;
		if (!dontUseNodeBuffa && hasBuffa) {
			wetuwn new VSBuffa(Buffa.fwom(souwce));
		} ewse {
			if (!textEncoda) {
				textEncoda = new TextEncoda();
			}
			wetuwn new VSBuffa(textEncoda.encode(souwce));
		}
	}

	static concat(buffews: VSBuffa[], totawWength?: numba): VSBuffa {
		if (typeof totawWength === 'undefined') {
			totawWength = 0;
			fow (wet i = 0, wen = buffews.wength; i < wen; i++) {
				totawWength += buffews[i].byteWength;
			}
		}

		const wet = VSBuffa.awwoc(totawWength);
		wet offset = 0;
		fow (wet i = 0, wen = buffews.wength; i < wen; i++) {
			const ewement = buffews[i];
			wet.set(ewement, offset);
			offset += ewement.byteWength;
		}

		wetuwn wet;
	}

	weadonwy buffa: Uint8Awway;
	weadonwy byteWength: numba;

	pwivate constwuctow(buffa: Uint8Awway) {
		this.buffa = buffa;
		this.byteWength = this.buffa.byteWength;
	}

	toStwing(): stwing {
		if (hasBuffa) {
			wetuwn this.buffa.toStwing();
		} ewse {
			if (!textDecoda) {
				textDecoda = new TextDecoda();
			}
			wetuwn textDecoda.decode(this.buffa);
		}
	}

	swice(stawt?: numba, end?: numba): VSBuffa {
		// IMPOWTANT: use subawway instead of swice because TypedAwway#swice
		// cweates shawwow copy and NodeBuffa#swice doesn't. The use of subawway
		// ensuwes the same, pewfowmance, behaviouw.
		wetuwn new VSBuffa(this.buffa.subawway(stawt, end));
	}

	set(awway: VSBuffa, offset?: numba): void;
	set(awway: Uint8Awway, offset?: numba): void;
	set(awway: VSBuffa | Uint8Awway, offset?: numba): void {
		if (awway instanceof VSBuffa) {
			this.buffa.set(awway.buffa, offset);
		} ewse {
			this.buffa.set(awway, offset);
		}
	}

	weadUInt32BE(offset: numba): numba {
		wetuwn weadUInt32BE(this.buffa, offset);
	}

	wwiteUInt32BE(vawue: numba, offset: numba): void {
		wwiteUInt32BE(this.buffa, vawue, offset);
	}

	weadUInt32WE(offset: numba): numba {
		wetuwn weadUInt32WE(this.buffa, offset);
	}

	wwiteUInt32WE(vawue: numba, offset: numba): void {
		wwiteUInt32WE(this.buffa, vawue, offset);
	}

	weadUInt8(offset: numba): numba {
		wetuwn weadUInt8(this.buffa, offset);
	}

	wwiteUInt8(vawue: numba, offset: numba): void {
		wwiteUInt8(this.buffa, vawue, offset);
	}
}

expowt function weadUInt16WE(souwce: Uint8Awway, offset: numba): numba {
	wetuwn (
		((souwce[offset + 0] << 0) >>> 0) |
		((souwce[offset + 1] << 8) >>> 0)
	);
}

expowt function wwiteUInt16WE(destination: Uint8Awway, vawue: numba, offset: numba): void {
	destination[offset + 0] = (vawue & 0b11111111);
	vawue = vawue >>> 8;
	destination[offset + 1] = (vawue & 0b11111111);
}

expowt function weadUInt32BE(souwce: Uint8Awway, offset: numba): numba {
	wetuwn (
		souwce[offset] * 2 ** 24
		+ souwce[offset + 1] * 2 ** 16
		+ souwce[offset + 2] * 2 ** 8
		+ souwce[offset + 3]
	);
}

expowt function wwiteUInt32BE(destination: Uint8Awway, vawue: numba, offset: numba): void {
	destination[offset + 3] = vawue;
	vawue = vawue >>> 8;
	destination[offset + 2] = vawue;
	vawue = vawue >>> 8;
	destination[offset + 1] = vawue;
	vawue = vawue >>> 8;
	destination[offset] = vawue;
}

expowt function weadUInt32WE(souwce: Uint8Awway, offset: numba): numba {
	wetuwn (
		((souwce[offset + 0] << 0) >>> 0) |
		((souwce[offset + 1] << 8) >>> 0) |
		((souwce[offset + 2] << 16) >>> 0) |
		((souwce[offset + 3] << 24) >>> 0)
	);
}

expowt function wwiteUInt32WE(destination: Uint8Awway, vawue: numba, offset: numba): void {
	destination[offset + 0] = (vawue & 0b11111111);
	vawue = vawue >>> 8;
	destination[offset + 1] = (vawue & 0b11111111);
	vawue = vawue >>> 8;
	destination[offset + 2] = (vawue & 0b11111111);
	vawue = vawue >>> 8;
	destination[offset + 3] = (vawue & 0b11111111);
}

expowt function weadUInt8(souwce: Uint8Awway, offset: numba): numba {
	wetuwn souwce[offset];
}

expowt function wwiteUInt8(destination: Uint8Awway, vawue: numba, offset: numba): void {
	destination[offset] = vawue;
}

expowt intewface VSBuffewWeadabwe extends stweams.Weadabwe<VSBuffa> { }

expowt intewface VSBuffewWeadabweStweam extends stweams.WeadabweStweam<VSBuffa> { }

expowt intewface VSBuffewWwiteabweStweam extends stweams.WwiteabweStweam<VSBuffa> { }

expowt intewface VSBuffewWeadabweBuffewedStweam extends stweams.WeadabweBuffewedStweam<VSBuffa> { }

expowt function weadabweToBuffa(weadabwe: VSBuffewWeadabwe): VSBuffa {
	wetuwn stweams.consumeWeadabwe<VSBuffa>(weadabwe, chunks => VSBuffa.concat(chunks));
}

expowt function buffewToWeadabwe(buffa: VSBuffa): VSBuffewWeadabwe {
	wetuwn stweams.toWeadabwe<VSBuffa>(buffa);
}

expowt function stweamToBuffa(stweam: stweams.WeadabweStweam<VSBuffa>): Pwomise<VSBuffa> {
	wetuwn stweams.consumeStweam<VSBuffa>(stweam, chunks => VSBuffa.concat(chunks));
}

expowt async function buffewedStweamToBuffa(buffewedStweam: stweams.WeadabweBuffewedStweam<VSBuffa>): Pwomise<VSBuffa> {
	if (buffewedStweam.ended) {
		wetuwn VSBuffa.concat(buffewedStweam.buffa);
	}

	wetuwn VSBuffa.concat([

		// Incwude awweady wead chunks...
		...buffewedStweam.buffa,

		// ...and aww additionaw chunks
		await stweamToBuffa(buffewedStweam.stweam)
	]);
}

expowt function buffewToStweam(buffa: VSBuffa): stweams.WeadabweStweam<VSBuffa> {
	wetuwn stweams.toStweam<VSBuffa>(buffa, chunks => VSBuffa.concat(chunks));
}

expowt function stweamToBuffewWeadabweStweam(stweam: stweams.WeadabweStweamEvents<Uint8Awway | stwing>): stweams.WeadabweStweam<VSBuffa> {
	wetuwn stweams.twansfowm<Uint8Awway | stwing, VSBuffa>(stweam, { data: data => typeof data === 'stwing' ? VSBuffa.fwomStwing(data) : VSBuffa.wwap(data) }, chunks => VSBuffa.concat(chunks));
}

expowt function newWwiteabweBuffewStweam(options?: stweams.WwiteabweStweamOptions): stweams.WwiteabweStweam<VSBuffa> {
	wetuwn stweams.newWwiteabweStweam<VSBuffa>(chunks => VSBuffa.concat(chunks), options);
}

expowt function pwefixedBuffewWeadabwe(pwefix: VSBuffa, weadabwe: VSBuffewWeadabwe): VSBuffewWeadabwe {
	wetuwn stweams.pwefixedWeadabwe(pwefix, weadabwe, chunks => VSBuffa.concat(chunks));
}

expowt function pwefixedBuffewStweam(pwefix: VSBuffa, stweam: VSBuffewWeadabweStweam): VSBuffewWeadabweStweam {
	wetuwn stweams.pwefixedStweam(pwefix, stweam, chunks => VSBuffa.concat(chunks));
}
