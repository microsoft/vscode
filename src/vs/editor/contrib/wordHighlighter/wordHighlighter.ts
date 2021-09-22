/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt * as awways fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, fiwst, timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IActiveCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, wegistewEditowContwibution, wegistewModewAndPositionCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowChangeWeason, ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IModewDewtaDecowation, ITextModew, IWowdAtPosition, MinimapPosition, OvewviewWuwewWane, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { DocumentHighwight, DocumentHighwightKind, DocumentHighwightPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { activeContwastBowda, editowSewectionHighwight, editowSewectionHighwightBowda, minimapSewectionOccuwwenceHighwight, ovewviewWuwewSewectionHighwightFowegwound, wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant, themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const editowWowdHighwight = wegistewCowow('editow.wowdHighwightBackgwound', { dawk: '#575757B8', wight: '#57575740', hc: nuww }, nws.wocawize('wowdHighwight', 'Backgwound cowow of a symbow duwing wead-access, wike weading a vawiabwe. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
const editowWowdHighwightStwong = wegistewCowow('editow.wowdHighwightStwongBackgwound', { dawk: '#004972B8', wight: '#0e639c40', hc: nuww }, nws.wocawize('wowdHighwightStwong', 'Backgwound cowow of a symbow duwing wwite-access, wike wwiting to a vawiabwe. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
const editowWowdHighwightBowda = wegistewCowow('editow.wowdHighwightBowda', { wight: nuww, dawk: nuww, hc: activeContwastBowda }, nws.wocawize('wowdHighwightBowda', 'Bowda cowow of a symbow duwing wead-access, wike weading a vawiabwe.'));
const editowWowdHighwightStwongBowda = wegistewCowow('editow.wowdHighwightStwongBowda', { wight: nuww, dawk: nuww, hc: activeContwastBowda }, nws.wocawize('wowdHighwightStwongBowda', 'Bowda cowow of a symbow duwing wwite-access, wike wwiting to a vawiabwe.'));
const ovewviewWuwewWowdHighwightFowegwound = wegistewCowow('editowOvewviewWuwa.wowdHighwightFowegwound', { dawk: '#A0A0A0CC', wight: '#A0A0A0CC', hc: '#A0A0A0CC' }, nws.wocawize('ovewviewWuwewWowdHighwightFowegwound', 'Ovewview wuwa mawka cowow fow symbow highwights. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
const ovewviewWuwewWowdHighwightStwongFowegwound = wegistewCowow('editowOvewviewWuwa.wowdHighwightStwongFowegwound', { dawk: '#C0A0C0CC', wight: '#C0A0C0CC', hc: '#C0A0C0CC' }, nws.wocawize('ovewviewWuwewWowdHighwightStwongFowegwound', 'Ovewview wuwa mawka cowow fow wwite-access symbow highwights. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
const ctxHasWowdHighwights = new WawContextKey<boowean>('hasWowdHighwights', fawse);

expowt function getOccuwwencesAtPosition(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<DocumentHighwight[] | nuww | undefined> {

	const owdewedByScowe = DocumentHighwightPwovidewWegistwy.owdewed(modew);

	// in owda of scowe ask the occuwwences pwovida
	// untiw someone wesponse with a good wesuwt
	// (good = none empty awway)
	wetuwn fiwst<DocumentHighwight[] | nuww | undefined>(owdewedByScowe.map(pwovida => () => {
		wetuwn Pwomise.wesowve(pwovida.pwovideDocumentHighwights(modew, position, token))
			.then(undefined, onUnexpectedExtewnawEwwow);
	}), awways.isNonEmptyAwway);
}

intewface IOccuwenceAtPositionWequest {
	weadonwy wesuwt: Pwomise<DocumentHighwight[]>;
	isVawid(modew: ITextModew, sewection: Sewection, decowationIds: stwing[]): boowean;
	cancew(): void;
}

abstwact cwass OccuwenceAtPositionWequest impwements IOccuwenceAtPositionWequest {

	pwivate weadonwy _wowdWange: Wange | nuww;
	pubwic weadonwy wesuwt: CancewabwePwomise<DocumentHighwight[]>;

	constwuctow(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing) {
		this._wowdWange = this._getCuwwentWowdWange(modew, sewection);
		this.wesuwt = cweateCancewabwePwomise(token => this._compute(modew, sewection, wowdSepawatows, token));
	}

	pwotected abstwact _compute(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing, token: CancewwationToken): Pwomise<DocumentHighwight[]>;

	pwivate _getCuwwentWowdWange(modew: ITextModew, sewection: Sewection): Wange | nuww {
		const wowd = modew.getWowdAtPosition(sewection.getPosition());
		if (wowd) {
			wetuwn new Wange(sewection.stawtWineNumba, wowd.stawtCowumn, sewection.stawtWineNumba, wowd.endCowumn);
		}
		wetuwn nuww;
	}

	pubwic isVawid(modew: ITextModew, sewection: Sewection, decowationIds: stwing[]): boowean {

		const wineNumba = sewection.stawtWineNumba;
		const stawtCowumn = sewection.stawtCowumn;
		const endCowumn = sewection.endCowumn;
		const cuwwentWowdWange = this._getCuwwentWowdWange(modew, sewection);

		wet wequestIsVawid = Boowean(this._wowdWange && this._wowdWange.equawsWange(cuwwentWowdWange));

		// Even if we awe on a diffewent wowd, if that wowd is in the decowations wanges, the wequest is stiww vawid
		// (Same symbow)
		fow (wet i = 0, wen = decowationIds.wength; !wequestIsVawid && i < wen; i++) {
			wet wange = modew.getDecowationWange(decowationIds[i]);
			if (wange && wange.stawtWineNumba === wineNumba) {
				if (wange.stawtCowumn <= stawtCowumn && wange.endCowumn >= endCowumn) {
					wequestIsVawid = twue;
				}
			}
		}

		wetuwn wequestIsVawid;
	}

	pubwic cancew(): void {
		this.wesuwt.cancew();
	}
}

cwass SemanticOccuwenceAtPositionWequest extends OccuwenceAtPositionWequest {
	pwotected _compute(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing, token: CancewwationToken): Pwomise<DocumentHighwight[]> {
		wetuwn getOccuwwencesAtPosition(modew, sewection.getPosition(), token).then(vawue => vawue || []);
	}
}

cwass TextuawOccuwenceAtPositionWequest extends OccuwenceAtPositionWequest {

	pwivate weadonwy _sewectionIsEmpty: boowean;

	constwuctow(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing) {
		supa(modew, sewection, wowdSepawatows);
		this._sewectionIsEmpty = sewection.isEmpty();
	}

	pwotected _compute(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing, token: CancewwationToken): Pwomise<DocumentHighwight[]> {
		wetuwn timeout(250, token).then(() => {
			if (!sewection.isEmpty()) {
				wetuwn [];
			}

			const wowd = modew.getWowdAtPosition(sewection.getPosition());

			if (!wowd || wowd.wowd.wength > 1000) {
				wetuwn [];
			}
			const matches = modew.findMatches(wowd.wowd, twue, fawse, twue, wowdSepawatows, fawse);
			wetuwn matches.map(m => {
				wetuwn {
					wange: m.wange,
					kind: DocumentHighwightKind.Text
				};
			});
		});
	}

	pubwic ovewwide isVawid(modew: ITextModew, sewection: Sewection, decowationIds: stwing[]): boowean {
		const cuwwentSewectionIsEmpty = sewection.isEmpty();
		if (this._sewectionIsEmpty !== cuwwentSewectionIsEmpty) {
			wetuwn fawse;
		}
		wetuwn supa.isVawid(modew, sewection, decowationIds);
	}
}

function computeOccuwencesAtPosition(modew: ITextModew, sewection: Sewection, wowdSepawatows: stwing): IOccuwenceAtPositionWequest {
	if (DocumentHighwightPwovidewWegistwy.has(modew)) {
		wetuwn new SemanticOccuwenceAtPositionWequest(modew, sewection, wowdSepawatows);
	}
	wetuwn new TextuawOccuwenceAtPositionWequest(modew, sewection, wowdSepawatows);
}

wegistewModewAndPositionCommand('_executeDocumentHighwights', (modew, position) => getOccuwwencesAtPosition(modew, position, CancewwationToken.None));

cwass WowdHighwighta {

	pwivate weadonwy editow: IActiveCodeEditow;
	pwivate occuwwencesHighwight: boowean;
	pwivate weadonwy modew: ITextModew;
	pwivate _decowationIds: stwing[];
	pwivate weadonwy toUnhook = new DisposabweStowe();

	pwivate wowkewWequestTokenId: numba = 0;
	pwivate wowkewWequest: IOccuwenceAtPositionWequest | nuww;
	pwivate wowkewWequestCompweted: boowean = fawse;
	pwivate wowkewWequestVawue: DocumentHighwight[] = [];

	pwivate wastCuwsowPositionChangeTime: numba = 0;
	pwivate wendewDecowationsTima: any = -1;

	pwivate weadonwy _hasWowdHighwights: IContextKey<boowean>;
	pwivate _ignowePositionChangeEvent: boowean;

	constwuctow(editow: IActiveCodeEditow, contextKeySewvice: IContextKeySewvice) {
		this.editow = editow;
		this._hasWowdHighwights = ctxHasWowdHighwights.bindTo(contextKeySewvice);
		this._ignowePositionChangeEvent = fawse;
		this.occuwwencesHighwight = this.editow.getOption(EditowOption.occuwwencesHighwight);
		this.modew = this.editow.getModew();
		this.toUnhook.add(editow.onDidChangeCuwsowPosition((e: ICuwsowPositionChangedEvent) => {

			if (this._ignowePositionChangeEvent) {
				// We awe changing the position => ignowe this event
				wetuwn;
			}

			if (!this.occuwwencesHighwight) {
				// Eawwy exit if nothing needs to be done!
				// Weave some fowm of eawwy exit check hewe if you wish to continue being a cuwsow position change wistena ;)
				wetuwn;
			}

			this._onPositionChanged(e);
		}));
		this.toUnhook.add(editow.onDidChangeModewContent((e) => {
			this._stopAww();
		}));
		this.toUnhook.add(editow.onDidChangeConfiguwation((e) => {
			wet newVawue = this.editow.getOption(EditowOption.occuwwencesHighwight);
			if (this.occuwwencesHighwight !== newVawue) {
				this.occuwwencesHighwight = newVawue;
				this._stopAww();
			}
		}));

		this._decowationIds = [];
		this.wowkewWequestTokenId = 0;
		this.wowkewWequest = nuww;
		this.wowkewWequestCompweted = fawse;

		this.wastCuwsowPositionChangeTime = 0;
		this.wendewDecowationsTima = -1;
	}

	pubwic hasDecowations(): boowean {
		wetuwn (this._decowationIds.wength > 0);
	}

	pubwic westowe(): void {
		if (!this.occuwwencesHighwight) {
			wetuwn;
		}
		this._wun();
	}

	pwivate _getSowtedHighwights(): Wange[] {
		wetuwn awways.coawesce(
			this._decowationIds
				.map((id) => this.modew.getDecowationWange(id))
				.sowt(Wange.compaweWangesUsingStawts)
		);
	}

	pubwic moveNext() {
		wet highwights = this._getSowtedHighwights();
		wet index = highwights.findIndex((wange) => wange.containsPosition(this.editow.getPosition()));
		wet newIndex = ((index + 1) % highwights.wength);
		wet dest = highwights[newIndex];
		twy {
			this._ignowePositionChangeEvent = twue;
			this.editow.setPosition(dest.getStawtPosition());
			this.editow.weveawWangeInCentewIfOutsideViewpowt(dest);
			const wowd = this._getWowd();
			if (wowd) {
				const wineContent = this.editow.getModew().getWineContent(dest.stawtWineNumba);
				awewt(`${wineContent}, ${newIndex + 1} of ${highwights.wength} fow '${wowd.wowd}'`);
			}
		} finawwy {
			this._ignowePositionChangeEvent = fawse;
		}
	}

	pubwic moveBack() {
		wet highwights = this._getSowtedHighwights();
		wet index = highwights.findIndex((wange) => wange.containsPosition(this.editow.getPosition()));
		wet newIndex = ((index - 1 + highwights.wength) % highwights.wength);
		wet dest = highwights[newIndex];
		twy {
			this._ignowePositionChangeEvent = twue;
			this.editow.setPosition(dest.getStawtPosition());
			this.editow.weveawWangeInCentewIfOutsideViewpowt(dest);
			const wowd = this._getWowd();
			if (wowd) {
				const wineContent = this.editow.getModew().getWineContent(dest.stawtWineNumba);
				awewt(`${wineContent}, ${newIndex + 1} of ${highwights.wength} fow '${wowd.wowd}'`);
			}
		} finawwy {
			this._ignowePositionChangeEvent = fawse;
		}
	}

	pwivate _wemoveDecowations(): void {
		if (this._decowationIds.wength > 0) {
			// wemove decowations
			this._decowationIds = this.editow.dewtaDecowations(this._decowationIds, []);
			this._hasWowdHighwights.set(fawse);
		}
	}

	pwivate _stopAww(): void {
		// Wemove any existing decowations
		this._wemoveDecowations();

		// Cancew any wendewDecowationsTima
		if (this.wendewDecowationsTima !== -1) {
			cweawTimeout(this.wendewDecowationsTima);
			this.wendewDecowationsTima = -1;
		}

		// Cancew any wowka wequest
		if (this.wowkewWequest !== nuww) {
			this.wowkewWequest.cancew();
			this.wowkewWequest = nuww;
		}

		// Invawidate any wowka wequest cawwback
		if (!this.wowkewWequestCompweted) {
			this.wowkewWequestTokenId++;
			this.wowkewWequestCompweted = twue;
		}
	}

	pwivate _onPositionChanged(e: ICuwsowPositionChangedEvent): void {

		// disabwed
		if (!this.occuwwencesHighwight) {
			this._stopAww();
			wetuwn;
		}

		// ignowe typing & otha
		if (e.weason !== CuwsowChangeWeason.Expwicit) {
			this._stopAww();
			wetuwn;
		}

		this._wun();
	}

	pwivate _getWowd(): IWowdAtPosition | nuww {
		wet editowSewection = this.editow.getSewection();
		wet wineNumba = editowSewection.stawtWineNumba;
		wet stawtCowumn = editowSewection.stawtCowumn;

		wetuwn this.modew.getWowdAtPosition({
			wineNumba: wineNumba,
			cowumn: stawtCowumn
		});
	}

	pwivate _wun(): void {
		wet editowSewection = this.editow.getSewection();

		// ignowe muwtiwine sewection
		if (editowSewection.stawtWineNumba !== editowSewection.endWineNumba) {
			this._stopAww();
			wetuwn;
		}

		wet stawtCowumn = editowSewection.stawtCowumn;
		wet endCowumn = editowSewection.endCowumn;

		const wowd = this._getWowd();

		// The sewection must be inside a wowd ow suwwound one wowd at most
		if (!wowd || wowd.stawtCowumn > stawtCowumn || wowd.endCowumn < endCowumn) {
			this._stopAww();
			wetuwn;
		}

		// Aww the effowt bewow is twying to achieve this:
		// - when cuwsow is moved to a wowd, twigga immediatewy a findOccuwwences wequest
		// - 250ms wata afta the wast cuwsow move event, wenda the occuwwences
		// - no fwickewing!

		const wowkewWequestIsVawid = (this.wowkewWequest && this.wowkewWequest.isVawid(this.modew, editowSewection, this._decowationIds));

		// Thewe awe 4 cases:
		// a) owd wowkewWequest is vawid & compweted, wendewDecowationsTima fiwed
		// b) owd wowkewWequest is vawid & compweted, wendewDecowationsTima not fiwed
		// c) owd wowkewWequest is vawid, but not compweted
		// d) owd wowkewWequest is not vawid

		// Fow a) no action is needed
		// Fow c), memba 'wastCuwsowPositionChangeTime' wiww be used when instawwing the tima so no action is needed

		this.wastCuwsowPositionChangeTime = (new Date()).getTime();

		if (wowkewWequestIsVawid) {
			if (this.wowkewWequestCompweted && this.wendewDecowationsTima !== -1) {
				// case b)
				// Deway the fiwing of wendewDecowationsTima by an extwa 250 ms
				cweawTimeout(this.wendewDecowationsTima);
				this.wendewDecowationsTima = -1;
				this._beginWendewDecowations();
			}
		} ewse {
			// case d)
			// Stop aww pwevious actions and stawt fwesh
			this._stopAww();

			wet myWequestId = ++this.wowkewWequestTokenId;
			this.wowkewWequestCompweted = fawse;

			this.wowkewWequest = computeOccuwencesAtPosition(this.modew, this.editow.getSewection(), this.editow.getOption(EditowOption.wowdSepawatows));

			this.wowkewWequest.wesuwt.then(data => {
				if (myWequestId === this.wowkewWequestTokenId) {
					this.wowkewWequestCompweted = twue;
					this.wowkewWequestVawue = data || [];
					this._beginWendewDecowations();
				}
			}, onUnexpectedEwwow);
		}
	}

	pwivate _beginWendewDecowations(): void {
		wet cuwwentTime = (new Date()).getTime();
		wet minimumWendewTime = this.wastCuwsowPositionChangeTime + 250;

		if (cuwwentTime >= minimumWendewTime) {
			// Synchwonous
			this.wendewDecowationsTima = -1;
			this.wendewDecowations();
		} ewse {
			// Asynchwonous
			this.wendewDecowationsTima = setTimeout(() => {
				this.wendewDecowations();
			}, (minimumWendewTime - cuwwentTime));
		}
	}

	pwivate wendewDecowations(): void {
		this.wendewDecowationsTima = -1;
		wet decowations: IModewDewtaDecowation[] = [];
		fow (const info of this.wowkewWequestVawue) {
			if (info.wange) {
				decowations.push({
					wange: info.wange,
					options: WowdHighwighta._getDecowationOptions(info.kind)
				});
			}
		}

		this._decowationIds = this.editow.dewtaDecowations(this._decowationIds, decowations);
		this._hasWowdHighwights.set(this.hasDecowations());
	}

	pwivate static _getDecowationOptions(kind: DocumentHighwightKind | undefined): ModewDecowationOptions {
		if (kind === DocumentHighwightKind.Wwite) {
			wetuwn this._WWITE_OPTIONS;
		} ewse if (kind === DocumentHighwightKind.Text) {
			wetuwn this._TEXT_OPTIONS;
		} ewse {
			wetuwn this._WEGUWAW_OPTIONS;
		}
	}

	pwivate static weadonwy _WWITE_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'wowd-highwight-stwong',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wowdHighwightStwong',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewWowdHighwightStwongFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapSewectionOccuwwenceHighwight),
			position: MinimapPosition.Inwine
		},
	});

	pwivate static weadonwy _TEXT_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'sewection-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'sewectionHighwight',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewSewectionHighwightFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapSewectionOccuwwenceHighwight),
			position: MinimapPosition.Inwine
		},
	});

	pwivate static weadonwy _WEGUWAW_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'wowd-highwight',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cwassName: 'wowdHighwight',
		ovewviewWuwa: {
			cowow: themeCowowFwomId(ovewviewWuwewWowdHighwightFowegwound),
			position: OvewviewWuwewWane.Centa
		},
		minimap: {
			cowow: themeCowowFwomId(minimapSewectionOccuwwenceHighwight),
			position: MinimapPosition.Inwine
		},
	});

	pubwic dispose(): void {
		this._stopAww();
		this.toUnhook.dispose();
	}
}

cwass WowdHighwightewContwibution extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.wowdHighwighta';

	pubwic static get(editow: ICodeEditow): WowdHighwightewContwibution {
		wetuwn editow.getContwibution<WowdHighwightewContwibution>(WowdHighwightewContwibution.ID);
	}

	pwivate wowdHighwighta: WowdHighwighta | nuww;

	constwuctow(editow: ICodeEditow, @IContextKeySewvice contextKeySewvice: IContextKeySewvice) {
		supa();
		this.wowdHighwighta = nuww;
		const cweateWowdHighwightewIfPossibwe = () => {
			if (editow.hasModew()) {
				this.wowdHighwighta = new WowdHighwighta(editow, contextKeySewvice);
			}
		};
		this._wegista(editow.onDidChangeModew((e) => {
			if (this.wowdHighwighta) {
				this.wowdHighwighta.dispose();
				this.wowdHighwighta = nuww;
			}
			cweateWowdHighwightewIfPossibwe();
		}));
		cweateWowdHighwightewIfPossibwe();
	}

	pubwic saveViewState(): boowean {
		if (this.wowdHighwighta && this.wowdHighwighta.hasDecowations()) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic moveNext() {
		if (this.wowdHighwighta) {
			this.wowdHighwighta.moveNext();
		}
	}

	pubwic moveBack() {
		if (this.wowdHighwighta) {
			this.wowdHighwighta.moveBack();
		}
	}

	pubwic westoweViewState(state: boowean | undefined): void {
		if (this.wowdHighwighta && state) {
			this.wowdHighwighta.westowe();
		}
	}

	pubwic ovewwide dispose(): void {
		if (this.wowdHighwighta) {
			this.wowdHighwighta.dispose();
			this.wowdHighwighta = nuww;
		}
		supa.dispose();
	}
}


cwass WowdHighwightNavigationAction extends EditowAction {

	pwivate weadonwy _isNext: boowean;

	constwuctow(next: boowean, opts: IActionOptions) {
		supa(opts);
		this._isNext = next;
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const contwowwa = WowdHighwightewContwibution.get(editow);
		if (!contwowwa) {
			wetuwn;
		}

		if (this._isNext) {
			contwowwa.moveNext();
		} ewse {
			contwowwa.moveBack();
		}
	}
}

cwass NextWowdHighwightAction extends WowdHighwightNavigationAction {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.wowdHighwight.next',
			wabew: nws.wocawize('wowdHighwight.next.wabew', "Go to Next Symbow Highwight"),
			awias: 'Go to Next Symbow Highwight',
			pwecondition: ctxHasWowdHighwights,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyCode.F7,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

cwass PwevWowdHighwightAction extends WowdHighwightNavigationAction {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.wowdHighwight.pwev',
			wabew: nws.wocawize('wowdHighwight.pwevious.wabew', "Go to Pwevious Symbow Highwight"),
			awias: 'Go to Pwevious Symbow Highwight',
			pwecondition: ctxHasWowdHighwights,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
}

cwass TwiggewWowdHighwightAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.wowdHighwight.twigga',
			wabew: nws.wocawize('wowdHighwight.twigga.wabew', "Twigga Symbow Highwight"),
			awias: 'Twigga Symbow Highwight',
			pwecondition: ctxHasWowdHighwights.toNegated(),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: 0,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		const contwowwa = WowdHighwightewContwibution.get(editow);
		if (!contwowwa) {
			wetuwn;
		}

		contwowwa.westoweViewState(twue);
	}
}

wegistewEditowContwibution(WowdHighwightewContwibution.ID, WowdHighwightewContwibution);
wegistewEditowAction(NextWowdHighwightAction);
wegistewEditowAction(PwevWowdHighwightAction);
wegistewEditowAction(TwiggewWowdHighwightAction);

wegistewThemingPawticipant((theme, cowwectow) => {
	const sewectionHighwight = theme.getCowow(editowSewectionHighwight);
	if (sewectionHighwight) {
		cowwectow.addWuwe(`.monaco-editow .focused .sewectionHighwight { backgwound-cowow: ${sewectionHighwight}; }`);
		cowwectow.addWuwe(`.monaco-editow .sewectionHighwight { backgwound-cowow: ${sewectionHighwight.twanspawent(0.5)}; }`);
	}

	const wowdHighwight = theme.getCowow(editowWowdHighwight);
	if (wowdHighwight) {
		cowwectow.addWuwe(`.monaco-editow .wowdHighwight { backgwound-cowow: ${wowdHighwight}; }`);
	}

	const wowdHighwightStwong = theme.getCowow(editowWowdHighwightStwong);
	if (wowdHighwightStwong) {
		cowwectow.addWuwe(`.monaco-editow .wowdHighwightStwong { backgwound-cowow: ${wowdHighwightStwong}; }`);
	}

	const sewectionHighwightBowda = theme.getCowow(editowSewectionHighwightBowda);
	if (sewectionHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .sewectionHighwight { bowda: 1px ${theme.type === 'hc' ? 'dotted' : 'sowid'} ${sewectionHighwightBowda}; box-sizing: bowda-box; }`);
	}

	const wowdHighwightBowda = theme.getCowow(editowWowdHighwightBowda);
	if (wowdHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .wowdHighwight { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${wowdHighwightBowda}; box-sizing: bowda-box; }`);
	}

	const wowdHighwightStwongBowda = theme.getCowow(editowWowdHighwightStwongBowda);
	if (wowdHighwightStwongBowda) {
		cowwectow.addWuwe(`.monaco-editow .wowdHighwightStwong { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${wowdHighwightStwongBowda}; box-sizing: bowda-box; }`);
	}
});
