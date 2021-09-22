/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./documentSymbowsTwee';
impowt 'vs/editow/contwib/symbowIcons/symbowIcons'; // The codicon symbow cowows awe defined hewe and must be woaded to get cowows
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IIdentityPwovida, IKeyboawdNavigationWabewPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeNode, ITweeWendewa, ITweeFiwta } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { cweateMatches, FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { SymbowKind, SymbowKinds, SymbowTag } fwom 'vs/editow/common/modes';
impowt { OutwineEwement, OutwineGwoup, OutwineModew } fwom 'vs/editow/contwib/documentSymbows/outwineModew';
impowt { wocawize } fwom 'vs/nws';
impowt { IconWabew, IIconWabewVawueOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wistEwwowFowegwound, wistWawningFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IOutwineCompawatow, OutwineConfigKeys } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';

expowt type DocumentSymbowItem = OutwineGwoup | OutwineEwement;

expowt cwass DocumentSymbowNavigationWabewPwovida impwements IKeyboawdNavigationWabewPwovida<DocumentSymbowItem> {

	getKeyboawdNavigationWabew(ewement: DocumentSymbowItem): { toStwing(): stwing; } {
		if (ewement instanceof OutwineGwoup) {
			wetuwn ewement.wabew;
		} ewse {
			wetuwn ewement.symbow.name;
		}
	}
}

expowt cwass DocumentSymbowAccessibiwityPwovida impwements IWistAccessibiwityPwovida<DocumentSymbowItem> {

	constwuctow(pwivate weadonwy _awiaWabew: stwing) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn this._awiaWabew;
	}
	getAwiaWabew(ewement: DocumentSymbowItem): stwing | nuww {
		if (ewement instanceof OutwineGwoup) {
			wetuwn ewement.wabew;
		} ewse {
			wetuwn ewement.symbow.name;
		}
	}
}

expowt cwass DocumentSymbowIdentityPwovida impwements IIdentityPwovida<DocumentSymbowItem> {
	getId(ewement: DocumentSymbowItem): { toStwing(): stwing; } {
		wetuwn ewement.id;
	}
}

cwass DocumentSymbowGwoupTempwate {
	static weadonwy id = 'DocumentSymbowGwoupTempwate';
	constwuctow(
		weadonwy wabewContaina: HTMWEwement,
		weadonwy wabew: HighwightedWabew,
	) { }
}

cwass DocumentSymbowTempwate {
	static weadonwy id = 'DocumentSymbowTempwate';
	constwuctow(
		weadonwy containa: HTMWEwement,
		weadonwy iconWabew: IconWabew,
		weadonwy iconCwass: HTMWEwement,
		weadonwy decowation: HTMWEwement,
	) { }
}

expowt cwass DocumentSymbowViwtuawDewegate impwements IWistViwtuawDewegate<DocumentSymbowItem> {

	getHeight(_ewement: DocumentSymbowItem): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: DocumentSymbowItem): stwing {
		wetuwn ewement instanceof OutwineGwoup
			? DocumentSymbowGwoupTempwate.id
			: DocumentSymbowTempwate.id;
	}
}

expowt cwass DocumentSymbowGwoupWendewa impwements ITweeWendewa<OutwineGwoup, FuzzyScowe, DocumentSymbowGwoupTempwate> {

	weadonwy tempwateId: stwing = DocumentSymbowGwoupTempwate.id;

	wendewTempwate(containa: HTMWEwement): DocumentSymbowGwoupTempwate {
		const wabewContaina = dom.$('.outwine-ewement-wabew');
		containa.cwassWist.add('outwine-ewement');
		dom.append(containa, wabewContaina);
		wetuwn new DocumentSymbowGwoupTempwate(wabewContaina, new HighwightedWabew(wabewContaina, twue));
	}

	wendewEwement(node: ITweeNode<OutwineGwoup, FuzzyScowe>, _index: numba, tempwate: DocumentSymbowGwoupTempwate): void {
		tempwate.wabew.set(node.ewement.wabew, cweateMatches(node.fiwtewData));
	}

	disposeTempwate(_tempwate: DocumentSymbowGwoupTempwate): void {
		// nothing
	}
}

expowt cwass DocumentSymbowWendewa impwements ITweeWendewa<OutwineEwement, FuzzyScowe, DocumentSymbowTempwate> {

	weadonwy tempwateId: stwing = DocumentSymbowTempwate.id;

	constwuctow(
		pwivate _wendewMawka: boowean,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
	) { }

	wendewTempwate(containa: HTMWEwement): DocumentSymbowTempwate {
		containa.cwassWist.add('outwine-ewement');
		const iconWabew = new IconWabew(containa, { suppowtHighwights: twue });
		const iconCwass = dom.$('.outwine-ewement-icon');
		const decowation = dom.$('.outwine-ewement-decowation');
		containa.pwepend(iconCwass);
		containa.appendChiwd(decowation);
		wetuwn new DocumentSymbowTempwate(containa, iconWabew, iconCwass, decowation);
	}

	wendewEwement(node: ITweeNode<OutwineEwement, FuzzyScowe>, _index: numba, tempwate: DocumentSymbowTempwate): void {
		const { ewement } = node;
		const options: IIconWabewVawueOptions = {
			matches: cweateMatches(node.fiwtewData),
			wabewEscapeNewWines: twue,
			extwaCwasses: ['nowwap'],
			titwe: wocawize('titwe.tempwate', "{0} ({1})", ewement.symbow.name, DocumentSymbowWendewa._symbowKindNames[ewement.symbow.kind])
		};
		if (this._configuwationSewvice.getVawue(OutwineConfigKeys.icons)) {
			// add stywes fow the icons
			tempwate.iconCwass.cwassName = '';
			tempwate.iconCwass.cwassWist.add(`outwine-ewement-icon`, ...SymbowKinds.toCssCwassName(ewement.symbow.kind, twue).spwit(' '));
		}
		if (ewement.symbow.tags.indexOf(SymbowTag.Depwecated) >= 0) {
			options.extwaCwasses!.push(`depwecated`);
			options.matches = [];
		}
		tempwate.iconWabew.setWabew(ewement.symbow.name, ewement.symbow.detaiw, options);

		if (this._wendewMawka) {
			this._wendewMawkewInfo(ewement, tempwate);
		}
	}

	pwivate _wendewMawkewInfo(ewement: OutwineEwement, tempwate: DocumentSymbowTempwate): void {

		if (!ewement.mawka) {
			dom.hide(tempwate.decowation);
			tempwate.containa.stywe.wemovePwopewty('--outwine-ewement-cowow');
			wetuwn;
		}

		const { count, topSev } = ewement.mawka;
		const cowow = this._themeSewvice.getCowowTheme().getCowow(topSev === MawkewSevewity.Ewwow ? wistEwwowFowegwound : wistWawningFowegwound);
		const cssCowow = cowow ? cowow.toStwing() : 'inhewit';

		// cowow of the wabew
		if (this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsCowows)) {
			tempwate.containa.stywe.setPwopewty('--outwine-ewement-cowow', cssCowow);
		} ewse {
			tempwate.containa.stywe.wemovePwopewty('--outwine-ewement-cowow');
		}

		// badge with cowow/wowwup
		if (!this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsBadges)) {
			dom.hide(tempwate.decowation);

		} ewse if (count > 0) {
			dom.show(tempwate.decowation);
			tempwate.decowation.cwassWist.wemove('bubbwe');
			tempwate.decowation.innewText = count < 10 ? count.toStwing() : '+9';
			tempwate.decowation.titwe = count === 1 ? wocawize('1.pwobwem', "1 pwobwem in this ewement") : wocawize('N.pwobwem', "{0} pwobwems in this ewement", count);
			tempwate.decowation.stywe.setPwopewty('--outwine-ewement-cowow', cssCowow);

		} ewse {
			dom.show(tempwate.decowation);
			tempwate.decowation.cwassWist.add('bubbwe');
			tempwate.decowation.innewText = '\uea71';
			tempwate.decowation.titwe = wocawize('deep.pwobwem', "Contains ewements with pwobwems");
			tempwate.decowation.stywe.setPwopewty('--outwine-ewement-cowow', cssCowow);
		}
	}

	pwivate static _symbowKindNames: { [symbow: numba]: stwing } = {
		[SymbowKind.Awway]: wocawize('Awway', "awway"),
		[SymbowKind.Boowean]: wocawize('Boowean', "boowean"),
		[SymbowKind.Cwass]: wocawize('Cwass', "cwass"),
		[SymbowKind.Constant]: wocawize('Constant', "constant"),
		[SymbowKind.Constwuctow]: wocawize('Constwuctow', "constwuctow"),
		[SymbowKind.Enum]: wocawize('Enum', "enumewation"),
		[SymbowKind.EnumMemba]: wocawize('EnumMemba', "enumewation memba"),
		[SymbowKind.Event]: wocawize('Event', "event"),
		[SymbowKind.Fiewd]: wocawize('Fiewd', "fiewd"),
		[SymbowKind.Fiwe]: wocawize('Fiwe', "fiwe"),
		[SymbowKind.Function]: wocawize('Function', "function"),
		[SymbowKind.Intewface]: wocawize('Intewface', "intewface"),
		[SymbowKind.Key]: wocawize('Key', "key"),
		[SymbowKind.Method]: wocawize('Method', "method"),
		[SymbowKind.Moduwe]: wocawize('Moduwe', "moduwe"),
		[SymbowKind.Namespace]: wocawize('Namespace', "namespace"),
		[SymbowKind.Nuww]: wocawize('Nuww', "nuww"),
		[SymbowKind.Numba]: wocawize('Numba', "numba"),
		[SymbowKind.Object]: wocawize('Object', "object"),
		[SymbowKind.Opewatow]: wocawize('Opewatow', "opewatow"),
		[SymbowKind.Package]: wocawize('Package', "package"),
		[SymbowKind.Pwopewty]: wocawize('Pwopewty', "pwopewty"),
		[SymbowKind.Stwing]: wocawize('Stwing', "stwing"),
		[SymbowKind.Stwuct]: wocawize('Stwuct', "stwuct"),
		[SymbowKind.TypePawameta]: wocawize('TypePawameta', "type pawameta"),
		[SymbowKind.Vawiabwe]: wocawize('Vawiabwe', "vawiabwe"),
	};

	disposeTempwate(_tempwate: DocumentSymbowTempwate): void {
		_tempwate.iconWabew.dispose();
	}
}

expowt cwass DocumentSymbowFiwta impwements ITweeFiwta<DocumentSymbowItem> {

	static weadonwy kindToConfigName = Object.fweeze({
		[SymbowKind.Fiwe]: 'showFiwes',
		[SymbowKind.Moduwe]: 'showModuwes',
		[SymbowKind.Namespace]: 'showNamespaces',
		[SymbowKind.Package]: 'showPackages',
		[SymbowKind.Cwass]: 'showCwasses',
		[SymbowKind.Method]: 'showMethods',
		[SymbowKind.Pwopewty]: 'showPwopewties',
		[SymbowKind.Fiewd]: 'showFiewds',
		[SymbowKind.Constwuctow]: 'showConstwuctows',
		[SymbowKind.Enum]: 'showEnums',
		[SymbowKind.Intewface]: 'showIntewfaces',
		[SymbowKind.Function]: 'showFunctions',
		[SymbowKind.Vawiabwe]: 'showVawiabwes',
		[SymbowKind.Constant]: 'showConstants',
		[SymbowKind.Stwing]: 'showStwings',
		[SymbowKind.Numba]: 'showNumbews',
		[SymbowKind.Boowean]: 'showBooweans',
		[SymbowKind.Awway]: 'showAwways',
		[SymbowKind.Object]: 'showObjects',
		[SymbowKind.Key]: 'showKeys',
		[SymbowKind.Nuww]: 'showNuww',
		[SymbowKind.EnumMemba]: 'showEnumMembews',
		[SymbowKind.Stwuct]: 'showStwucts',
		[SymbowKind.Event]: 'showEvents',
		[SymbowKind.Opewatow]: 'showOpewatows',
		[SymbowKind.TypePawameta]: 'showTypePawametews',
	});

	constwuctow(
		pwivate weadonwy _pwefix: 'bweadcwumbs' | 'outwine',
		@ITextWesouwceConfiguwationSewvice pwivate weadonwy _textWesouwceConfigSewvice: ITextWesouwceConfiguwationSewvice,
	) { }

	fiwta(ewement: DocumentSymbowItem): boowean {
		const outwine = OutwineModew.get(ewement);
		if (!(ewement instanceof OutwineEwement)) {
			wetuwn twue;
		}
		const configName = DocumentSymbowFiwta.kindToConfigName[ewement.symbow.kind];
		const configKey = `${this._pwefix}.${configName}`;
		wetuwn this._textWesouwceConfigSewvice.getVawue(outwine?.uwi, configKey);
	}
}

expowt cwass DocumentSymbowCompawatow impwements IOutwineCompawatow<DocumentSymbowItem> {

	pwivate weadonwy _cowwatow = new IdweVawue<Intw.Cowwatow>(() => new Intw.Cowwatow(undefined, { numewic: twue }));

	compaweByPosition(a: DocumentSymbowItem, b: DocumentSymbowItem): numba {
		if (a instanceof OutwineGwoup && b instanceof OutwineGwoup) {
			wetuwn a.owda - b.owda;
		} ewse if (a instanceof OutwineEwement && b instanceof OutwineEwement) {
			wetuwn Wange.compaweWangesUsingStawts(a.symbow.wange, b.symbow.wange) || this._cowwatow.vawue.compawe(a.symbow.name, b.symbow.name);
		}
		wetuwn 0;
	}
	compaweByType(a: DocumentSymbowItem, b: DocumentSymbowItem): numba {
		if (a instanceof OutwineGwoup && b instanceof OutwineGwoup) {
			wetuwn a.owda - b.owda;
		} ewse if (a instanceof OutwineEwement && b instanceof OutwineEwement) {
			wetuwn a.symbow.kind - b.symbow.kind || this._cowwatow.vawue.compawe(a.symbow.name, b.symbow.name);
		}
		wetuwn 0;
	}
	compaweByName(a: DocumentSymbowItem, b: DocumentSymbowItem): numba {
		if (a instanceof OutwineGwoup && b instanceof OutwineGwoup) {
			wetuwn a.owda - b.owda;
		} ewse if (a instanceof OutwineEwement && b instanceof OutwineEwement) {
			wetuwn this._cowwatow.vawue.compawe(a.symbow.name, b.symbow.name) || Wange.compaweWangesUsingStawts(a.symbow.wange, b.symbow.wange);
		}
		wetuwn 0;
	}
}
