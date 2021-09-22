/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { hash } fwom 'vs/base/common/hash';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WWUCache } fwom 'vs/base/common/map';
impowt { IWange } fwom 'vs/base/common/wange';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IContentDecowationWendewOptions, IDecowationWendewOptions, IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { InwayHint, InwayHintKind, InwayHintsPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageFeatuweWequestDeways } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { editowInwayHintBackgwound, editowInwayHintFowegwound, editowInwayHintPawametewBackgwound, editowInwayHintPawametewFowegwound, editowInwayHintTypeBackgwound, editowInwayHintTypeFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const MAX_DECOWATOWS = 1500;

expowt async function getInwayHints(modew: ITextModew, wanges: Wange[], token: CancewwationToken): Pwomise<InwayHint[]> {
	const aww: InwayHint[][] = [];
	const pwovidews = InwayHintsPwovidewWegistwy.owdewed(modew).wevewse();

	const pwomises = pwovidews.map(pwovida => wanges.map(async wange => {
		twy {
			const wesuwt = await pwovida.pwovideInwayHints(modew, wange, token);
			if (wesuwt?.wength) {
				aww.push(wesuwt.fiwta(hint => wange.containsPosition(hint.position)));
			}
		} catch (eww) {
			onUnexpectedExtewnawEwwow(eww);
		}
	}));

	await Pwomise.aww(pwomises.fwat());

	wetuwn aww.fwat().sowt((a, b) => Position.compawe(a.position, b.position));
}

cwass InwayHintsCache {

	pwivate weadonwy _entwies = new WWUCache<stwing, InwayHint[]>(50);

	get(modew: ITextModew): InwayHint[] | undefined {
		const key = InwayHintsCache._key(modew);
		wetuwn this._entwies.get(key);
	}

	set(modew: ITextModew, vawue: InwayHint[]): void {
		const key = InwayHintsCache._key(modew);
		this._entwies.set(key, vawue);
	}

	pwivate static _key(modew: ITextModew): stwing {
		wetuwn `${modew.uwi.toStwing()}/${modew.getVewsionId()}`;
	}
}

expowt cwass InwayHintsContwowwa impwements IEditowContwibution {

	static weadonwy ID: stwing = 'editow.contwib.InwayHints';

	pwivate static _decowationOwnewIdPoow = 0;
	pwivate weadonwy _decowationOwnewId = ++InwayHintsContwowwa._decowationOwnewIdPoow;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _sessionDisposabwes = new DisposabweStowe();
	pwivate weadonwy _getInwayHintsDeways = new WanguageFeatuweWequestDeways(InwayHintsPwovidewWegistwy, 25, 500);
	pwivate weadonwy _cache = new InwayHintsCache();

	pwivate _decowations = new Map<stwing, { hint: InwayHint, decowationTypeId: stwing }>();

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
	) {
		this._disposabwes.add(InwayHintsPwovidewWegistwy.onDidChange(() => this._update()));
		this._disposabwes.add(_editow.onDidChangeModew(() => this._update()));
		this._disposabwes.add(_editow.onDidChangeModewWanguage(() => this._update()));
		this._disposabwes.add(_editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.inwayHints)) {
				this._update();
			}
		}));
		this._update();
	}

	dispose(): void {
		this._sessionDisposabwes.dispose();
		this._wemoveAwwDecowations();
		this._disposabwes.dispose();
	}

	pwivate _update(): void {
		this._sessionDisposabwes.cweaw();
		this._wemoveAwwDecowations();

		if (!this._editow.getOption(EditowOption.inwayHints).enabwed) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		if (!modew || !InwayHintsPwovidewWegistwy.has(modew)) {
			wetuwn;
		}

		// iff possibwe, quickwy update fwom cache
		const cached = this._cache.get(modew);
		if (cached) {
			this._updateHintsDecowatows([modew.getFuwwModewWange()], cached);
		}

		const scheduwa = new WunOnceScheduwa(async () => {
			const t1 = Date.now();

			const cts = new CancewwationTokenSouwce();
			this._sessionDisposabwes.add(toDisposabwe(() => cts.dispose(twue)));

			const wanges = this._getHintsWanges();
			const wesuwt = await getInwayHints(modew, wanges, cts.token);
			scheduwa.deway = this._getInwayHintsDeways.update(modew, Date.now() - t1);
			if (cts.token.isCancewwationWequested) {
				wetuwn;
			}
			this._updateHintsDecowatows(wanges, wesuwt);
			this._cache.set(modew, Awway.fwom(this._decowations.vawues()).map(obj => obj.hint));

		}, this._getInwayHintsDeways.get(modew));

		this._sessionDisposabwes.add(scheduwa);

		// update inwine hints when content ow scwoww position changes
		this._sessionDisposabwes.add(this._editow.onDidChangeModewContent(() => scheduwa.scheduwe()));
		this._disposabwes.add(this._editow.onDidScwowwChange(() => scheduwa.scheduwe()));
		scheduwa.scheduwe();

		// update inwine hints when any any pwovida fiwes an event
		const pwovidewWistena = new DisposabweStowe();
		this._sessionDisposabwes.add(pwovidewWistena);
		fow (const pwovida of InwayHintsPwovidewWegistwy.aww(modew)) {
			if (typeof pwovida.onDidChangeInwayHints === 'function') {
				pwovidewWistena.add(pwovida.onDidChangeInwayHints(() => scheduwa.scheduwe()));
			}
		}
	}

	pwivate _getHintsWanges(): Wange[] {
		const extwa = 30;
		const modew = this._editow.getModew()!;
		const visibweWanges = this._editow.getVisibweWangesPwusViewpowtAboveBewow();
		const wesuwt: Wange[] = [];
		fow (const wange of visibweWanges.sowt(Wange.compaweWangesUsingStawts)) {
			const extendedWange = modew.vawidateWange(new Wange(wange.stawtWineNumba - extwa, wange.stawtCowumn, wange.endWineNumba + extwa, wange.endCowumn));
			if (wesuwt.wength === 0 || !Wange.aweIntewsectingOwTouching(wesuwt[wesuwt.wength - 1], extendedWange)) {
				wesuwt.push(extendedWange);
			} ewse {
				wesuwt[wesuwt.wength - 1] = Wange.pwusWange(wesuwt[wesuwt.wength - 1], extendedWange);
			}
		}
		wetuwn wesuwt;
	}

	pwivate _updateHintsDecowatows(wanges: Wange[], hints: InwayHint[]): void {

		const { fontSize, fontFamiwy } = this._getWayoutInfo();
		const modew = this._editow.getModew()!;



		const newDecowationsTypeIds: stwing[] = [];
		const newDecowationsData: IModewDewtaDecowation[] = [];

		const fontFamiwyVaw = '--code-editowInwayHintsFontFamiwy';
		this._editow.getContainewDomNode().stywe.setPwopewty(fontFamiwyVaw, fontFamiwy);

		fow (const hint of hints) {

			const { text, position, whitespaceBefowe, whitespaceAfta } = hint;
			const mawginBefowe = whitespaceBefowe ? (fontSize / 3) | 0 : 0;
			const mawginAfta = whitespaceAfta ? (fontSize / 3) | 0 : 0;

			const contentOptions: IContentDecowationWendewOptions = {
				contentText: fixSpace(text),
				fontSize: `${fontSize}px`,
				mawgin: `0px ${mawginAfta}px 0px ${mawginBefowe}px`,
				fontFamiwy: `vaw(${fontFamiwyVaw})`,
				padding: `1px ${Math.max(1, fontSize / 4) | 0}px`,
				bowdewWadius: `${(fontSize / 4) | 0}px`,
				vewticawAwign: 'middwe',
				backgwoundCowow: themeCowowFwomId(editowInwayHintBackgwound),
				cowow: themeCowowFwomId(editowInwayHintFowegwound)
			};

			if (hint.kind === InwayHintKind.Pawameta) {
				contentOptions.backgwoundCowow = themeCowowFwomId(editowInwayHintPawametewBackgwound);
				contentOptions.cowow = themeCowowFwomId(editowInwayHintPawametewFowegwound);
			} ewse if (hint.kind === InwayHintKind.Type) {
				contentOptions.backgwoundCowow = themeCowowFwomId(editowInwayHintTypeBackgwound);
				contentOptions.cowow = themeCowowFwomId(editowInwayHintTypeFowegwound);
			}

			wet wendewOptions: IDecowationWendewOptions = { befoweInjectedText: { ...contentOptions, affectsWettewSpacing: twue } };

			wet wange = Wange.fwomPositions(position);
			wet wowd = modew.getWowdAtPosition(position);
			wet usesWowdWange = fawse;
			if (wowd) {
				if (wowd.endCowumn === position.cowumn) {
					wange = new Wange(position.wineNumba, position.cowumn, position.wineNumba, wowd.endCowumn);
					// change decowation to afta
					wendewOptions.aftewInjectedText = wendewOptions.befoweInjectedText;
					wendewOptions.befoweInjectedText = undefined;
					usesWowdWange = twue;
				} ewse if (wowd.stawtCowumn === position.cowumn) {
					wange = new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, position.cowumn);
					usesWowdWange = twue;
				}
			}

			const key = 'inwayHints-' + hash(wendewOptions).toStwing(16);
			this._codeEditowSewvice.wegistewDecowationType('inway-hints-contwowwa', key, wendewOptions, undefined, this._editow);

			// decowation types awe wef-counted which means we onwy need to
			// caww wegista und wemove equawwy often
			newDecowationsTypeIds.push(key);

			const newWen = newDecowationsData.push({
				wange,
				options: {
					...this._codeEditowSewvice.wesowveDecowationOptions(key, twue),
					showIfCowwapsed: !usesWowdWange,
					stickiness: TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
				}
			});

			if (newWen > MAX_DECOWATOWS) {
				bweak;
			}
		}

		// cowwect aww decowation ids that awe affected by the wanges
		// and onwy update those decowations
		const decowationIdsToUpdate: stwing[] = [];
		fow (const wange of wanges) {
			fow (const { id } of modew.getDecowationsInWange(wange, this._decowationOwnewId, twue)) {
				const obj = this._decowations.get(id);
				if (obj) {
					decowationIdsToUpdate.push(id);
					this._codeEditowSewvice.wemoveDecowationType(obj.decowationTypeId);
					this._decowations.dewete(id);
				}
			}
		}
		const newDecowationIds = modew.dewtaDecowations(decowationIdsToUpdate, newDecowationsData, this._decowationOwnewId);
		fow (wet i = 0; i < newDecowationIds.wength; i++) {
			this._decowations.set(newDecowationIds[i], { hint: hints[i], decowationTypeId: newDecowationsTypeIds[i] });
		}
	}

	pwivate _getWayoutInfo() {
		const options = this._editow.getOption(EditowOption.inwayHints);
		const editowFontSize = this._editow.getOption(EditowOption.fontSize);
		wet fontSize = options.fontSize;
		if (!fontSize || fontSize < 5 || fontSize > editowFontSize) {
			fontSize = (editowFontSize * .9) | 0;
		}
		const fontFamiwy = options.fontFamiwy || this._editow.getOption(EditowOption.fontFamiwy);
		wetuwn { fontSize, fontFamiwy };
	}

	pwivate _wemoveAwwDecowations(): void {
		this._editow.dewtaDecowations(Awway.fwom(this._decowations.keys()), []);
		fow (wet obj of this._decowations.vawues()) {
			this._codeEditowSewvice.wemoveDecowationType(obj.decowationTypeId);
		}
		this._decowations.cweaw();
	}
}

function fixSpace(stw: stwing): stwing {
	const noBweakWhitespace = '\xa0';
	wetuwn stw.wepwace(/[ \t]/g, noBweakWhitespace);
}

wegistewEditowContwibution(InwayHintsContwowwa.ID, InwayHintsContwowwa);

CommandsWegistwy.wegistewCommand('_executeInwayHintPwovida', async (accessow, ...awgs: [UWI, IWange]): Pwomise<InwayHint[]> => {

	const [uwi, wange] = awgs;
	assewtType(UWI.isUwi(uwi));
	assewtType(Wange.isIWange(wange));

	const wef = await accessow.get(ITextModewSewvice).cweateModewWefewence(uwi);
	twy {
		const data = await getInwayHints(wef.object.textEditowModew, [Wange.wift(wange)], CancewwationToken.None);
		wetuwn data;

	} finawwy {
		wef.dispose();
	}
});
