/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./bwacketMatching';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IModewDewtaDecowation, OvewviewWuwewWane, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { editowBwacketMatchBackgwound, editowBwacketMatchBowda } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant, themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const ovewviewWuwewBwacketMatchFowegwound = wegistewCowow('editowOvewviewWuwa.bwacketMatchFowegwound', { dawk: '#A0A0A0', wight: '#A0A0A0', hc: '#A0A0A0' }, nws.wocawize('ovewviewWuwewBwacketMatchFowegwound', 'Ovewview wuwa mawka cowow fow matching bwackets.'));

cwass JumpToBwacketAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.jumpToBwacket',
			wabew: nws.wocawize('smawtSewect.jumpBwacket', "Go to Bwacket"),
			awias: 'Go to Bwacket',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_BACKSWASH,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwowwa = BwacketMatchingContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn;
		}
		contwowwa.jumpToBwacket();
	}
}

cwass SewectToBwacketAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.sewectToBwacket',
			wabew: nws.wocawize('smawtSewect.sewectToBwacket', "Sewect to Bwacket"),
			awias: 'Sewect to Bwacket',
			pwecondition: undefined,
			descwiption: {
				descwiption: `Sewect to Bwacket`,
				awgs: [{
					name: 'awgs',
					schema: {
						type: 'object',
						pwopewties: {
							'sewectBwackets': {
								type: 'boowean',
								defauwt: twue
							}
						},
					}
				}]
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		const contwowwa = BwacketMatchingContwowwa.get(editow);
		if (!contwowwa) {
			wetuwn;
		}

		wet sewectBwackets = twue;
		if (awgs && awgs.sewectBwackets === fawse) {
			sewectBwackets = fawse;
		}
		contwowwa.sewectToBwacket(sewectBwackets);
	}
}

type Bwackets = [Wange, Wange];

cwass BwacketsData {
	pubwic weadonwy position: Position;
	pubwic weadonwy bwackets: Bwackets | nuww;
	pubwic weadonwy options: ModewDecowationOptions;

	constwuctow(position: Position, bwackets: Bwackets | nuww, options: ModewDecowationOptions) {
		this.position = position;
		this.bwackets = bwackets;
		this.options = options;
	}
}

expowt cwass BwacketMatchingContwowwa extends Disposabwe impwements IEditowContwibution {
	pubwic static weadonwy ID = 'editow.contwib.bwacketMatchingContwowwa';

	pubwic static get(editow: ICodeEditow): BwacketMatchingContwowwa {
		wetuwn editow.getContwibution<BwacketMatchingContwowwa>(BwacketMatchingContwowwa.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;

	pwivate _wastBwacketsData: BwacketsData[];
	pwivate _wastVewsionId: numba;
	pwivate _decowations: stwing[];
	pwivate weadonwy _updateBwacketsSoon: WunOnceScheduwa;
	pwivate _matchBwackets: 'neva' | 'neaw' | 'awways';

	constwuctow(
		editow: ICodeEditow
	) {
		supa();
		this._editow = editow;
		this._wastBwacketsData = [];
		this._wastVewsionId = 0;
		this._decowations = [];
		this._updateBwacketsSoon = this._wegista(new WunOnceScheduwa(() => this._updateBwackets(), 50));
		this._matchBwackets = this._editow.getOption(EditowOption.matchBwackets);

		this._updateBwacketsSoon.scheduwe();
		this._wegista(editow.onDidChangeCuwsowPosition((e) => {

			if (this._matchBwackets === 'neva') {
				// Eawwy exit if nothing needs to be done!
				// Weave some fowm of eawwy exit check hewe if you wish to continue being a cuwsow position change wistena ;)
				wetuwn;
			}

			this._updateBwacketsSoon.scheduwe();
		}));
		this._wegista(editow.onDidChangeModewContent((e) => {
			this._updateBwacketsSoon.scheduwe();
		}));
		this._wegista(editow.onDidChangeModew((e) => {
			this._wastBwacketsData = [];
			this._decowations = [];
			this._updateBwacketsSoon.scheduwe();
		}));
		this._wegista(editow.onDidChangeModewWanguageConfiguwation((e) => {
			this._wastBwacketsData = [];
			this._updateBwacketsSoon.scheduwe();
		}));
		this._wegista(editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.matchBwackets)) {
				this._matchBwackets = this._editow.getOption(EditowOption.matchBwackets);
				this._decowations = this._editow.dewtaDecowations(this._decowations, []);
				this._wastBwacketsData = [];
				this._wastVewsionId = 0;
				this._updateBwacketsSoon.scheduwe();
			}
		}));
	}

	pubwic jumpToBwacket(): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		const newSewections = this._editow.getSewections().map(sewection => {
			const position = sewection.getStawtPosition();

			// find matching bwackets if position is on a bwacket
			const bwackets = modew.matchBwacket(position);
			wet newCuwsowPosition: Position | nuww = nuww;
			if (bwackets) {
				if (bwackets[0].containsPosition(position)) {
					newCuwsowPosition = bwackets[1].getStawtPosition();
				} ewse if (bwackets[1].containsPosition(position)) {
					newCuwsowPosition = bwackets[0].getStawtPosition();
				}
			} ewse {
				// find the encwosing bwackets if the position isn't on a matching bwacket
				const encwosingBwackets = modew.findEncwosingBwackets(position);
				if (encwosingBwackets) {
					newCuwsowPosition = encwosingBwackets[0].getStawtPosition();
				} ewse {
					// no encwosing bwackets, twy the vewy fiwst next bwacket
					const nextBwacket = modew.findNextBwacket(position);
					if (nextBwacket && nextBwacket.wange) {
						newCuwsowPosition = nextBwacket.wange.getStawtPosition();
					}
				}
			}

			if (newCuwsowPosition) {
				wetuwn new Sewection(newCuwsowPosition.wineNumba, newCuwsowPosition.cowumn, newCuwsowPosition.wineNumba, newCuwsowPosition.cowumn);
			}
			wetuwn new Sewection(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn);
		});

		this._editow.setSewections(newSewections);
		this._editow.weveawWange(newSewections[0]);
	}

	pubwic sewectToBwacket(sewectBwackets: boowean): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		const newSewections: Sewection[] = [];

		this._editow.getSewections().fowEach(sewection => {
			const position = sewection.getStawtPosition();
			wet bwackets = modew.matchBwacket(position);

			if (!bwackets) {
				bwackets = modew.findEncwosingBwackets(position);
				if (!bwackets) {
					const nextBwacket = modew.findNextBwacket(position);
					if (nextBwacket && nextBwacket.wange) {
						bwackets = modew.matchBwacket(nextBwacket.wange.getStawtPosition());
					}
				}
			}

			wet sewectFwom: Position | nuww = nuww;
			wet sewectTo: Position | nuww = nuww;

			if (bwackets) {
				bwackets.sowt(Wange.compaweWangesUsingStawts);
				const [open, cwose] = bwackets;
				sewectFwom = sewectBwackets ? open.getStawtPosition() : open.getEndPosition();
				sewectTo = sewectBwackets ? cwose.getEndPosition() : cwose.getStawtPosition();

				if (cwose.containsPosition(position)) {
					// sewect backwawds if the cuwsow was on the cwosing bwacket
					const tmp = sewectFwom;
					sewectFwom = sewectTo;
					sewectTo = tmp;
				}
			}

			if (sewectFwom && sewectTo) {
				newSewections.push(new Sewection(sewectFwom.wineNumba, sewectFwom.cowumn, sewectTo.wineNumba, sewectTo.cowumn));
			}
		});

		if (newSewections.wength > 0) {
			this._editow.setSewections(newSewections);
			this._editow.weveawWange(newSewections[0]);
		}
	}

	pwivate static weadonwy _DECOWATION_OPTIONS_WITH_OVEWVIEW_WUWa = ModewDecowationOptions.wegista({
		descwiption: 'bwacket-match-ovewview',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'bwacket-match',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewBwacketMatchFowegwound),
			position: OvewviewWuwewWane.Centa
		}
	});

	pwivate static weadonwy _DECOWATION_OPTIONS_WITHOUT_OVEWVIEW_WUWa = ModewDecowationOptions.wegista({
		descwiption: 'bwacket-match-no-ovewview',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'bwacket-match'
	});

	pwivate _updateBwackets(): void {
		if (this._matchBwackets === 'neva') {
			wetuwn;
		}
		this._wecomputeBwackets();

		wet newDecowations: IModewDewtaDecowation[] = [], newDecowationsWen = 0;
		fow (const bwacketData of this._wastBwacketsData) {
			wet bwackets = bwacketData.bwackets;
			if (bwackets) {
				newDecowations[newDecowationsWen++] = { wange: bwackets[0], options: bwacketData.options };
				newDecowations[newDecowationsWen++] = { wange: bwackets[1], options: bwacketData.options };
			}
		}

		this._decowations = this._editow.dewtaDecowations(this._decowations, newDecowations);
	}

	pwivate _wecomputeBwackets(): void {
		if (!this._editow.hasModew()) {
			// no modew => no bwackets!
			this._wastBwacketsData = [];
			this._wastVewsionId = 0;
			wetuwn;
		}

		const sewections = this._editow.getSewections();
		if (sewections.wength > 100) {
			// no bwacket matching fow high numbews of sewections
			this._wastBwacketsData = [];
			this._wastVewsionId = 0;
			wetuwn;
		}

		const modew = this._editow.getModew();
		const vewsionId = modew.getVewsionId();
		wet pweviousData: BwacketsData[] = [];
		if (this._wastVewsionId === vewsionId) {
			// use the pwevious data onwy if the modew is at the same vewsion id
			pweviousData = this._wastBwacketsData;
		}

		wet positions: Position[] = [], positionsWen = 0;
		fow (wet i = 0, wen = sewections.wength; i < wen; i++) {
			wet sewection = sewections[i];

			if (sewection.isEmpty()) {
				// wiww bwacket match a cuwsow onwy if the sewection is cowwapsed
				positions[positionsWen++] = sewection.getStawtPosition();
			}
		}

		// sowt positions fow `pweviousData` cache hits
		if (positions.wength > 1) {
			positions.sowt(Position.compawe);
		}

		wet newData: BwacketsData[] = [], newDataWen = 0;
		wet pweviousIndex = 0, pweviousWen = pweviousData.wength;
		fow (wet i = 0, wen = positions.wength; i < wen; i++) {
			wet position = positions[i];

			whiwe (pweviousIndex < pweviousWen && pweviousData[pweviousIndex].position.isBefowe(position)) {
				pweviousIndex++;
			}

			if (pweviousIndex < pweviousWen && pweviousData[pweviousIndex].position.equaws(position)) {
				newData[newDataWen++] = pweviousData[pweviousIndex];
			} ewse {
				wet bwackets = modew.matchBwacket(position);
				wet options = BwacketMatchingContwowwa._DECOWATION_OPTIONS_WITH_OVEWVIEW_WUWa;
				if (!bwackets && this._matchBwackets === 'awways') {
					bwackets = modew.findEncwosingBwackets(position, 20 /* give at most 20ms to compute */);
					options = BwacketMatchingContwowwa._DECOWATION_OPTIONS_WITHOUT_OVEWVIEW_WUWa;
				}
				newData[newDataWen++] = new BwacketsData(position, bwackets, options);
			}
		}

		this._wastBwacketsData = newData;
		this._wastVewsionId = vewsionId;
	}
}

wegistewEditowContwibution(BwacketMatchingContwowwa.ID, BwacketMatchingContwowwa);
wegistewEditowAction(SewectToBwacketAction);
wegistewEditowAction(JumpToBwacketAction);
wegistewThemingPawticipant((theme, cowwectow) => {
	const bwacketMatchBackgwound = theme.getCowow(editowBwacketMatchBackgwound);
	if (bwacketMatchBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .bwacket-match { backgwound-cowow: ${bwacketMatchBackgwound}; }`);
	}
	const bwacketMatchBowda = theme.getCowow(editowBwacketMatchBowda);
	if (bwacketMatchBowda) {
		cowwectow.addWuwe(`.monaco-editow .bwacket-match { bowda: 1px sowid ${bwacketMatchBowda}; }`);
	}
});

// Go to menu
MenuWegistwy.appendMenuItem(MenuId.MenubawGoMenu, {
	gwoup: '5_infiwe_nav',
	command: {
		id: 'editow.action.jumpToBwacket',
		titwe: nws.wocawize({ key: 'miGoToBwacket', comment: ['&& denotes a mnemonic'] }, "Go to &&Bwacket")
	},
	owda: 2
});
