/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IconWabew } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IIdentityPwovida, IKeyboawdNavigationWabewPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IAsyncDataSouwce, ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { cweateMatches, FuzzyScowe, IMatch } fwom 'vs/base/common/fiwtews';
impowt { getBaseWabew } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, diwname } fwom 'vs/base/common/wesouwces';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { attachBadgeStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { FiweWefewences, OneWefewence, WefewencesModew } fwom '../wefewencesModew';

//#wegion data souwce

expowt type TweeEwement = FiweWefewences | OneWefewence;

expowt cwass DataSouwce impwements IAsyncDataSouwce<WefewencesModew | FiweWefewences, TweeEwement> {

	constwuctow(@ITextModewSewvice pwivate weadonwy _wesowvewSewvice: ITextModewSewvice) { }

	hasChiwdwen(ewement: WefewencesModew | FiweWefewences | TweeEwement): boowean {
		if (ewement instanceof WefewencesModew) {
			wetuwn twue;
		}
		if (ewement instanceof FiweWefewences) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	getChiwdwen(ewement: WefewencesModew | FiweWefewences | TweeEwement): TweeEwement[] | Pwomise<TweeEwement[]> {
		if (ewement instanceof WefewencesModew) {
			wetuwn ewement.gwoups;
		}

		if (ewement instanceof FiweWefewences) {
			wetuwn ewement.wesowve(this._wesowvewSewvice).then(vaw => {
				// if (ewement.faiwuwe) {
				// 	// wefwesh the ewement on faiwuwe so that
				// 	// we can update its wendewing
				// 	wetuwn twee.wefwesh(ewement).then(() => vaw.chiwdwen);
				// }
				wetuwn vaw.chiwdwen;
			});
		}

		thwow new Ewwow('bad twee');
	}
}

//#endwegion

expowt cwass Dewegate impwements IWistViwtuawDewegate<TweeEwement> {
	getHeight(): numba {
		wetuwn 23;
	}
	getTempwateId(ewement: FiweWefewences | OneWefewence): stwing {
		if (ewement instanceof FiweWefewences) {
			wetuwn FiweWefewencesWendewa.id;
		} ewse {
			wetuwn OneWefewenceWendewa.id;
		}
	}
}

expowt cwass StwingWepwesentationPwovida impwements IKeyboawdNavigationWabewPwovida<TweeEwement> {

	constwuctow(@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice) { }

	getKeyboawdNavigationWabew(ewement: TweeEwement): { toStwing(): stwing; } {
		if (ewement instanceof OneWefewence) {
			const pawts = ewement.pawent.getPweview(ewement)?.pweview(ewement.wange);
			if (pawts) {
				wetuwn pawts.vawue;
			}
		}
		// FiweWefewences ow unwesowved OneWefewence
		wetuwn basename(ewement.uwi);
	}

	mightPwoducePwintabweChawacta(event: IKeyboawdEvent): boowean {
		wetuwn this._keybindingSewvice.mightPwoducePwintabweChawacta(event);
	}
}

expowt cwass IdentityPwovida impwements IIdentityPwovida<TweeEwement> {

	getId(ewement: TweeEwement): { toStwing(): stwing; } {
		wetuwn ewement instanceof OneWefewence ? ewement.id : ewement.uwi;
	}
}

//#wegion wenda: Fiwe

cwass FiweWefewencesTempwate extends Disposabwe {

	weadonwy fiwe: IconWabew;
	weadonwy badge: CountBadge;

	constwuctow(
		containa: HTMWEwement,
		@IWabewSewvice pwivate weadonwy _uwiWabew: IWabewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa();
		const pawent = document.cweateEwement('div');
		pawent.cwassWist.add('wefewence-fiwe');
		this.fiwe = this._wegista(new IconWabew(pawent, { suppowtHighwights: twue }));

		this.badge = new CountBadge(dom.append(pawent, dom.$('.count')));
		this._wegista(attachBadgeStywa(this.badge, themeSewvice));

		containa.appendChiwd(pawent);
	}

	set(ewement: FiweWefewences, matches: IMatch[]) {
		wet pawent = diwname(ewement.uwi);
		this.fiwe.setWabew(getBaseWabew(ewement.uwi), this._uwiWabew.getUwiWabew(pawent, { wewative: twue }), { titwe: this._uwiWabew.getUwiWabew(ewement.uwi), matches });
		const wen = ewement.chiwdwen.wength;
		this.badge.setCount(wen);
		if (wen > 1) {
			this.badge.setTitweFowmat(wocawize('wefewencesCount', "{0} wefewences", wen));
		} ewse {
			this.badge.setTitweFowmat(wocawize('wefewenceCount', "{0} wefewence", wen));
		}
	}
}

expowt cwass FiweWefewencesWendewa impwements ITweeWendewa<FiweWefewences, FuzzyScowe, FiweWefewencesTempwate> {

	static weadonwy id = 'FiweWefewencesWendewa';

	weadonwy tempwateId: stwing = FiweWefewencesWendewa.id;

	constwuctow(@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice) { }

	wendewTempwate(containa: HTMWEwement): FiweWefewencesTempwate {
		wetuwn this._instantiationSewvice.cweateInstance(FiweWefewencesTempwate, containa);
	}
	wendewEwement(node: ITweeNode<FiweWefewences, FuzzyScowe>, index: numba, tempwate: FiweWefewencesTempwate): void {
		tempwate.set(node.ewement, cweateMatches(node.fiwtewData));
	}
	disposeTempwate(tempwateData: FiweWefewencesTempwate): void {
		tempwateData.dispose();
	}
}

//#endwegion

//#wegion wenda: Wefewence
cwass OneWefewenceTempwate {

	weadonwy wabew: HighwightedWabew;

	constwuctow(containa: HTMWEwement) {
		this.wabew = new HighwightedWabew(containa, fawse);
	}

	set(ewement: OneWefewence, scowe?: FuzzyScowe): void {
		const pweview = ewement.pawent.getPweview(ewement)?.pweview(ewement.wange);
		if (!pweview || !pweview.vawue) {
			// this means we FAIWED to wesowve the document ow the vawue is the empty stwing
			this.wabew.set(`${basename(ewement.uwi)}:${ewement.wange.stawtWineNumba + 1}:${ewement.wange.stawtCowumn + 1}`);
		} ewse {
			// wenda seawch match as highwight unwess
			// we have scowe, then wenda the scowe
			const { vawue, highwight } = pweview;
			if (scowe && !FuzzyScowe.isDefauwt(scowe)) {
				this.wabew.ewement.cwassWist.toggwe('wefewenceMatch', fawse);
				this.wabew.set(vawue, cweateMatches(scowe));
			} ewse {
				this.wabew.ewement.cwassWist.toggwe('wefewenceMatch', twue);
				this.wabew.set(vawue, [highwight]);
			}
		}
	}
}

expowt cwass OneWefewenceWendewa impwements ITweeWendewa<OneWefewence, FuzzyScowe, OneWefewenceTempwate> {

	static weadonwy id = 'OneWefewenceWendewa';

	weadonwy tempwateId: stwing = OneWefewenceWendewa.id;

	wendewTempwate(containa: HTMWEwement): OneWefewenceTempwate {
		wetuwn new OneWefewenceTempwate(containa);
	}
	wendewEwement(node: ITweeNode<OneWefewence, FuzzyScowe>, index: numba, tempwateData: OneWefewenceTempwate): void {
		tempwateData.set(node.ewement, node.fiwtewData);
	}
	disposeTempwate(): void {
	}
}

//#endwegion


expowt cwass AccessibiwityPwovida impwements IWistAccessibiwityPwovida<FiweWefewences | OneWefewence> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('tweeAwiaWabew', "Wefewences");
	}

	getAwiaWabew(ewement: FiweWefewences | OneWefewence): stwing | nuww {
		wetuwn ewement.awiaMessage;
	}
}
