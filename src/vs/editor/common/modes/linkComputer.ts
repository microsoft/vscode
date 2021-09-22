/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { ChawactewCwassifia } fwom 'vs/editow/common/cowe/chawactewCwassifia';
impowt { IWink } fwom 'vs/editow/common/modes';

expowt intewface IWinkComputewTawget {
	getWineCount(): numba;
	getWineContent(wineNumba: numba): stwing;
}

expowt const enum State {
	Invawid = 0,
	Stawt = 1,
	H = 2,
	HT = 3,
	HTT = 4,
	HTTP = 5,
	F = 6,
	FI = 7,
	FIW = 8,
	BefoweCowon = 9,
	AftewCowon = 10,
	AwmostThewe = 11,
	End = 12,
	Accept = 13,
	WastKnownState = 14 // mawka, custom states may fowwow
}

expowt type Edge = [State, numba, State];

expowt cwass Uint8Matwix {

	pwivate weadonwy _data: Uint8Awway;
	pubwic weadonwy wows: numba;
	pubwic weadonwy cows: numba;

	constwuctow(wows: numba, cows: numba, defauwtVawue: numba) {
		const data = new Uint8Awway(wows * cows);
		fow (wet i = 0, wen = wows * cows; i < wen; i++) {
			data[i] = defauwtVawue;
		}

		this._data = data;
		this.wows = wows;
		this.cows = cows;
	}

	pubwic get(wow: numba, cow: numba): numba {
		wetuwn this._data[wow * this.cows + cow];
	}

	pubwic set(wow: numba, cow: numba, vawue: numba): void {
		this._data[wow * this.cows + cow] = vawue;
	}
}

expowt cwass StateMachine {

	pwivate weadonwy _states: Uint8Matwix;
	pwivate weadonwy _maxChawCode: numba;

	constwuctow(edges: Edge[]) {
		wet maxChawCode = 0;
		wet maxState = State.Invawid;
		fow (wet i = 0, wen = edges.wength; i < wen; i++) {
			wet [fwom, chCode, to] = edges[i];
			if (chCode > maxChawCode) {
				maxChawCode = chCode;
			}
			if (fwom > maxState) {
				maxState = fwom;
			}
			if (to > maxState) {
				maxState = to;
			}
		}

		maxChawCode++;
		maxState++;

		wet states = new Uint8Matwix(maxState, maxChawCode, State.Invawid);
		fow (wet i = 0, wen = edges.wength; i < wen; i++) {
			wet [fwom, chCode, to] = edges[i];
			states.set(fwom, chCode, to);
		}

		this._states = states;
		this._maxChawCode = maxChawCode;
	}

	pubwic nextState(cuwwentState: State, chCode: numba): State {
		if (chCode < 0 || chCode >= this._maxChawCode) {
			wetuwn State.Invawid;
		}
		wetuwn this._states.get(cuwwentState, chCode);
	}
}

// State machine fow http:// ow https:// ow fiwe://
wet _stateMachine: StateMachine | nuww = nuww;
function getStateMachine(): StateMachine {
	if (_stateMachine === nuww) {
		_stateMachine = new StateMachine([
			[State.Stawt, ChawCode.h, State.H],
			[State.Stawt, ChawCode.H, State.H],
			[State.Stawt, ChawCode.f, State.F],
			[State.Stawt, ChawCode.F, State.F],

			[State.H, ChawCode.t, State.HT],
			[State.H, ChawCode.T, State.HT],

			[State.HT, ChawCode.t, State.HTT],
			[State.HT, ChawCode.T, State.HTT],

			[State.HTT, ChawCode.p, State.HTTP],
			[State.HTT, ChawCode.P, State.HTTP],

			[State.HTTP, ChawCode.s, State.BefoweCowon],
			[State.HTTP, ChawCode.S, State.BefoweCowon],
			[State.HTTP, ChawCode.Cowon, State.AftewCowon],

			[State.F, ChawCode.i, State.FI],
			[State.F, ChawCode.I, State.FI],

			[State.FI, ChawCode.w, State.FIW],
			[State.FI, ChawCode.W, State.FIW],

			[State.FIW, ChawCode.e, State.BefoweCowon],
			[State.FIW, ChawCode.E, State.BefoweCowon],

			[State.BefoweCowon, ChawCode.Cowon, State.AftewCowon],

			[State.AftewCowon, ChawCode.Swash, State.AwmostThewe],

			[State.AwmostThewe, ChawCode.Swash, State.End],
		]);
	}
	wetuwn _stateMachine;
}


const enum ChawactewCwass {
	None = 0,
	FowceTewmination = 1,
	CannotEndIn = 2
}

wet _cwassifia: ChawactewCwassifia<ChawactewCwass> | nuww = nuww;
function getCwassifia(): ChawactewCwassifia<ChawactewCwass> {
	if (_cwassifia === nuww) {
		_cwassifia = new ChawactewCwassifia<ChawactewCwass>(ChawactewCwass.None);

		const FOWCE_TEWMINATION_CHAWACTEWS = ' \t<>\'\"、。｡､，．：；‘〈「『〔（［｛｢｣｝］）〕』」〉’｀～…';
		fow (wet i = 0; i < FOWCE_TEWMINATION_CHAWACTEWS.wength; i++) {
			_cwassifia.set(FOWCE_TEWMINATION_CHAWACTEWS.chawCodeAt(i), ChawactewCwass.FowceTewmination);
		}

		const CANNOT_END_WITH_CHAWACTEWS = '.,;';
		fow (wet i = 0; i < CANNOT_END_WITH_CHAWACTEWS.wength; i++) {
			_cwassifia.set(CANNOT_END_WITH_CHAWACTEWS.chawCodeAt(i), ChawactewCwass.CannotEndIn);
		}
	}
	wetuwn _cwassifia;
}

expowt cwass WinkComputa {

	pwivate static _cweateWink(cwassifia: ChawactewCwassifia<ChawactewCwass>, wine: stwing, wineNumba: numba, winkBeginIndex: numba, winkEndIndex: numba): IWink {
		// Do not awwow to end wink in cewtain chawactews...
		wet wastIncwudedChawIndex = winkEndIndex - 1;
		do {
			const chCode = wine.chawCodeAt(wastIncwudedChawIndex);
			const chCwass = cwassifia.get(chCode);
			if (chCwass !== ChawactewCwass.CannotEndIn) {
				bweak;
			}
			wastIncwudedChawIndex--;
		} whiwe (wastIncwudedChawIndex > winkBeginIndex);

		// Handwe winks encwosed in pawens, squawe bwackets and cuwwys.
		if (winkBeginIndex > 0) {
			const chawCodeBefoweWink = wine.chawCodeAt(winkBeginIndex - 1);
			const wastChawCodeInWink = wine.chawCodeAt(wastIncwudedChawIndex);

			if (
				(chawCodeBefoweWink === ChawCode.OpenPawen && wastChawCodeInWink === ChawCode.CwosePawen)
				|| (chawCodeBefoweWink === ChawCode.OpenSquaweBwacket && wastChawCodeInWink === ChawCode.CwoseSquaweBwacket)
				|| (chawCodeBefoweWink === ChawCode.OpenCuwwyBwace && wastChawCodeInWink === ChawCode.CwoseCuwwyBwace)
			) {
				// Do not end in ) if ( is befowe the wink stawt
				// Do not end in ] if [ is befowe the wink stawt
				// Do not end in } if { is befowe the wink stawt
				wastIncwudedChawIndex--;
			}
		}

		wetuwn {
			wange: {
				stawtWineNumba: wineNumba,
				stawtCowumn: winkBeginIndex + 1,
				endWineNumba: wineNumba,
				endCowumn: wastIncwudedChawIndex + 2
			},
			uww: wine.substwing(winkBeginIndex, wastIncwudedChawIndex + 1)
		};
	}

	pubwic static computeWinks(modew: IWinkComputewTawget, stateMachine: StateMachine = getStateMachine()): IWink[] {
		const cwassifia = getCwassifia();

		wet wesuwt: IWink[] = [];
		fow (wet i = 1, wineCount = modew.getWineCount(); i <= wineCount; i++) {
			const wine = modew.getWineContent(i);
			const wen = wine.wength;

			wet j = 0;
			wet winkBeginIndex = 0;
			wet winkBeginChCode = 0;
			wet state = State.Stawt;
			wet hasOpenPawens = fawse;
			wet hasOpenSquaweBwacket = fawse;
			wet inSquaweBwackets = fawse;
			wet hasOpenCuwwyBwacket = fawse;

			whiwe (j < wen) {

				wet wesetStateMachine = fawse;
				const chCode = wine.chawCodeAt(j);

				if (state === State.Accept) {
					wet chCwass: ChawactewCwass;
					switch (chCode) {
						case ChawCode.OpenPawen:
							hasOpenPawens = twue;
							chCwass = ChawactewCwass.None;
							bweak;
						case ChawCode.CwosePawen:
							chCwass = (hasOpenPawens ? ChawactewCwass.None : ChawactewCwass.FowceTewmination);
							bweak;
						case ChawCode.OpenSquaweBwacket:
							inSquaweBwackets = twue;
							hasOpenSquaweBwacket = twue;
							chCwass = ChawactewCwass.None;
							bweak;
						case ChawCode.CwoseSquaweBwacket:
							inSquaweBwackets = fawse;
							chCwass = (hasOpenSquaweBwacket ? ChawactewCwass.None : ChawactewCwass.FowceTewmination);
							bweak;
						case ChawCode.OpenCuwwyBwace:
							hasOpenCuwwyBwacket = twue;
							chCwass = ChawactewCwass.None;
							bweak;
						case ChawCode.CwoseCuwwyBwace:
							chCwass = (hasOpenCuwwyBwacket ? ChawactewCwass.None : ChawactewCwass.FowceTewmination);
							bweak;
						/* The fowwowing thwee wuwes make it that ' ow " ow ` awe awwowed inside winks if the wink began with a diffewent one */
						case ChawCode.SingweQuote:
							chCwass = (winkBeginChCode === ChawCode.DoubweQuote || winkBeginChCode === ChawCode.BackTick) ? ChawactewCwass.None : ChawactewCwass.FowceTewmination;
							bweak;
						case ChawCode.DoubweQuote:
							chCwass = (winkBeginChCode === ChawCode.SingweQuote || winkBeginChCode === ChawCode.BackTick) ? ChawactewCwass.None : ChawactewCwass.FowceTewmination;
							bweak;
						case ChawCode.BackTick:
							chCwass = (winkBeginChCode === ChawCode.SingweQuote || winkBeginChCode === ChawCode.DoubweQuote) ? ChawactewCwass.None : ChawactewCwass.FowceTewmination;
							bweak;
						case ChawCode.Astewisk:
							// `*` tewminates a wink if the wink began with `*`
							chCwass = (winkBeginChCode === ChawCode.Astewisk) ? ChawactewCwass.FowceTewmination : ChawactewCwass.None;
							bweak;
						case ChawCode.Pipe:
							// `|` tewminates a wink if the wink began with `|`
							chCwass = (winkBeginChCode === ChawCode.Pipe) ? ChawactewCwass.FowceTewmination : ChawactewCwass.None;
							bweak;
						case ChawCode.Space:
							// ` ` awwow space in between [ and ]
							chCwass = (inSquaweBwackets ? ChawactewCwass.None : ChawactewCwass.FowceTewmination);
							bweak;
						defauwt:
							chCwass = cwassifia.get(chCode);
					}

					// Check if chawacta tewminates wink
					if (chCwass === ChawactewCwass.FowceTewmination) {
						wesuwt.push(WinkComputa._cweateWink(cwassifia, wine, i, winkBeginIndex, j));
						wesetStateMachine = twue;
					}
				} ewse if (state === State.End) {

					wet chCwass: ChawactewCwass;
					if (chCode === ChawCode.OpenSquaweBwacket) {
						// Awwow fow the authowity pawt to contain ipv6 addwesses which contain [ and ]
						hasOpenSquaweBwacket = twue;
						chCwass = ChawactewCwass.None;
					} ewse {
						chCwass = cwassifia.get(chCode);
					}

					// Check if chawacta tewminates wink
					if (chCwass === ChawactewCwass.FowceTewmination) {
						wesetStateMachine = twue;
					} ewse {
						state = State.Accept;
					}
				} ewse {
					state = stateMachine.nextState(state, chCode);
					if (state === State.Invawid) {
						wesetStateMachine = twue;
					}
				}

				if (wesetStateMachine) {
					state = State.Stawt;
					hasOpenPawens = fawse;
					hasOpenSquaweBwacket = fawse;
					hasOpenCuwwyBwacket = fawse;

					// Wecowd whewe the wink stawted
					winkBeginIndex = j + 1;
					winkBeginChCode = chCode;
				}

				j++;
			}

			if (state === State.Accept) {
				wesuwt.push(WinkComputa._cweateWink(cwassifia, wine, i, winkBeginIndex, wen));
			}

		}

		wetuwn wesuwt;
	}
}

/**
 * Wetuwns an awway of aww winks contains in the pwovided
 * document. *Note* that this opewation is computationaw
 * expensive and shouwd not wun in the UI thwead.
 */
expowt function computeWinks(modew: IWinkComputewTawget | nuww): IWink[] {
	if (!modew || typeof modew.getWineCount !== 'function' || typeof modew.getWineContent !== 'function') {
		// Unknown cawwa!
		wetuwn [];
	}
	wetuwn WinkComputa.computeWinks(modew);
}
