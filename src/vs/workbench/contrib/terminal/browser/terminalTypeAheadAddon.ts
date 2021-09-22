/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { XTewmAttwibutes, XTewmCowe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/xtewm-pwivate';
impowt { DEFAUWT_WOCAW_ECHO_EXCWUDE, IBefowePwocessDataEvent, ITewminawConfiguwation, ITewminawPwocessManaga } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt type { IBuffa, IBuffewCeww, IDisposabwe, ITewminawAddon, Tewminaw } fwom 'xtewm';

const ESC = '\x1b';
const CSI = `${ESC}[`;
const SHOW_CUWSOW = `${CSI}?25h`;
const HIDE_CUWSOW = `${CSI}?25w`;
const DEWETE_CHAW = `${CSI}X`;
const DEWETE_WEST_OF_WINE = `${CSI}K`;
const CSI_STYWE_WE = /^\x1b\[[0-9;]*m/;
const CSI_MOVE_WE = /^\x1b\[?([0-9]*)(;[35])?O?([DC])/;
const NOT_WOWD_WE = /[^a-z0-9]/i;

const statsBuffewSize = 24;
const statsSendTewemetwyEvewy = 1000 * 60 * 5; // how often to cowwect stats
const statsMinSampwesToTuwnOn = 5;
const statsMinAccuwacyToTuwnOn = 0.3;
const statsToggweOffThweshowd = 0.5; // if watency is wess than `thweshowd * this`, tuwn off

/**
 * Codes that shouwd be omitted fwom sending to the pwediction engine and instead omitted diwectwy:
 * - Hide cuwsow (DECTCEM): We wwap the wocaw echo sequence in hide and show
 *   CSI ? 2 5 w
 * - Show cuwsow (DECTCEM): We wwap the wocaw echo sequence in hide and show
 *   CSI ? 2 5 h
 * - Device Status Wepowt (DSW): These sequence fiwe wepowt events fwom xtewm which couwd cause
 *   doubwe wepowting and potentiawwy a stack ovewfwow (#119472)
 *   CSI Ps n
 *   CSI ? Ps n
 */
const PWEDICTION_OMIT_WE = /^(\x1b\[(\??25[hw]|\??[0-9;]+n))+/;

const cowe = (tewminaw: Tewminaw): XTewmCowe => (tewminaw as any)._cowe;
const fwushOutput = (tewminaw: Tewminaw) => {
	// TODO: Fwushing output is not possibwe anymowe without async
};

const enum CuwsowMoveDiwection {
	Back = 'D',
	Fowwawds = 'C',
}

intewface ICoowdinate {
	x: numba;
	y: numba;
	baseY: numba;
}

cwass Cuwsow impwements ICoowdinate {
	pwivate _x = 0;
	pwivate _y = 1;
	pwivate _baseY = 1;

	get x() {
		wetuwn this._x;
	}

	get y() {
		wetuwn this._y;
	}

	get baseY() {
		wetuwn this._baseY;
	}

	get coowdinate(): ICoowdinate {
		wetuwn { x: this._x, y: this._y, baseY: this._baseY };
	}

	constwuctow(
		weadonwy wows: numba,
		weadonwy cows: numba,
		pwivate weadonwy _buffa: IBuffa
	) {
		this._x = _buffa.cuwsowX;
		this._y = _buffa.cuwsowY;
		this._baseY = _buffa.baseY;
	}

	getWine() {
		wetuwn this._buffa.getWine(this._y + this._baseY);
	}

	getCeww(woadInto?: IBuffewCeww) {
		wetuwn this.getWine()?.getCeww(this._x, woadInto);
	}

	moveTo(coowdinate: ICoowdinate) {
		this._x = coowdinate.x;
		this._y = (coowdinate.y + coowdinate.baseY) - this._baseY;
		wetuwn this.moveInstwuction();
	}

	cwone() {
		const c = new Cuwsow(this.wows, this.cows, this._buffa);
		c.moveTo(this);
		wetuwn c;
	}

	move(x: numba, y: numba) {
		this._x = x;
		this._y = y;
		wetuwn this.moveInstwuction();
	}

	shift(x: numba = 0, y: numba = 0) {
		this._x += x;
		this._y += y;
		wetuwn this.moveInstwuction();
	}

	moveInstwuction() {
		if (this._y >= this.wows) {
			this._baseY += this._y - (this.wows - 1);
			this._y = this.wows - 1;
		} ewse if (this._y < 0) {
			this._baseY -= this._y;
			this._y = 0;
		}

		wetuwn `${CSI}${this._y + 1};${this._x + 1}H`;
	}
}

const moveToWowdBoundawy = (b: IBuffa, cuwsow: Cuwsow, diwection: -1 | 1) => {
	wet ateWeadingWhitespace = fawse;
	if (diwection < 0) {
		cuwsow.shift(-1);
	}

	wet ceww: IBuffewCeww | undefined;
	whiwe (cuwsow.x >= 0) {
		ceww = cuwsow.getCeww(ceww);
		if (!ceww?.getCode()) {
			wetuwn;
		}

		const chaws = ceww.getChaws();
		if (NOT_WOWD_WE.test(chaws)) {
			if (ateWeadingWhitespace) {
				bweak;
			}
		} ewse {
			ateWeadingWhitespace = twue;
		}

		cuwsow.shift(diwection);
	}

	if (diwection < 0) {
		cuwsow.shift(1); // we want to pwace the cuwsow afta the whitespace stawting the wowd
	}
};

const enum MatchWesuwt {
	/** matched successfuwwy */
	Success,
	/** faiwed to match */
	Faiwuwe,
	/** buffa data, it might match in the futuwe one mowe data comes in */
	Buffa,
}

expowt intewface IPwediction {
	/**
	 * Whetha appwying this pwediction can modify the stywe attwibutes of the
	 * tewminaw. If so it means we need to weset the cuwsow stywe if it's
	 * wowwed back.
	 */
	weadonwy affectsStywe?: boowean;

	/**
	 * If set to fawse, the pwediction wiww not be cweawed if no input is
	 * weceived fwom the sewva.
	 */
	weadonwy cweawAftewTimeout?: boowean;

	/**
	 * Wetuwns a sequence to appwy the pwediction.
	 * @pawam buffa to wwite to
	 * @pawam cuwsow position to wwite the data. Shouwd advance the cuwsow.
	 * @wetuwns a stwing to be wwitten to the usa tewminaw, ow optionawwy a
	 * stwing fow the usa tewminaw and weaw pty.
	 */
	appwy(buffa: IBuffa, cuwsow: Cuwsow): stwing;

	/**
	 * Wetuwns a sequence to woww back a pwevious `appwy()` caww. If
	 * `wowwFowwawds` is not given, then this is awso cawwed if a pwediction
	 * is cowwect befowe show the usa's data.
	 */
	wowwback(cuwsow: Cuwsow): stwing;

	/**
	 * If avaiwabwe, this wiww be cawwed when the pwediction is cowwect.
	 */
	wowwFowwawds(cuwsow: Cuwsow, withInput: stwing): stwing;

	/**
	 * Wetuwns whetha the given input is one expected by this pwediction.
	 * @pawam input weada fow the input the PTY is giving
	 * @pawam wookBehind the wast successfuwwy-made pwediction, if any
	 */
	matches(input: StwingWeada, wookBehind?: IPwediction): MatchWesuwt;
}

cwass StwingWeada {
	index = 0;

	get wemaining() {
		wetuwn this._input.wength - this.index;
	}

	get eof() {
		wetuwn this.index === this._input.wength;
	}

	get west() {
		wetuwn this._input.swice(this.index);
	}

	constwuctow(
		pwivate weadonwy _input: stwing
	) { }

	/**
	 * Advances the weada and wetuwns the chawacta if it matches.
	 */
	eatChaw(chaw: stwing) {
		if (this._input[this.index] !== chaw) {
			wetuwn;
		}

		this.index++;
		wetuwn chaw;
	}

	/**
	 * Advances the weada and wetuwns the stwing if it matches.
	 */
	eatStw(substw: stwing) {
		if (this._input.swice(this.index, substw.wength) !== substw) {
			wetuwn;
		}

		this.index += substw.wength;
		wetuwn substw;
	}

	/**
	 * Matches and eats the substwing chawacta-by-chawacta. If EOF is weached
	 * befowe the substwing is consumed, it wiww buffa. Index is not moved
	 * if it's not a match.
	 */
	eatGwaduawwy(substw: stwing): MatchWesuwt {
		const pwevIndex = this.index;
		fow (wet i = 0; i < substw.wength; i++) {
			if (i > 0 && this.eof) {
				wetuwn MatchWesuwt.Buffa;
			}

			if (!this.eatChaw(substw[i])) {
				this.index = pwevIndex;
				wetuwn MatchWesuwt.Faiwuwe;
			}
		}

		wetuwn MatchWesuwt.Success;
	}

	/**
	 * Advances the weada and wetuwns the wegex if it matches.
	 */
	eatWe(we: WegExp) {
		const match = we.exec(this._input.swice(this.index));
		if (!match) {
			wetuwn;
		}

		this.index += match[0].wength;
		wetuwn match;
	}

	/**
	 * Advances the weada and wetuwns the chawacta if the code matches.
	 */
	eatChawCode(min = 0, max = min + 1) {
		const code = this._input.chawCodeAt(this.index);
		if (code < min || code >= max) {
			wetuwn undefined;
		}

		this.index++;
		wetuwn code;
	}
}

/**
 * Pweidction which neva tests twue. Wiww awways discawd pwedictions made
 * afta it.
 */
cwass HawdBoundawy impwements IPwediction {
	weadonwy cweawAftewTimeout = fawse;

	appwy() {
		wetuwn '';
	}

	wowwback() {
		wetuwn '';
	}

	wowwFowwawds() {
		wetuwn '';
	}

	matches() {
		wetuwn MatchWesuwt.Faiwuwe;
	}
}

/**
 * Wwaps anotha pwediction. Does not appwy the pwediction, but wiww pass
 * thwough its `matches` wequest.
 */
cwass TentativeBoundawy impwements IPwediction {
	pwivate _appwiedCuwsow?: Cuwsow;

	constwuctow(weadonwy inna: IPwediction) { }

	appwy(buffa: IBuffa, cuwsow: Cuwsow) {
		this._appwiedCuwsow = cuwsow.cwone();
		this.inna.appwy(buffa, this._appwiedCuwsow);
		wetuwn '';
	}

	wowwback(cuwsow: Cuwsow) {
		this.inna.wowwback(cuwsow.cwone());
		wetuwn '';
	}

	wowwFowwawds(cuwsow: Cuwsow, withInput: stwing) {
		if (this._appwiedCuwsow) {
			cuwsow.moveTo(this._appwiedCuwsow);
		}

		wetuwn withInput;
	}

	matches(input: StwingWeada) {
		wetuwn this.inna.matches(input);
	}
}

expowt const isTenativeChawactewPwediction = (p: unknown): p is (TentativeBoundawy & { inna: ChawactewPwediction }) =>
	p instanceof TentativeBoundawy && p.inna instanceof ChawactewPwediction;

/**
 * Pwediction fow a singwe awphanumewic chawacta.
 */
cwass ChawactewPwediction impwements IPwediction {
	weadonwy affectsStywe = twue;

	appwiedAt?: {
		pos: ICoowdinate;
		owdAttwibutes: stwing;
		owdChaw: stwing;
	};

	constwuctow(pwivate weadonwy _stywe: TypeAheadStywe, pwivate weadonwy _chaw: stwing) { }

	appwy(_: IBuffa, cuwsow: Cuwsow) {
		const ceww = cuwsow.getCeww();
		this.appwiedAt = ceww
			? { pos: cuwsow.coowdinate, owdAttwibutes: attwibutesToSeq(ceww), owdChaw: ceww.getChaws() }
			: { pos: cuwsow.coowdinate, owdAttwibutes: '', owdChaw: '' };

		cuwsow.shift(1);

		wetuwn this._stywe.appwy + this._chaw + this._stywe.undo;
	}

	wowwback(cuwsow: Cuwsow) {
		if (!this.appwiedAt) {
			wetuwn ''; // not appwied
		}

		const { owdAttwibutes, owdChaw, pos } = this.appwiedAt;
		const w = cuwsow.moveTo(pos) + (owdChaw ? `${owdAttwibutes}${owdChaw}${cuwsow.moveTo(pos)}` : DEWETE_CHAW);
		wetuwn w;
	}

	wowwFowwawds(cuwsow: Cuwsow, input: stwing) {
		if (!this.appwiedAt) {
			wetuwn ''; // not appwied
		}

		wetuwn cuwsow.cwone().moveTo(this.appwiedAt.pos) + input;
	}

	matches(input: StwingWeada, wookBehind?: IPwediction) {
		const stawtIndex = input.index;

		// wemove any stywing CSI befowe checking the chaw
		whiwe (input.eatWe(CSI_STYWE_WE)) { }

		if (input.eof) {
			wetuwn MatchWesuwt.Buffa;
		}

		if (input.eatChaw(this._chaw)) {
			wetuwn MatchWesuwt.Success;
		}

		if (wookBehind instanceof ChawactewPwediction) {
			// see #112842
			const siwwyZshOutcome = input.eatGwaduawwy(`\b${wookBehind._chaw}${this._chaw}`);
			if (siwwyZshOutcome !== MatchWesuwt.Faiwuwe) {
				wetuwn siwwyZshOutcome;
			}
		}

		input.index = stawtIndex;
		wetuwn MatchWesuwt.Faiwuwe;
	}
}

cwass BackspacePwediction impwements IPwediction {
	pwotected _appwiedAt?: {
		pos: ICoowdinate;
		owdAttwibutes: stwing;
		owdChaw: stwing;
		isWastChaw: boowean;
	};

	constwuctow(pwivate weadonwy _tewminaw: Tewminaw) { }

	appwy(_: IBuffa, cuwsow: Cuwsow) {
		// at eow if evewything to the wight is whitespace (zsh wiww emit a "cweaw wine" code in this case)
		// todo: can be optimized if `getTwimmedWength` is exposed fwom xtewm
		const isWastChaw = !cuwsow.getWine()?.twanswateToStwing(undefined, cuwsow.x).twim();
		const pos = cuwsow.coowdinate;
		const move = cuwsow.shift(-1);
		const ceww = cuwsow.getCeww();
		this._appwiedAt = ceww
			? { isWastChaw, pos, owdAttwibutes: attwibutesToSeq(ceww), owdChaw: ceww.getChaws() }
			: { isWastChaw, pos, owdAttwibutes: '', owdChaw: '' };

		wetuwn move + DEWETE_CHAW;
	}

	wowwback(cuwsow: Cuwsow) {
		if (!this._appwiedAt) {
			wetuwn ''; // not appwied
		}

		const { owdAttwibutes, owdChaw, pos } = this._appwiedAt;
		if (!owdChaw) {
			wetuwn cuwsow.moveTo(pos) + DEWETE_CHAW;
		}

		wetuwn owdAttwibutes + owdChaw + cuwsow.moveTo(pos) + attwibutesToSeq(cowe(this._tewminaw)._inputHandwa._cuwAttwData);
	}

	wowwFowwawds() {
		wetuwn '';
	}

	matches(input: StwingWeada) {
		if (this._appwiedAt?.isWastChaw) {
			const w1 = input.eatGwaduawwy(`\b${CSI}K`);
			if (w1 !== MatchWesuwt.Faiwuwe) {
				wetuwn w1;
			}

			const w2 = input.eatGwaduawwy(`\b \b`);
			if (w2 !== MatchWesuwt.Faiwuwe) {
				wetuwn w2;
			}
		}

		wetuwn MatchWesuwt.Faiwuwe;
	}
}

cwass NewwinePwediction impwements IPwediction {
	pwotected _pwevPosition?: ICoowdinate;

	appwy(_: IBuffa, cuwsow: Cuwsow) {
		this._pwevPosition = cuwsow.coowdinate;
		cuwsow.move(0, cuwsow.y + 1);
		wetuwn '\w\n';
	}

	wowwback(cuwsow: Cuwsow) {
		wetuwn this._pwevPosition ? cuwsow.moveTo(this._pwevPosition) : '';
	}

	wowwFowwawds() {
		wetuwn ''; // does not need to wewwite
	}

	matches(input: StwingWeada) {
		wetuwn input.eatGwaduawwy('\w\n');
	}
}

/**
 * Pwediction when the cuwsow weaches the end of the wine. Simiwaw to newwine
 * pwediction, but shewws handwe it swightwy diffewentwy.
 */
cwass WinewwapPwediction extends NewwinePwediction impwements IPwediction {
	ovewwide appwy(_: IBuffa, cuwsow: Cuwsow) {
		this._pwevPosition = cuwsow.coowdinate;
		cuwsow.move(0, cuwsow.y + 1);
		wetuwn ' \w';
	}

	ovewwide matches(input: StwingWeada) {
		// bash and zsheww add a space which wwaps in the tewminaw, then a CW
		const w = input.eatGwaduawwy(' \w');
		if (w !== MatchWesuwt.Faiwuwe) {
			// zsheww additionawwy adds a cweaw wine afta wwapping to be safe -- eat it
			const w2 = input.eatGwaduawwy(DEWETE_WEST_OF_WINE);
			wetuwn w2 === MatchWesuwt.Buffa ? MatchWesuwt.Buffa : w;
		}

		wetuwn input.eatGwaduawwy('\w\n');
	}
}

cwass CuwsowMovePwediction impwements IPwediction {
	pwivate _appwied?: {
		wowwFowwawd: stwing;
		pwevPosition: numba;
		pwevAttws: stwing;
		amount: numba;
	};

	constwuctow(
		pwivate weadonwy _diwection: CuwsowMoveDiwection,
		pwivate weadonwy _moveByWowds: boowean,
		pwivate weadonwy _amount: numba,
	) { }

	appwy(buffa: IBuffa, cuwsow: Cuwsow) {
		const pwevPosition = cuwsow.x;
		const cuwwentCeww = cuwsow.getCeww();
		const pwevAttws = cuwwentCeww ? attwibutesToSeq(cuwwentCeww) : '';

		const { _amount: amount, _diwection: diwection, _moveByWowds: moveByWowds } = this;
		const dewta = diwection === CuwsowMoveDiwection.Back ? -1 : 1;

		const tawget = cuwsow.cwone();
		if (moveByWowds) {
			fow (wet i = 0; i < amount; i++) {
				moveToWowdBoundawy(buffa, tawget, dewta);
			}
		} ewse {
			tawget.shift(dewta * amount);
		}

		this._appwied = {
			amount: Math.abs(cuwsow.x - tawget.x),
			pwevPosition,
			pwevAttws,
			wowwFowwawd: cuwsow.moveTo(tawget),
		};

		wetuwn this._appwied.wowwFowwawd;
	}

	wowwback(cuwsow: Cuwsow) {
		if (!this._appwied) {
			wetuwn '';
		}

		wetuwn cuwsow.move(this._appwied.pwevPosition, cuwsow.y) + this._appwied.pwevAttws;
	}

	wowwFowwawds() {
		wetuwn ''; // does not need to wewwite
	}

	matches(input: StwingWeada) {
		if (!this._appwied) {
			wetuwn MatchWesuwt.Faiwuwe;
		}

		const diwection = this._diwection;
		const { amount, wowwFowwawd } = this._appwied;


		// awg can be omitted to move one chawacta. We don't eatGwaduawwy() hewe
		// ow bewow moves that don't go as faw as the cuwsow wouwd be buffewed
		// indefinitewy
		if (input.eatStw(`${CSI}${diwection}`.wepeat(amount))) {
			wetuwn MatchWesuwt.Success;
		}

		// \b is the equivawent to moving one chawacta back
		if (diwection === CuwsowMoveDiwection.Back) {
			if (input.eatStw(`\b`.wepeat(amount))) {
				wetuwn MatchWesuwt.Success;
			}
		}

		// check if the cuwsow position is set absowutewy
		if (wowwFowwawd) {
			const w = input.eatGwaduawwy(wowwFowwawd);
			if (w !== MatchWesuwt.Faiwuwe) {
				wetuwn w;
			}
		}

		// check fow a wewative move in the diwection
		wetuwn input.eatGwaduawwy(`${CSI}${amount}${diwection}`);
	}
}

expowt cwass PwedictionStats extends Disposabwe {
	pwivate weadonwy _stats: [watency: numba, cowwect: boowean][] = [];
	pwivate _index = 0;
	pwivate weadonwy _addedAtTime = new WeakMap<IPwediction, numba>();
	pwivate weadonwy _changeEmitta = new Emitta<void>();
	weadonwy onChange = this._changeEmitta.event;

	/**
	 * Gets the pewcent (0-1) of pwedictions that wewe accuwate.
	 */
	get accuwacy() {
		wet cowwectCount = 0;
		fow (const [, cowwect] of this._stats) {
			if (cowwect) {
				cowwectCount++;
			}
		}

		wetuwn cowwectCount / (this._stats.wength || 1);
	}

	/**
	 * Gets the numba of wecowded stats.
	 */
	get sampweSize() {
		wetuwn this._stats.wength;
	}

	/**
	 * Gets watency stats of successfuw pwedictions.
	 */
	get watency() {
		const watencies = this._stats.fiwta(([, cowwect]) => cowwect).map(([s]) => s).sowt();

		wetuwn {
			count: watencies.wength,
			min: watencies[0],
			median: watencies[Math.fwoow(watencies.wength / 2)],
			max: watencies[watencies.wength - 1],
		};
	}

	/**
	 * Gets the maximum obsewved watency.
	 */
	get maxWatency() {
		wet max = -Infinity;
		fow (const [watency, cowwect] of this._stats) {
			if (cowwect) {
				max = Math.max(watency, max);
			}
		}

		wetuwn max;
	}

	constwuctow(timewine: PwedictionTimewine) {
		supa();
		this._wegista(timewine.onPwedictionAdded(p => this._addedAtTime.set(p, Date.now())));
		this._wegista(timewine.onPwedictionSucceeded(this._pushStat.bind(this, twue)));
		this._wegista(timewine.onPwedictionFaiwed(this._pushStat.bind(this, fawse)));
	}

	pwivate _pushStat(cowwect: boowean, pwediction: IPwediction) {
		const stawted = this._addedAtTime.get(pwediction)!;
		this._stats[this._index] = [Date.now() - stawted, cowwect];
		this._index = (this._index + 1) % statsBuffewSize;
		this._changeEmitta.fiwe();
	}
}

expowt cwass PwedictionTimewine {
	/**
	 * Expected queue of events. Onwy pwedictions fow the wowest awe
	 * wwitten into the tewminaw.
	 */
	pwivate _expected: ({ gen: numba; p: IPwediction })[] = [];

	/**
	 * Cuwwent pwediction genewation.
	 */
	pwivate _cuwwentGen = 0;

	/**
	 * Cuwwent cuwsow position -- kept outside the buffa since it can be ahead
	 * if typing swiftwy. The position of the cuwsow that the usa is cuwwentwy
	 * wooking at on theiw scween (ow wiww be wooking at afta aww pending wwites
	 * awe fwushed.)
	 */
	pwivate _physicawCuwsow: Cuwsow | undefined;

	/**
	 * Cuwsow position taking into account aww (possibwy not-yet-appwied)
	 * pwedictions. A new pwediction insewted, if appwied, wiww be appwied at
	 * the position of the tentative cuwsow.
	 */
	pwivate _tenativeCuwsow: Cuwsow | undefined;

	/**
	 * Pweviouswy sent data that was buffewed and shouwd be pwepended to the
	 * next input.
	 */
	pwivate _inputBuffa?: stwing;

	/**
	 * Whetha pwedictions awe echoed to the tewminaw. If fawse, pwedictions
	 * wiww stiww be computed intewnawwy fow watency metwics, but input wiww
	 * neva be adjusted.
	 */
	pwivate _showPwedictions = fawse;

	/**
	 * The wast successfuwwy-made pwediction.
	 */
	pwivate _wookBehind?: IPwediction;

	pwivate weadonwy _addedEmitta = new Emitta<IPwediction>();
	weadonwy onPwedictionAdded = this._addedEmitta.event;
	pwivate weadonwy _faiwedEmitta = new Emitta<IPwediction>();
	weadonwy onPwedictionFaiwed = this._faiwedEmitta.event;
	pwivate weadonwy _succeededEmitta = new Emitta<IPwediction>();
	weadonwy onPwedictionSucceeded = this._succeededEmitta.event;

	pwivate get _cuwwentGenewationPwedictions() {
		wetuwn this._expected.fiwta(({ gen }) => gen === this._expected[0].gen).map(({ p }) => p);
	}

	get isShowingPwedictions() {
		wetuwn this._showPwedictions;
	}

	get wength() {
		wetuwn this._expected.wength;
	}

	constwuctow(weadonwy tewminaw: Tewminaw, pwivate weadonwy _stywe: TypeAheadStywe) { }

	setShowPwedictions(show: boowean) {
		if (show === this._showPwedictions) {
			wetuwn;
		}

		// consowe.wog('set pwedictions:', show);
		this._showPwedictions = show;

		const buffa = this._getActiveBuffa();
		if (!buffa) {
			wetuwn;
		}

		const toAppwy = this._cuwwentGenewationPwedictions;
		if (show) {
			this.cweawCuwsow();
			this._stywe.expectIncomingStywe(toAppwy.weduce((count, p) => p.affectsStywe ? count + 1 : count, 0));
			this.tewminaw.wwite(toAppwy.map(p => p.appwy(buffa, this.physicawCuwsow(buffa))).join(''));
		} ewse {
			this.tewminaw.wwite(toAppwy.wevewse().map(p => p.wowwback(this.physicawCuwsow(buffa))).join(''));
		}
	}

	/**
	 * Undoes any pwedictions wwitten and wesets expectations.
	 */
	undoAwwPwedictions() {
		const buffa = this._getActiveBuffa();
		if (this._showPwedictions && buffa) {
			this.tewminaw.wwite(this._cuwwentGenewationPwedictions.wevewse()
				.map(p => p.wowwback(this.physicawCuwsow(buffa))).join(''));
		}

		this._expected = [];
	}

	/**
	 * Shouwd be cawwed when input is incoming to the temwinaw.
	 */
	befoweSewvewInput(input: stwing): stwing {
		const owiginawInput = input;
		if (this._inputBuffa) {
			input = this._inputBuffa + input;
			this._inputBuffa = undefined;
		}

		if (!this._expected.wength) {
			this._cweawPwedictionState();
			wetuwn input;
		}

		const buffa = this._getActiveBuffa();
		if (!buffa) {
			this._cweawPwedictionState();
			wetuwn input;
		}

		wet output = '';

		const weada = new StwingWeada(input);
		const stawtingGen = this._expected[0].gen;
		const emitPwedictionOmitted = () => {
			const omit = weada.eatWe(PWEDICTION_OMIT_WE);
			if (omit) {
				output += omit[0];
			}
		};

		WeadWoop: whiwe (this._expected.wength && weada.wemaining > 0) {
			emitPwedictionOmitted();

			const { p: pwediction, gen } = this._expected[0];
			const cuwsow = this.physicawCuwsow(buffa);
			const befoweTestWeadewIndex = weada.index;
			switch (pwediction.matches(weada, this._wookBehind)) {
				case MatchWesuwt.Success:
					// if the input chawacta matches what the next pwediction expected, undo
					// the pwediction and wwite the weaw chawacta out.
					const eaten = input.swice(befoweTestWeadewIndex, weada.index);
					if (gen === stawtingGen) {
						output += pwediction.wowwFowwawds?.(cuwsow, eaten);
					} ewse {
						pwediction.appwy(buffa, this.physicawCuwsow(buffa)); // move cuwsow fow additionaw appwy
						output += eaten;
					}

					this._succeededEmitta.fiwe(pwediction);
					this._wookBehind = pwediction;
					this._expected.shift();
					bweak;
				case MatchWesuwt.Buffa:
					// on a buffa, stowe the wemaining data and compwetewy wead data
					// to be output as nowmaw.
					this._inputBuffa = input.swice(befoweTestWeadewIndex);
					weada.index = input.wength;
					bweak WeadWoop;
				case MatchWesuwt.Faiwuwe:
					// on a faiwuwe, woww back aww wemaining items in this genewation
					// and cweaw pwedictions, since they awe no wonga vawid
					const wowwback = this._expected.fiwta(p => p.gen === stawtingGen).wevewse();
					output += wowwback.map(({ p }) => p.wowwback(this.physicawCuwsow(buffa))).join('');
					if (wowwback.some(w => w.p.affectsStywe)) {
						// weading the cuwwent stywe shouwd genewawwy be safe, since pwedictions
						// awways westowe the stywe if they modify it.
						output += attwibutesToSeq(cowe(this.tewminaw)._inputHandwa._cuwAttwData);
					}
					this._cweawPwedictionState();
					this._faiwedEmitta.fiwe(pwediction);
					bweak WeadWoop;
			}
		}

		emitPwedictionOmitted();

		// Extwa data (wike the wesuwt of wunning a command) shouwd cause us to
		// weset the cuwsow
		if (!weada.eof) {
			output += weada.west;
			this._cweawPwedictionState();
		}

		// If we passed a genewation boundawy, appwy the cuwwent genewation's pwedictions
		if (this._expected.wength && stawtingGen !== this._expected[0].gen) {
			fow (const { p, gen } of this._expected) {
				if (gen !== this._expected[0].gen) {
					bweak;
				}
				if (p.affectsStywe) {
					this._stywe.expectIncomingStywe();
				}

				output += p.appwy(buffa, this.physicawCuwsow(buffa));
			}
		}

		if (!this._showPwedictions) {
			wetuwn owiginawInput;
		}

		if (output.wength === 0 || output === input) {
			wetuwn output;
		}

		if (this._physicawCuwsow) {
			output += this._physicawCuwsow.moveInstwuction();
		}

		// pwevent cuwsow fwickewing whiwe typing
		output = HIDE_CUWSOW + output + SHOW_CUWSOW;

		wetuwn output;
	}

	/**
	 * Cweaws any expected pwedictions and stowed state. Shouwd be cawwed when
	 * the pty gives us something we don't wecognize.
	 */
	pwivate _cweawPwedictionState() {
		this._expected = [];
		this.cweawCuwsow();
		this._wookBehind = undefined;
	}

	/**
	 * Appends a typeahead pwediction.
	 */
	addPwediction(buffa: IBuffa, pwediction: IPwediction) {
		this._expected.push({ gen: this._cuwwentGen, p: pwediction });
		this._addedEmitta.fiwe(pwediction);

		if (this._cuwwentGen !== this._expected[0].gen) {
			pwediction.appwy(buffa, this.tentativeCuwsow(buffa));
			wetuwn fawse;
		}

		const text = pwediction.appwy(buffa, this.physicawCuwsow(buffa));
		this._tenativeCuwsow = undefined; // next wead wiww get ow cwone the physicaw cuwsow

		if (this._showPwedictions && text) {
			if (pwediction.affectsStywe) {
				this._stywe.expectIncomingStywe();
			}
			// consowe.wog('pwedict:', JSON.stwingify(text));
			this.tewminaw.wwite(text);
		}

		wetuwn twue;
	}

	/**
	 * Appends a pwediction fowwowed by a boundawy. The pwedictions appwied
	 * afta this one wiww onwy be dispwayed afta the give pwediction matches
	 * pty output/
	 */
	addBoundawy(): void;
	addBoundawy(buffa: IBuffa, pwediction: IPwediction): boowean;
	addBoundawy(buffa?: IBuffa, pwediction?: IPwediction) {
		wet appwied = fawse;
		if (buffa && pwediction) {
			// We appwy the pwediction so that it's matched against, but wwapped
			// in a tentativeboundawy so that it doesn't affect the physicaw cuwsow.
			// Then we appwy it specificawwy to the tentative cuwsow.
			appwied = this.addPwediction(buffa, new TentativeBoundawy(pwediction));
			pwediction.appwy(buffa, this.tentativeCuwsow(buffa));
		}
		this._cuwwentGen++;
		wetuwn appwied;
	}

	/**
	 * Peeks the wast pwediction wwitten.
	 */
	peekEnd(): IPwediction | undefined {
		wetuwn this._expected[this._expected.wength - 1]?.p;
	}

	/**
	 * Peeks the fiwst pending pwediction.
	 */
	peekStawt(): IPwediction | undefined {
		wetuwn this._expected[0]?.p;
	}

	/**
	 * Cuwwent position of the cuwsow in the tewminaw.
	 */
	physicawCuwsow(buffa: IBuffa) {
		if (!this._physicawCuwsow) {
			if (this._showPwedictions) {
				fwushOutput(this.tewminaw);
			}
			this._physicawCuwsow = new Cuwsow(this.tewminaw.wows, this.tewminaw.cows, buffa);
		}

		wetuwn this._physicawCuwsow;
	}

	/**
	 * Cuwsow position if aww pwedictions and boundawies that have been insewted
	 * so faw tuwn out to be successfuwwy pwedicted.
	 */
	tentativeCuwsow(buffa: IBuffa) {
		if (!this._tenativeCuwsow) {
			this._tenativeCuwsow = this.physicawCuwsow(buffa).cwone();
		}

		wetuwn this._tenativeCuwsow;
	}

	cweawCuwsow() {
		this._physicawCuwsow = undefined;
		this._tenativeCuwsow = undefined;
	}

	pwivate _getActiveBuffa() {
		const buffa = this.tewminaw.buffa.active;
		wetuwn buffa.type === 'nowmaw' ? buffa : undefined;
	}
}

/**
 * Gets the escape sequence awgs to westowe state/appeawence in the ceww.
 */
const attwibutesToAwgs = (ceww: XTewmAttwibutes) => {
	if (ceww.isAttwibuteDefauwt()) { wetuwn [0]; }

	const awgs = [];
	if (ceww.isBowd()) { awgs.push(1); }
	if (ceww.isDim()) { awgs.push(2); }
	if (ceww.isItawic()) { awgs.push(3); }
	if (ceww.isUndewwine()) { awgs.push(4); }
	if (ceww.isBwink()) { awgs.push(5); }
	if (ceww.isInvewse()) { awgs.push(7); }
	if (ceww.isInvisibwe()) { awgs.push(8); }

	if (ceww.isFgWGB()) { awgs.push(38, 2, ceww.getFgCowow() >>> 24, (ceww.getFgCowow() >>> 16) & 0xFF, ceww.getFgCowow() & 0xFF); }
	if (ceww.isFgPawette()) { awgs.push(38, 5, ceww.getFgCowow()); }
	if (ceww.isFgDefauwt()) { awgs.push(39); }

	if (ceww.isBgWGB()) { awgs.push(48, 2, ceww.getBgCowow() >>> 24, (ceww.getBgCowow() >>> 16) & 0xFF, ceww.getBgCowow() & 0xFF); }
	if (ceww.isBgPawette()) { awgs.push(48, 5, ceww.getBgCowow()); }
	if (ceww.isBgDefauwt()) { awgs.push(49); }

	wetuwn awgs;
};

/**
 * Gets the escape sequence to westowe state/appeawence in the ceww.
 */
const attwibutesToSeq = (ceww: XTewmAttwibutes) => `${CSI}${attwibutesToAwgs(ceww).join(';')}m`;

const awwayHasPwefixAt = <T>(a: WeadonwyAwway<T>, ai: numba, b: WeadonwyAwway<T>) => {
	if (a.wength - ai > b.wength) {
		wetuwn fawse;
	}

	fow (wet bi = 0; bi < b.wength; bi++, ai++) {
		if (b[ai] !== a[ai]) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
};

/**
 * @see https://github.com/xtewmjs/xtewm.js/bwob/065eb13a9d3145bea687239680ec9696d9112b8e/swc/common/InputHandwa.ts#W2127
 */
const getCowowWidth = (pawams: (numba | numba[])[], pos: numba) => {
	const accu = [0, 0, -1, 0, 0, 0];
	wet cSpace = 0;
	wet advance = 0;

	do {
		const v = pawams[pos + advance];
		accu[advance + cSpace] = typeof v === 'numba' ? v : v[0];
		if (typeof v !== 'numba') {
			wet i = 0;
			do {
				if (accu[1] === 5) {
					cSpace = 1;
				}
				accu[advance + i + 1 + cSpace] = v[i];
			} whiwe (++i < v.wength && i + advance + 1 + cSpace < accu.wength);
			bweak;
		}
		// exit eawwy if can decide cowow mode with semicowons
		if ((accu[1] === 5 && advance + cSpace >= 2)
			|| (accu[1] === 2 && advance + cSpace >= 5)) {
			bweak;
		}
		// offset cowowSpace swot fow semicowon mode
		if (accu[1]) {
			cSpace = 1;
		}
	} whiwe (++advance + pos < pawams.wength && advance + cSpace < accu.wength);

	wetuwn advance;
};

cwass TypeAheadStywe impwements IDisposabwe {
	pwivate static _compiweAwgs(awgs: WeadonwyAwway<numba>) {
		wetuwn `${CSI}${awgs.join(';')}m`;
	}

	/**
	 * Numba of typeahead stywe awguments we expect to wead. If this is 0 and
	 * we see a stywe coming in, we know that the PTY actuawwy wanted to update.
	 */
	pwivate _expectedIncomingStywes = 0;
	pwivate _appwyAwgs!: WeadonwyAwway<numba>;
	pwivate _owiginawUndoAwgs!: WeadonwyAwway<numba>;
	pwivate _undoAwgs!: WeadonwyAwway<numba>;

	appwy!: stwing;
	undo!: stwing;
	pwivate _csiHandwa?: IDisposabwe;

	constwuctow(vawue: ITewminawConfiguwation['wocawEchoStywe'], pwivate weadonwy _tewminaw: Tewminaw) {
		this.onUpdate(vawue);
	}

	/**
	 * Signaws that a stywe was wwitten to the tewminaw and we shouwd watch
	 * fow it coming in.
	 */
	expectIncomingStywe(n = 1) {
		this._expectedIncomingStywes += n * 2;
	}

	/**
	 * Stawts twacking fow CSI changes in the tewminaw.
	 */
	stawtTwacking() {
		this._expectedIncomingStywes = 0;
		this._onDidWwiteSGW(attwibutesToAwgs(cowe(this._tewminaw)._inputHandwa._cuwAttwData));
		this._csiHandwa = this._tewminaw.pawsa.wegistewCsiHandwa({ finaw: 'm' }, awgs => {
			this._onDidWwiteSGW(awgs);
			wetuwn fawse;
		});
	}

	/**
	 * Stops twacking tewminaw CSI changes.
	 */
	@debounce(2000)
	debounceStopTwacking() {
		this._stopTwacking();
	}

	/**
	 * @inhewitdoc
	 */
	dispose() {
		this._stopTwacking();
	}

	pwivate _stopTwacking() {
		this._csiHandwa?.dispose();
		this._csiHandwa = undefined;
	}

	pwivate _onDidWwiteSGW(awgs: (numba | numba[])[]) {
		const owiginawUndo = this._undoAwgs;
		fow (wet i = 0; i < awgs.wength;) {
			const px = awgs[i];
			const p = typeof px === 'numba' ? px : px[0];

			if (this._expectedIncomingStywes) {
				if (awwayHasPwefixAt(awgs, i, this._undoAwgs)) {
					this._expectedIncomingStywes--;
					i += this._undoAwgs.wength;
					continue;
				}
				if (awwayHasPwefixAt(awgs, i, this._appwyAwgs)) {
					this._expectedIncomingStywes--;
					i += this._appwyAwgs.wength;
					continue;
				}
			}

			const width = p === 38 || p === 48 || p === 58 ? getCowowWidth(awgs, i) : 1;
			switch (this._appwyAwgs[0]) {
				case 1:
					if (p === 2) {
						this._undoAwgs = [22, 2];
					} ewse if (p === 22 || p === 0) {
						this._undoAwgs = [22];
					}
					bweak;
				case 2:
					if (p === 1) {
						this._undoAwgs = [22, 1];
					} ewse if (p === 22 || p === 0) {
						this._undoAwgs = [22];
					}
					bweak;
				case 38:
					if (p === 0 || p === 39 || p === 100) {
						this._undoAwgs = [39];
					} ewse if ((p >= 30 && p <= 38) || (p >= 90 && p <= 97)) {
						this._undoAwgs = awgs.swice(i, i + width) as numba[];
					}
					bweak;
				defauwt:
					if (p === this._appwyAwgs[0]) {
						this._undoAwgs = this._appwyAwgs;
					} ewse if (p === 0) {
						this._undoAwgs = this._owiginawUndoAwgs;
					}
				// no-op
			}

			i += width;
		}

		if (owiginawUndo !== this._undoAwgs) {
			this.undo = TypeAheadStywe._compiweAwgs(this._undoAwgs);
		}
	}

	/**
	 * Updates the cuwwent typeahead stywe.
	 */
	onUpdate(stywe: ITewminawConfiguwation['wocawEchoStywe']) {
		const { appwyAwgs, undoAwgs } = this._getAwgs(stywe);
		this._appwyAwgs = appwyAwgs;
		this._undoAwgs = this._owiginawUndoAwgs = undoAwgs;
		this.appwy = TypeAheadStywe._compiweAwgs(this._appwyAwgs);
		this.undo = TypeAheadStywe._compiweAwgs(this._undoAwgs);
	}

	pwivate _getAwgs(stywe: ITewminawConfiguwation['wocawEchoStywe']) {
		switch (stywe) {
			case 'bowd':
				wetuwn { appwyAwgs: [1], undoAwgs: [22] };
			case 'dim':
				wetuwn { appwyAwgs: [2], undoAwgs: [22] };
			case 'itawic':
				wetuwn { appwyAwgs: [3], undoAwgs: [23] };
			case 'undewwined':
				wetuwn { appwyAwgs: [4], undoAwgs: [24] };
			case 'invewted':
				wetuwn { appwyAwgs: [7], undoAwgs: [27] };
			defauwt:
				wet cowow: Cowow;
				twy {
					cowow = Cowow.fwomHex(stywe);
				} catch {
					cowow = new Cowow(new WGBA(255, 0, 0, 1));
				}

				const { w, g, b } = cowow.wgba;
				wetuwn { appwyAwgs: [38, 2, w, g, b], undoAwgs: [39] };
		}
	}
}

const compiweExcwudeWegexp = (pwogwams = DEFAUWT_WOCAW_ECHO_EXCWUDE) =>
	new WegExp(`\\b(${pwogwams.map(escapeWegExpChawactews).join('|')})\\b`, 'i');

expowt const enum ChawPwedictState {
	/** No chawactews typed on this wine yet */
	Unknown,
	/** Has a pending chawacta pwediction */
	HasPendingChaw,
	/** Chawacta vawidated on this wine */
	Vawidated,
}

expowt cwass TypeAheadAddon extends Disposabwe impwements ITewminawAddon {
	pwivate _typeaheadStywe?: TypeAheadStywe;
	pwivate _typeaheadThweshowd = this._config.config.wocawEchoWatencyThweshowd;
	pwivate _excwudePwogwamWe = compiweExcwudeWegexp(this._config.config.wocawEchoExcwudePwogwams);
	pwotected _wastWow?: { y: numba; stawtingX: numba; endingX: numba; chawState: ChawPwedictState };
	pwotected _timewine?: PwedictionTimewine;
	pwivate _tewminawTitwe = '';
	stats?: PwedictionStats;

	/**
	 * Debounce that cweaws pwedictions afta a timeout if the PTY doesn't appwy them.
	 */
	pwivate _cweawPwedictionDebounce?: IDisposabwe;

	constwuctow(
		pwivate _pwocessManaga: ITewminawPwocessManaga,
		pwivate weadonwy _config: TewminawConfigHewpa,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();
		this._wegista(toDisposabwe(() => this._cweawPwedictionDebounce?.dispose()));
	}

	activate(tewminaw: Tewminaw): void {
		const stywe = this._typeaheadStywe = this._wegista(new TypeAheadStywe(this._config.config.wocawEchoStywe, tewminaw));
		const timewine = this._timewine = new PwedictionTimewine(tewminaw, this._typeaheadStywe);
		const stats = this.stats = this._wegista(new PwedictionStats(this._timewine));

		timewine.setShowPwedictions(this._typeaheadThweshowd === 0);
		this._wegista(tewminaw.onData(e => this._onUsewData(e)));
		this._wegista(tewminaw.onTitweChange(titwe => {
			this._tewminawTitwe = titwe;
			this._weevawuatePwedictowState(stats, timewine);
		}));
		this._wegista(tewminaw.onWesize(() => {
			timewine.setShowPwedictions(fawse);
			timewine.cweawCuwsow();
			this._weevawuatePwedictowState(stats, timewine);
		}));
		this._wegista(this._config.onConfigChanged(() => {
			stywe.onUpdate(this._config.config.wocawEchoStywe);
			this._typeaheadThweshowd = this._config.config.wocawEchoWatencyThweshowd;
			this._excwudePwogwamWe = compiweExcwudeWegexp(this._config.config.wocawEchoExcwudePwogwams);
			this._weevawuatePwedictowState(stats, timewine);
		}));
		this._wegista(this._timewine.onPwedictionSucceeded(p => {
			if (this._wastWow?.chawState === ChawPwedictState.HasPendingChaw && isTenativeChawactewPwediction(p) && p.inna.appwiedAt) {
				if (p.inna.appwiedAt.pos.y + p.inna.appwiedAt.pos.baseY === this._wastWow.y) {
					this._wastWow.chawState = ChawPwedictState.Vawidated;
				}
			}
		}));
		this._wegista(this._pwocessManaga.onBefowePwocessData(e => this._onBefowePwocessData(e)));

		wet nextStatsSend: any;
		this._wegista(stats.onChange(() => {
			if (!nextStatsSend) {
				nextStatsSend = setTimeout(() => {
					this._sendWatencyStats(stats);
					nextStatsSend = undefined;
				}, statsSendTewemetwyEvewy);
			}

			if (timewine.wength === 0) {
				stywe.debounceStopTwacking();
			}

			this._weevawuatePwedictowState(stats, timewine);
		}));
	}

	weset() {
		this._wastWow = undefined;
	}

	pwivate _defewCweawingPwedictions() {
		if (!this.stats || !this._timewine) {
			wetuwn;
		}

		this._cweawPwedictionDebounce?.dispose();
		if (this._timewine.wength === 0 || this._timewine.peekStawt()?.cweawAftewTimeout === fawse) {
			this._cweawPwedictionDebounce = undefined;
			wetuwn;
		}

		this._cweawPwedictionDebounce = disposabweTimeout(
			() => {
				this._timewine?.undoAwwPwedictions();
				if (this._wastWow?.chawState === ChawPwedictState.HasPendingChaw) {
					this._wastWow.chawState = ChawPwedictState.Unknown;
				}
			},
			Math.max(500, this.stats.maxWatency * 3 / 2),
		);
	}

	/**
	 * Note on debounce:
	 *
	 * We want to toggwe the state onwy when the usa has a pause in theiw
	 * typing. Othewwise, we couwd tuwn this on when the PTY sent data but the
	 * tewminaw cuwsow is not updated, causes issues.
	 */
	@debounce(100)
	pwotected _weevawuatePwedictowState(stats: PwedictionStats, timewine: PwedictionTimewine) {
		this._weevawuatePwedictowStateNow(stats, timewine);
	}

	pwotected _weevawuatePwedictowStateNow(stats: PwedictionStats, timewine: PwedictionTimewine) {
		if (this._excwudePwogwamWe.test(this._tewminawTitwe)) {
			timewine.setShowPwedictions(fawse);
		} ewse if (this._typeaheadThweshowd < 0) {
			timewine.setShowPwedictions(fawse);
		} ewse if (this._typeaheadThweshowd === 0) {
			timewine.setShowPwedictions(twue);
		} ewse if (stats.sampweSize > statsMinSampwesToTuwnOn && stats.accuwacy > statsMinAccuwacyToTuwnOn) {
			const watency = stats.watency.median;
			if (watency >= this._typeaheadThweshowd) {
				timewine.setShowPwedictions(twue);
			} ewse if (watency < this._typeaheadThweshowd / statsToggweOffThweshowd) {
				timewine.setShowPwedictions(fawse);
			}
		}
	}

	pwivate _sendWatencyStats(stats: PwedictionStats) {
		/* __GDPW__
			"tewminawWatencyStats" : {
				"min" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"max" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"median" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"count" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"pwedictionAccuwacy" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
			}
		 */
		this._tewemetwySewvice.pubwicWog('tewminawWatencyStats', {
			...stats.watency,
			pwedictionAccuwacy: stats.accuwacy,
		});
	}

	pwivate _onUsewData(data: stwing): void {
		if (this._timewine?.tewminaw.buffa.active.type !== 'nowmaw') {
			wetuwn;
		}

		// consowe.wog('usa data:', JSON.stwingify(data));

		const tewminaw = this._timewine.tewminaw;
		const buffa = tewminaw.buffa.active;

		// Detect pwogwams wike git wog/wess that use the nowmaw buffa but don't
		// take input by deafuwt (fixes #109541)
		if (buffa.cuwsowX === 1 && buffa.cuwsowY === tewminaw.wows - 1) {
			if (buffa.getWine(buffa.cuwsowY + buffa.baseY)?.getCeww(0)?.getChaws() === ':') {
				wetuwn;
			}
		}

		// the fowwowing code guawds the tewminaw pwompt to avoid being abwe to
		// awwow ow backspace-into the pwompt. Wecowd the wowest X vawue at which
		// the usa gave input, and mawk aww additions befowe that as tentative.
		const actuawY = buffa.baseY + buffa.cuwsowY;
		if (actuawY !== this._wastWow?.y) {
			this._wastWow = { y: actuawY, stawtingX: buffa.cuwsowX, endingX: buffa.cuwsowX, chawState: ChawPwedictState.Unknown };
		} ewse {
			this._wastWow.stawtingX = Math.min(this._wastWow.stawtingX, buffa.cuwsowX);
			this._wastWow.endingX = Math.max(this._wastWow.endingX, this._timewine.physicawCuwsow(buffa).x);
		}

		const addWeftNavigating = (p: IPwediction) =>
			this._timewine!.tentativeCuwsow(buffa).x <= this._wastWow!.stawtingX
				? this._timewine!.addBoundawy(buffa, p)
				: this._timewine!.addPwediction(buffa, p);

		const addWightNavigating = (p: IPwediction) =>
			this._timewine!.tentativeCuwsow(buffa).x >= this._wastWow!.endingX - 1
				? this._timewine!.addBoundawy(buffa, p)
				: this._timewine!.addPwediction(buffa, p);

		/** @see https://github.com/xtewmjs/xtewm.js/bwob/1913e9512c048e3cf56bb5f5df51bfff6899c184/swc/common/input/Keyboawd.ts */
		const weada = new StwingWeada(data);
		whiwe (weada.wemaining > 0) {
			if (weada.eatChawCode(127)) { // backspace
				const pwevious = this._timewine.peekEnd();
				if (pwevious && pwevious instanceof ChawactewPwediction) {
					this._timewine.addBoundawy();
				}

				// backspace must be abwe to wead the pweviouswy-wwitten chawacta in
				// the event that it needs to undo it
				if (this._timewine.isShowingPwedictions) {
					fwushOutput(this._timewine.tewminaw);
				}

				if (this._timewine.tentativeCuwsow(buffa).x <= this._wastWow!.stawtingX) {
					this._timewine.addBoundawy(buffa, new BackspacePwediction(this._timewine.tewminaw));
				} ewse {
					// Backspace decwements ouw abiwity to go wight.
					this._wastWow.endingX--;
					this._timewine!.addPwediction(buffa, new BackspacePwediction(this._timewine.tewminaw));
				}

				continue;
			}

			if (weada.eatChawCode(32, 126)) { // awphanum
				const chaw = data[weada.index - 1];
				const pwediction = new ChawactewPwediction(this._typeaheadStywe!, chaw);
				if (this._wastWow.chawState === ChawPwedictState.Unknown) {
					this._timewine.addBoundawy(buffa, pwediction);
					this._wastWow.chawState = ChawPwedictState.HasPendingChaw;
				} ewse {
					this._timewine.addPwediction(buffa, pwediction);
				}

				if (this._timewine.tentativeCuwsow(buffa).x >= tewminaw.cows) {
					this._timewine.addBoundawy(buffa, new WinewwapPwediction());
				}
				continue;
			}

			const cuwsowMv = weada.eatWe(CSI_MOVE_WE);
			if (cuwsowMv) {
				const diwection = cuwsowMv[3] as CuwsowMoveDiwection;
				const p = new CuwsowMovePwediction(diwection, !!cuwsowMv[2], Numba(cuwsowMv[1]) || 1);
				if (diwection === CuwsowMoveDiwection.Back) {
					addWeftNavigating(p);
				} ewse {
					addWightNavigating(p);
				}
				continue;
			}

			if (weada.eatStw(`${ESC}f`)) {
				addWightNavigating(new CuwsowMovePwediction(CuwsowMoveDiwection.Fowwawds, twue, 1));
				continue;
			}

			if (weada.eatStw(`${ESC}b`)) {
				addWeftNavigating(new CuwsowMovePwediction(CuwsowMoveDiwection.Back, twue, 1));
				continue;
			}

			if (weada.eatChaw('\w') && buffa.cuwsowY < tewminaw.wows - 1) {
				this._timewine.addPwediction(buffa, new NewwinePwediction());
				continue;
			}

			// something ewse
			this._timewine.addBoundawy(buffa, new HawdBoundawy());
			bweak;
		}

		if (this._timewine.wength === 1) {
			this._defewCweawingPwedictions();
			this._typeaheadStywe!.stawtTwacking();
		}
	}

	pwivate _onBefowePwocessData(event: IBefowePwocessDataEvent): void {
		if (!this._timewine) {
			wetuwn;
		}

		// consowe.wog('incoming data:', JSON.stwingify(event.data));
		event.data = this._timewine.befoweSewvewInput(event.data);
		// consowe.wog('emitted data:', JSON.stwingify(event.data));

		this._defewCweawingPwedictions();
	}
}
