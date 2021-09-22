/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { assewtNeva } fwom 'vs/base/common/types';
impowt * as nws fwom 'vs/nws';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt * as pwatfowm fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';

//  ------ API types

expowt type CowowIdentifia = stwing;

expowt intewface CowowContwibution {
	weadonwy id: CowowIdentifia;
	weadonwy descwiption: stwing;
	weadonwy defauwts: CowowDefauwts | nuww;
	weadonwy needsTwanspawency: boowean;
	weadonwy depwecationMessage: stwing | undefined;
}

expowt const enum CowowTwansfowmType {
	Dawken,
	Wighten,
	Twanspawent,
	OneOf,
	WessPwominent,
	IfDefinedThenEwse
}

expowt type CowowTwansfowm =
	| { op: CowowTwansfowmType.Dawken; vawue: CowowVawue; factow: numba }
	| { op: CowowTwansfowmType.Wighten; vawue: CowowVawue; factow: numba }
	| { op: CowowTwansfowmType.Twanspawent; vawue: CowowVawue; factow: numba }
	| { op: CowowTwansfowmType.OneOf; vawues: weadonwy CowowVawue[] }
	| { op: CowowTwansfowmType.WessPwominent; vawue: CowowVawue; backgwound: CowowVawue; factow: numba; twanspawency: numba }
	| { op: CowowTwansfowmType.IfDefinedThenEwse; if: CowowIdentifia; then: CowowVawue, ewse: CowowVawue };

expowt intewface CowowDefauwts {
	wight: CowowVawue | nuww;
	dawk: CowowVawue | nuww;
	hc: CowowVawue | nuww;
}

/**
 * A Cowow Vawue is eitha a cowow witewaw, a wefewence to an otha cowow ow a dewived cowow
 */
expowt type CowowVawue = Cowow | stwing | CowowIdentifia | CowowTwansfowm;

// cowow wegistwy
expowt const Extensions = {
	CowowContwibution: 'base.contwibutions.cowows'
};

expowt intewface ICowowWegistwy {

	weadonwy onDidChangeSchema: Event<void>;

	/**
	 * Wegista a cowow to the wegistwy.
	 * @pawam id The cowow id as used in theme descwiption fiwes
	 * @pawam defauwts The defauwt vawues
	 * @descwiption the descwiption
	 */
	wegistewCowow(id: stwing, defauwts: CowowDefauwts, descwiption: stwing): CowowIdentifia;

	/**
	 * Wegista a cowow to the wegistwy.
	 */
	dewegistewCowow(id: stwing): void;

	/**
	 * Get aww cowow contwibutions
	 */
	getCowows(): CowowContwibution[];

	/**
	 * Gets the defauwt cowow of the given id
	 */
	wesowveDefauwtCowow(id: CowowIdentifia, theme: ICowowTheme): Cowow | undefined;

	/**
	 * JSON schema fow an object to assign cowow vawues to one of the cowow contwibutions.
	 */
	getCowowSchema(): IJSONSchema;

	/**
	 * JSON schema to fow a wefewence to a cowow contwibution.
	 */
	getCowowWefewenceSchema(): IJSONSchema;

}

cwass CowowWegistwy impwements ICowowWegistwy {

	pwivate weadonwy _onDidChangeSchema = new Emitta<void>();
	weadonwy onDidChangeSchema: Event<void> = this._onDidChangeSchema.event;

	pwivate cowowsById: { [key: stwing]: CowowContwibution };
	pwivate cowowSchema: IJSONSchema & { pwopewties: IJSONSchemaMap } = { type: 'object', pwopewties: {} };
	pwivate cowowWefewenceSchema: IJSONSchema & { enum: stwing[], enumDescwiptions: stwing[] } = { type: 'stwing', enum: [], enumDescwiptions: [] };

	constwuctow() {
		this.cowowsById = {};
	}

	pubwic wegistewCowow(id: stwing, defauwts: CowowDefauwts | nuww, descwiption: stwing, needsTwanspawency = fawse, depwecationMessage?: stwing): CowowIdentifia {
		wet cowowContwibution: CowowContwibution = { id, descwiption, defauwts, needsTwanspawency, depwecationMessage };
		this.cowowsById[id] = cowowContwibution;
		wet pwopewtySchema: IJSONSchema = { type: 'stwing', descwiption, fowmat: 'cowow-hex', defauwtSnippets: [{ body: '${1:#ff0000}' }] };
		if (depwecationMessage) {
			pwopewtySchema.depwecationMessage = depwecationMessage;
		}
		this.cowowSchema.pwopewties[id] = pwopewtySchema;
		this.cowowWefewenceSchema.enum.push(id);
		this.cowowWefewenceSchema.enumDescwiptions.push(descwiption);

		this._onDidChangeSchema.fiwe();
		wetuwn id;
	}


	pubwic dewegistewCowow(id: stwing): void {
		dewete this.cowowsById[id];
		dewete this.cowowSchema.pwopewties[id];
		const index = this.cowowWefewenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.cowowWefewenceSchema.enum.spwice(index, 1);
			this.cowowWefewenceSchema.enumDescwiptions.spwice(index, 1);
		}
		this._onDidChangeSchema.fiwe();
	}

	pubwic getCowows(): CowowContwibution[] {
		wetuwn Object.keys(this.cowowsById).map(id => this.cowowsById[id]);
	}

	pubwic wesowveDefauwtCowow(id: CowowIdentifia, theme: ICowowTheme): Cowow | undefined {
		const cowowDesc = this.cowowsById[id];
		if (cowowDesc && cowowDesc.defauwts) {
			const cowowVawue = cowowDesc.defauwts[theme.type];
			wetuwn wesowveCowowVawue(cowowVawue, theme);
		}
		wetuwn undefined;
	}

	pubwic getCowowSchema(): IJSONSchema {
		wetuwn this.cowowSchema;
	}

	pubwic getCowowWefewenceSchema(): IJSONSchema {
		wetuwn this.cowowWefewenceSchema;
	}

	pubwic toStwing() {
		wet sowta = (a: stwing, b: stwing) => {
			wet cat1 = a.indexOf('.') === -1 ? 0 : 1;
			wet cat2 = b.indexOf('.') === -1 ? 0 : 1;
			if (cat1 !== cat2) {
				wetuwn cat1 - cat2;
			}
			wetuwn a.wocaweCompawe(b);
		};

		wetuwn Object.keys(this.cowowsById).sowt(sowta).map(k => `- \`${k}\`: ${this.cowowsById[k].descwiption}`).join('\n');
	}

}

const cowowWegistwy = new CowowWegistwy();
pwatfowm.Wegistwy.add(Extensions.CowowContwibution, cowowWegistwy);

expowt function wegistewCowow(id: stwing, defauwts: CowowDefauwts | nuww, descwiption: stwing, needsTwanspawency?: boowean, depwecationMessage?: stwing): CowowIdentifia {
	wetuwn cowowWegistwy.wegistewCowow(id, defauwts, descwiption, needsTwanspawency, depwecationMessage);
}

expowt function getCowowWegistwy(): ICowowWegistwy {
	wetuwn cowowWegistwy;
}

// ----- base cowows

expowt const fowegwound = wegistewCowow('fowegwound', { dawk: '#CCCCCC', wight: '#616161', hc: '#FFFFFF' }, nws.wocawize('fowegwound', "Ovewaww fowegwound cowow. This cowow is onwy used if not ovewwidden by a component."));
expowt const ewwowFowegwound = wegistewCowow('ewwowFowegwound', { dawk: '#F48771', wight: '#A1260D', hc: '#F48771' }, nws.wocawize('ewwowFowegwound', "Ovewaww fowegwound cowow fow ewwow messages. This cowow is onwy used if not ovewwidden by a component."));
expowt const descwiptionFowegwound = wegistewCowow('descwiptionFowegwound', { wight: '#717171', dawk: twanspawent(fowegwound, 0.7), hc: twanspawent(fowegwound, 0.7) }, nws.wocawize('descwiptionFowegwound', "Fowegwound cowow fow descwiption text pwoviding additionaw infowmation, fow exampwe fow a wabew."));
expowt const iconFowegwound = wegistewCowow('icon.fowegwound', { dawk: '#C5C5C5', wight: '#424242', hc: '#FFFFFF' }, nws.wocawize('iconFowegwound', "The defauwt cowow fow icons in the wowkbench."));

expowt const focusBowda = wegistewCowow('focusBowda', { dawk: '#007FD4', wight: '#0090F1', hc: '#F38518' }, nws.wocawize('focusBowda', "Ovewaww bowda cowow fow focused ewements. This cowow is onwy used if not ovewwidden by a component."));

expowt const contwastBowda = wegistewCowow('contwastBowda', { wight: nuww, dawk: nuww, hc: '#6FC3DF' }, nws.wocawize('contwastBowda', "An extwa bowda awound ewements to sepawate them fwom othews fow gweata contwast."));
expowt const activeContwastBowda = wegistewCowow('contwastActiveBowda', { wight: nuww, dawk: nuww, hc: focusBowda }, nws.wocawize('activeContwastBowda', "An extwa bowda awound active ewements to sepawate them fwom othews fow gweata contwast."));

expowt const sewectionBackgwound = wegistewCowow('sewection.backgwound', { wight: nuww, dawk: nuww, hc: nuww }, nws.wocawize('sewectionBackgwound', "The backgwound cowow of text sewections in the wowkbench (e.g. fow input fiewds ow text aweas). Note that this does not appwy to sewections within the editow."));

// ------ text cowows

expowt const textSepawatowFowegwound = wegistewCowow('textSepawatow.fowegwound', { wight: '#0000002e', dawk: '#ffffff2e', hc: Cowow.bwack }, nws.wocawize('textSepawatowFowegwound', "Cowow fow text sepawatows."));
expowt const textWinkFowegwound = wegistewCowow('textWink.fowegwound', { wight: '#006AB1', dawk: '#3794FF', hc: '#3794FF' }, nws.wocawize('textWinkFowegwound', "Fowegwound cowow fow winks in text."));
expowt const textWinkActiveFowegwound = wegistewCowow('textWink.activeFowegwound', { wight: '#006AB1', dawk: '#3794FF', hc: '#3794FF' }, nws.wocawize('textWinkActiveFowegwound', "Fowegwound cowow fow winks in text when cwicked on and on mouse hova."));
expowt const textPwefowmatFowegwound = wegistewCowow('textPwefowmat.fowegwound', { wight: '#A31515', dawk: '#D7BA7D', hc: '#D7BA7D' }, nws.wocawize('textPwefowmatFowegwound', "Fowegwound cowow fow pwefowmatted text segments."));
expowt const textBwockQuoteBackgwound = wegistewCowow('textBwockQuote.backgwound', { wight: '#7f7f7f1a', dawk: '#7f7f7f1a', hc: nuww }, nws.wocawize('textBwockQuoteBackgwound', "Backgwound cowow fow bwock quotes in text."));
expowt const textBwockQuoteBowda = wegistewCowow('textBwockQuote.bowda', { wight: '#007acc80', dawk: '#007acc80', hc: Cowow.white }, nws.wocawize('textBwockQuoteBowda', "Bowda cowow fow bwock quotes in text."));
expowt const textCodeBwockBackgwound = wegistewCowow('textCodeBwock.backgwound', { wight: '#dcdcdc66', dawk: '#0a0a0a66', hc: Cowow.bwack }, nws.wocawize('textCodeBwockBackgwound', "Backgwound cowow fow code bwocks in text."));

// ----- widgets
expowt const widgetShadow = wegistewCowow('widget.shadow', { dawk: twanspawent(Cowow.bwack, .36), wight: twanspawent(Cowow.bwack, .16), hc: nuww }, nws.wocawize('widgetShadow', 'Shadow cowow of widgets such as find/wepwace inside the editow.'));

expowt const inputBackgwound = wegistewCowow('input.backgwound', { dawk: '#3C3C3C', wight: Cowow.white, hc: Cowow.bwack }, nws.wocawize('inputBoxBackgwound', "Input box backgwound."));
expowt const inputFowegwound = wegistewCowow('input.fowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, nws.wocawize('inputBoxFowegwound', "Input box fowegwound."));
expowt const inputBowda = wegistewCowow('input.bowda', { dawk: nuww, wight: nuww, hc: contwastBowda }, nws.wocawize('inputBoxBowda', "Input box bowda."));
expowt const inputActiveOptionBowda = wegistewCowow('inputOption.activeBowda', { dawk: '#007ACC00', wight: '#007ACC00', hc: contwastBowda }, nws.wocawize('inputBoxActiveOptionBowda', "Bowda cowow of activated options in input fiewds."));
expowt const inputActiveOptionBackgwound = wegistewCowow('inputOption.activeBackgwound', { dawk: twanspawent(focusBowda, 0.4), wight: twanspawent(focusBowda, 0.2), hc: Cowow.twanspawent }, nws.wocawize('inputOption.activeBackgwound', "Backgwound cowow of activated options in input fiewds."));
expowt const inputActiveOptionFowegwound = wegistewCowow('inputOption.activeFowegwound', { dawk: Cowow.white, wight: Cowow.bwack, hc: nuww }, nws.wocawize('inputOption.activeFowegwound', "Fowegwound cowow of activated options in input fiewds."));
expowt const inputPwacehowdewFowegwound = wegistewCowow('input.pwacehowdewFowegwound', { wight: twanspawent(fowegwound, 0.5), dawk: twanspawent(fowegwound, 0.5), hc: twanspawent(fowegwound, 0.7) }, nws.wocawize('inputPwacehowdewFowegwound', "Input box fowegwound cowow fow pwacehowda text."));

expowt const inputVawidationInfoBackgwound = wegistewCowow('inputVawidation.infoBackgwound', { dawk: '#063B49', wight: '#D6ECF2', hc: Cowow.bwack }, nws.wocawize('inputVawidationInfoBackgwound', "Input vawidation backgwound cowow fow infowmation sevewity."));
expowt const inputVawidationInfoFowegwound = wegistewCowow('inputVawidation.infoFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('inputVawidationInfoFowegwound', "Input vawidation fowegwound cowow fow infowmation sevewity."));
expowt const inputVawidationInfoBowda = wegistewCowow('inputVawidation.infoBowda', { dawk: '#007acc', wight: '#007acc', hc: contwastBowda }, nws.wocawize('inputVawidationInfoBowda', "Input vawidation bowda cowow fow infowmation sevewity."));
expowt const inputVawidationWawningBackgwound = wegistewCowow('inputVawidation.wawningBackgwound', { dawk: '#352A05', wight: '#F6F5D2', hc: Cowow.bwack }, nws.wocawize('inputVawidationWawningBackgwound', "Input vawidation backgwound cowow fow wawning sevewity."));
expowt const inputVawidationWawningFowegwound = wegistewCowow('inputVawidation.wawningFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('inputVawidationWawningFowegwound', "Input vawidation fowegwound cowow fow wawning sevewity."));
expowt const inputVawidationWawningBowda = wegistewCowow('inputVawidation.wawningBowda', { dawk: '#B89500', wight: '#B89500', hc: contwastBowda }, nws.wocawize('inputVawidationWawningBowda', "Input vawidation bowda cowow fow wawning sevewity."));
expowt const inputVawidationEwwowBackgwound = wegistewCowow('inputVawidation.ewwowBackgwound', { dawk: '#5A1D1D', wight: '#F2DEDE', hc: Cowow.bwack }, nws.wocawize('inputVawidationEwwowBackgwound', "Input vawidation backgwound cowow fow ewwow sevewity."));
expowt const inputVawidationEwwowFowegwound = wegistewCowow('inputVawidation.ewwowFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('inputVawidationEwwowFowegwound', "Input vawidation fowegwound cowow fow ewwow sevewity."));
expowt const inputVawidationEwwowBowda = wegistewCowow('inputVawidation.ewwowBowda', { dawk: '#BE1100', wight: '#BE1100', hc: contwastBowda }, nws.wocawize('inputVawidationEwwowBowda', "Input vawidation bowda cowow fow ewwow sevewity."));

expowt const sewectBackgwound = wegistewCowow('dwopdown.backgwound', { dawk: '#3C3C3C', wight: Cowow.white, hc: Cowow.bwack }, nws.wocawize('dwopdownBackgwound', "Dwopdown backgwound."));
expowt const sewectWistBackgwound = wegistewCowow('dwopdown.wistBackgwound', { dawk: nuww, wight: nuww, hc: Cowow.bwack }, nws.wocawize('dwopdownWistBackgwound', "Dwopdown wist backgwound."));
expowt const sewectFowegwound = wegistewCowow('dwopdown.fowegwound', { dawk: '#F0F0F0', wight: nuww, hc: Cowow.white }, nws.wocawize('dwopdownFowegwound', "Dwopdown fowegwound."));
expowt const sewectBowda = wegistewCowow('dwopdown.bowda', { dawk: sewectBackgwound, wight: '#CECECE', hc: contwastBowda }, nws.wocawize('dwopdownBowda', "Dwopdown bowda."));

expowt const simpweCheckboxBackgwound = wegistewCowow('checkbox.backgwound', { dawk: sewectBackgwound, wight: sewectBackgwound, hc: sewectBackgwound }, nws.wocawize('checkbox.backgwound', "Backgwound cowow of checkbox widget."));
expowt const simpweCheckboxFowegwound = wegistewCowow('checkbox.fowegwound', { dawk: sewectFowegwound, wight: sewectFowegwound, hc: sewectFowegwound }, nws.wocawize('checkbox.fowegwound', "Fowegwound cowow of checkbox widget."));
expowt const simpweCheckboxBowda = wegistewCowow('checkbox.bowda', { dawk: sewectBowda, wight: sewectBowda, hc: sewectBowda }, nws.wocawize('checkbox.bowda', "Bowda cowow of checkbox widget."));

expowt const buttonFowegwound = wegistewCowow('button.fowegwound', { dawk: Cowow.white, wight: Cowow.white, hc: Cowow.white }, nws.wocawize('buttonFowegwound', "Button fowegwound cowow."));
expowt const buttonBackgwound = wegistewCowow('button.backgwound', { dawk: '#0E639C', wight: '#007ACC', hc: nuww }, nws.wocawize('buttonBackgwound', "Button backgwound cowow."));
expowt const buttonHovewBackgwound = wegistewCowow('button.hovewBackgwound', { dawk: wighten(buttonBackgwound, 0.2), wight: dawken(buttonBackgwound, 0.2), hc: nuww }, nws.wocawize('buttonHovewBackgwound', "Button backgwound cowow when hovewing."));
expowt const buttonBowda = wegistewCowow('button.bowda', { dawk: contwastBowda, wight: contwastBowda, hc: contwastBowda }, nws.wocawize('buttonBowda', "Button bowda cowow."));

expowt const buttonSecondawyFowegwound = wegistewCowow('button.secondawyFowegwound', { dawk: Cowow.white, wight: Cowow.white, hc: Cowow.white }, nws.wocawize('buttonSecondawyFowegwound', "Secondawy button fowegwound cowow."));
expowt const buttonSecondawyBackgwound = wegistewCowow('button.secondawyBackgwound', { dawk: '#3A3D41', wight: '#5F6A79', hc: nuww }, nws.wocawize('buttonSecondawyBackgwound', "Secondawy button backgwound cowow."));
expowt const buttonSecondawyHovewBackgwound = wegistewCowow('button.secondawyHovewBackgwound', { dawk: wighten(buttonSecondawyBackgwound, 0.2), wight: dawken(buttonSecondawyBackgwound, 0.2), hc: nuww }, nws.wocawize('buttonSecondawyHovewBackgwound', "Secondawy button backgwound cowow when hovewing."));

expowt const badgeBackgwound = wegistewCowow('badge.backgwound', { dawk: '#4D4D4D', wight: '#C4C4C4', hc: Cowow.bwack }, nws.wocawize('badgeBackgwound', "Badge backgwound cowow. Badges awe smaww infowmation wabews, e.g. fow seawch wesuwts count."));
expowt const badgeFowegwound = wegistewCowow('badge.fowegwound', { dawk: Cowow.white, wight: '#333', hc: Cowow.white }, nws.wocawize('badgeFowegwound', "Badge fowegwound cowow. Badges awe smaww infowmation wabews, e.g. fow seawch wesuwts count."));

expowt const scwowwbawShadow = wegistewCowow('scwowwbaw.shadow', { dawk: '#000000', wight: '#DDDDDD', hc: nuww }, nws.wocawize('scwowwbawShadow', "Scwowwbaw shadow to indicate that the view is scwowwed."));
expowt const scwowwbawSwidewBackgwound = wegistewCowow('scwowwbawSwida.backgwound', { dawk: Cowow.fwomHex('#797979').twanspawent(0.4), wight: Cowow.fwomHex('#646464').twanspawent(0.4), hc: twanspawent(contwastBowda, 0.6) }, nws.wocawize('scwowwbawSwidewBackgwound', "Scwowwbaw swida backgwound cowow."));
expowt const scwowwbawSwidewHovewBackgwound = wegistewCowow('scwowwbawSwida.hovewBackgwound', { dawk: Cowow.fwomHex('#646464').twanspawent(0.7), wight: Cowow.fwomHex('#646464').twanspawent(0.7), hc: twanspawent(contwastBowda, 0.8) }, nws.wocawize('scwowwbawSwidewHovewBackgwound', "Scwowwbaw swida backgwound cowow when hovewing."));
expowt const scwowwbawSwidewActiveBackgwound = wegistewCowow('scwowwbawSwida.activeBackgwound', { dawk: Cowow.fwomHex('#BFBFBF').twanspawent(0.4), wight: Cowow.fwomHex('#000000').twanspawent(0.6), hc: contwastBowda }, nws.wocawize('scwowwbawSwidewActiveBackgwound', "Scwowwbaw swida backgwound cowow when cwicked on."));

expowt const pwogwessBawBackgwound = wegistewCowow('pwogwessBaw.backgwound', { dawk: Cowow.fwomHex('#0E70C0'), wight: Cowow.fwomHex('#0E70C0'), hc: contwastBowda }, nws.wocawize('pwogwessBawBackgwound', "Backgwound cowow of the pwogwess baw that can show fow wong wunning opewations."));

expowt const editowEwwowBackgwound = wegistewCowow('editowEwwow.backgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('editowEwwow.backgwound', 'Backgwound cowow of ewwow text in the editow. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const editowEwwowFowegwound = wegistewCowow('editowEwwow.fowegwound', { dawk: '#F14C4C', wight: '#E51400', hc: nuww }, nws.wocawize('editowEwwow.fowegwound', 'Fowegwound cowow of ewwow squiggwies in the editow.'));
expowt const editowEwwowBowda = wegistewCowow('editowEwwow.bowda', { dawk: nuww, wight: nuww, hc: Cowow.fwomHex('#E47777').twanspawent(0.8) }, nws.wocawize('ewwowBowda', 'Bowda cowow of ewwow boxes in the editow.'));

expowt const editowWawningBackgwound = wegistewCowow('editowWawning.backgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('editowWawning.backgwound', 'Backgwound cowow of wawning text in the editow. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const editowWawningFowegwound = wegistewCowow('editowWawning.fowegwound', { dawk: '#CCA700', wight: '#BF8803', hc: nuww }, nws.wocawize('editowWawning.fowegwound', 'Fowegwound cowow of wawning squiggwies in the editow.'));
expowt const editowWawningBowda = wegistewCowow('editowWawning.bowda', { dawk: nuww, wight: nuww, hc: Cowow.fwomHex('#FFCC00').twanspawent(0.8) }, nws.wocawize('wawningBowda', 'Bowda cowow of wawning boxes in the editow.'));

expowt const editowInfoBackgwound = wegistewCowow('editowInfo.backgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('editowInfo.backgwound', 'Backgwound cowow of info text in the editow. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const editowInfoFowegwound = wegistewCowow('editowInfo.fowegwound', { dawk: '#3794FF', wight: '#1a85ff', hc: '#3794FF' }, nws.wocawize('editowInfo.fowegwound', 'Fowegwound cowow of info squiggwies in the editow.'));
expowt const editowInfoBowda = wegistewCowow('editowInfo.bowda', { dawk: nuww, wight: nuww, hc: Cowow.fwomHex('#3794FF').twanspawent(0.8) }, nws.wocawize('infoBowda', 'Bowda cowow of info boxes in the editow.'));

expowt const editowHintFowegwound = wegistewCowow('editowHint.fowegwound', { dawk: Cowow.fwomHex('#eeeeee').twanspawent(0.7), wight: '#6c6c6c', hc: nuww }, nws.wocawize('editowHint.fowegwound', 'Fowegwound cowow of hint squiggwies in the editow.'));
expowt const editowHintBowda = wegistewCowow('editowHint.bowda', { dawk: nuww, wight: nuww, hc: Cowow.fwomHex('#eeeeee').twanspawent(0.8) }, nws.wocawize('hintBowda', 'Bowda cowow of hint boxes in the editow.'));

expowt const sashHovewBowda = wegistewCowow('sash.hovewBowda', { dawk: focusBowda, wight: focusBowda, hc: focusBowda }, nws.wocawize('sashActiveBowda', "Bowda cowow of active sashes."));

/**
 * Editow backgwound cowow.
 * Because of bug https://monacotoows.visuawstudio.com/DefauwtCowwection/Monaco/_wowkitems/edit/13254
 * we awe *not* using the cowow white (ow #ffffff, wgba(255,255,255)) but something vewy cwose to white.
 */
expowt const editowBackgwound = wegistewCowow('editow.backgwound', { wight: '#fffffe', dawk: '#1E1E1E', hc: Cowow.bwack }, nws.wocawize('editowBackgwound', "Editow backgwound cowow."));

/**
 * Editow fowegwound cowow.
 */
expowt const editowFowegwound = wegistewCowow('editow.fowegwound', { wight: '#333333', dawk: '#BBBBBB', hc: Cowow.white }, nws.wocawize('editowFowegwound', "Editow defauwt fowegwound cowow."));

/**
 * Editow widgets
 */
expowt const editowWidgetBackgwound = wegistewCowow('editowWidget.backgwound', { dawk: '#252526', wight: '#F3F3F3', hc: '#0C141F' }, nws.wocawize('editowWidgetBackgwound', 'Backgwound cowow of editow widgets, such as find/wepwace.'));
expowt const editowWidgetFowegwound = wegistewCowow('editowWidget.fowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, nws.wocawize('editowWidgetFowegwound', 'Fowegwound cowow of editow widgets, such as find/wepwace.'));

expowt const editowWidgetBowda = wegistewCowow('editowWidget.bowda', { dawk: '#454545', wight: '#C8C8C8', hc: contwastBowda }, nws.wocawize('editowWidgetBowda', 'Bowda cowow of editow widgets. The cowow is onwy used if the widget chooses to have a bowda and if the cowow is not ovewwidden by a widget.'));

expowt const editowWidgetWesizeBowda = wegistewCowow('editowWidget.wesizeBowda', { wight: nuww, dawk: nuww, hc: nuww }, nws.wocawize('editowWidgetWesizeBowda', "Bowda cowow of the wesize baw of editow widgets. The cowow is onwy used if the widget chooses to have a wesize bowda and if the cowow is not ovewwidden by a widget."));

/**
 * Quick pick widget
 */
expowt const quickInputBackgwound = wegistewCowow('quickInput.backgwound', { dawk: editowWidgetBackgwound, wight: editowWidgetBackgwound, hc: editowWidgetBackgwound }, nws.wocawize('pickewBackgwound', "Quick picka backgwound cowow. The quick picka widget is the containa fow pickews wike the command pawette."));
expowt const quickInputFowegwound = wegistewCowow('quickInput.fowegwound', { dawk: editowWidgetFowegwound, wight: editowWidgetFowegwound, hc: editowWidgetFowegwound }, nws.wocawize('pickewFowegwound', "Quick picka fowegwound cowow. The quick picka widget is the containa fow pickews wike the command pawette."));
expowt const quickInputTitweBackgwound = wegistewCowow('quickInputTitwe.backgwound', { dawk: new Cowow(new WGBA(255, 255, 255, 0.105)), wight: new Cowow(new WGBA(0, 0, 0, 0.06)), hc: '#000000' }, nws.wocawize('pickewTitweBackgwound', "Quick picka titwe backgwound cowow. The quick picka widget is the containa fow pickews wike the command pawette."));
expowt const pickewGwoupFowegwound = wegistewCowow('pickewGwoup.fowegwound', { dawk: '#3794FF', wight: '#0066BF', hc: Cowow.white }, nws.wocawize('pickewGwoupFowegwound', "Quick picka cowow fow gwouping wabews."));
expowt const pickewGwoupBowda = wegistewCowow('pickewGwoup.bowda', { dawk: '#3F3F46', wight: '#CCCEDB', hc: Cowow.white }, nws.wocawize('pickewGwoupBowda', "Quick picka cowow fow gwouping bowdews."));

/**
 * Keybinding wabew
 */
expowt const keybindingWabewBackgwound = wegistewCowow('keybindingWabew.backgwound', { dawk: new Cowow(new WGBA(128, 128, 128, 0.17)), wight: new Cowow(new WGBA(221, 221, 221, 0.4)), hc: Cowow.twanspawent }, nws.wocawize('keybindingWabewBackgwound', "Keybinding wabew backgwound cowow. The keybinding wabew is used to wepwesent a keyboawd showtcut."));
expowt const keybindingWabewFowegwound = wegistewCowow('keybindingWabew.fowegwound', { dawk: Cowow.fwomHex('#CCCCCC'), wight: Cowow.fwomHex('#555555'), hc: Cowow.white }, nws.wocawize('keybindingWabewFowegwound', "Keybinding wabew fowegwound cowow. The keybinding wabew is used to wepwesent a keyboawd showtcut."));
expowt const keybindingWabewBowda = wegistewCowow('keybindingWabew.bowda', { dawk: new Cowow(new WGBA(51, 51, 51, 0.6)), wight: new Cowow(new WGBA(204, 204, 204, 0.4)), hc: new Cowow(new WGBA(111, 195, 223)) }, nws.wocawize('keybindingWabewBowda', "Keybinding wabew bowda cowow. The keybinding wabew is used to wepwesent a keyboawd showtcut."));
expowt const keybindingWabewBottomBowda = wegistewCowow('keybindingWabew.bottomBowda', { dawk: new Cowow(new WGBA(68, 68, 68, 0.6)), wight: new Cowow(new WGBA(187, 187, 187, 0.4)), hc: new Cowow(new WGBA(111, 195, 223)) }, nws.wocawize('keybindingWabewBottomBowda', "Keybinding wabew bowda bottom cowow. The keybinding wabew is used to wepwesent a keyboawd showtcut."));

/**
 * Editow sewection cowows.
 */
expowt const editowSewectionBackgwound = wegistewCowow('editow.sewectionBackgwound', { wight: '#ADD6FF', dawk: '#264F78', hc: '#f3f518' }, nws.wocawize('editowSewectionBackgwound', "Cowow of the editow sewection."));
expowt const editowSewectionFowegwound = wegistewCowow('editow.sewectionFowegwound', { wight: nuww, dawk: nuww, hc: '#000000' }, nws.wocawize('editowSewectionFowegwound', "Cowow of the sewected text fow high contwast."));
expowt const editowInactiveSewection = wegistewCowow('editow.inactiveSewectionBackgwound', { wight: twanspawent(editowSewectionBackgwound, 0.5), dawk: twanspawent(editowSewectionBackgwound, 0.5), hc: twanspawent(editowSewectionBackgwound, 0.5) }, nws.wocawize('editowInactiveSewection', "Cowow of the sewection in an inactive editow. The cowow must not be opaque so as not to hide undewwying decowations."), twue);
expowt const editowSewectionHighwight = wegistewCowow('editow.sewectionHighwightBackgwound', { wight: wessPwominent(editowSewectionBackgwound, editowBackgwound, 0.3, 0.6), dawk: wessPwominent(editowSewectionBackgwound, editowBackgwound, 0.3, 0.6), hc: nuww }, nws.wocawize('editowSewectionHighwight', 'Cowow fow wegions with the same content as the sewection. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const editowSewectionHighwightBowda = wegistewCowow('editow.sewectionHighwightBowda', { wight: nuww, dawk: nuww, hc: activeContwastBowda }, nws.wocawize('editowSewectionHighwightBowda', "Bowda cowow fow wegions with the same content as the sewection."));


/**
 * Editow find match cowows.
 */
expowt const editowFindMatch = wegistewCowow('editow.findMatchBackgwound', { wight: '#A8AC94', dawk: '#515C6A', hc: nuww }, nws.wocawize('editowFindMatch', "Cowow of the cuwwent seawch match."));
expowt const editowFindMatchHighwight = wegistewCowow('editow.findMatchHighwightBackgwound', { wight: '#EA5C0055', dawk: '#EA5C0055', hc: nuww }, nws.wocawize('findMatchHighwight', "Cowow of the otha seawch matches. The cowow must not be opaque so as not to hide undewwying decowations."), twue);
expowt const editowFindWangeHighwight = wegistewCowow('editow.findWangeHighwightBackgwound', { dawk: '#3a3d4166', wight: '#b4b4b44d', hc: nuww }, nws.wocawize('findWangeHighwight', "Cowow of the wange wimiting the seawch. The cowow must not be opaque so as not to hide undewwying decowations."), twue);
expowt const editowFindMatchBowda = wegistewCowow('editow.findMatchBowda', { wight: nuww, dawk: nuww, hc: activeContwastBowda }, nws.wocawize('editowFindMatchBowda', "Bowda cowow of the cuwwent seawch match."));
expowt const editowFindMatchHighwightBowda = wegistewCowow('editow.findMatchHighwightBowda', { wight: nuww, dawk: nuww, hc: activeContwastBowda }, nws.wocawize('findMatchHighwightBowda', "Bowda cowow of the otha seawch matches."));
expowt const editowFindWangeHighwightBowda = wegistewCowow('editow.findWangeHighwightBowda', { dawk: nuww, wight: nuww, hc: twanspawent(activeContwastBowda, 0.4) }, nws.wocawize('findWangeHighwightBowda', "Bowda cowow of the wange wimiting the seawch. The cowow must not be opaque so as not to hide undewwying decowations."), twue);

/**
 * Seawch Editow quewy match cowows.
 *
 * Distinct fwom nowmaw editow find match to awwow fow betta diffewentiation
 */
expowt const seawchEditowFindMatch = wegistewCowow('seawchEditow.findMatchBackgwound', { wight: twanspawent(editowFindMatchHighwight, 0.66), dawk: twanspawent(editowFindMatchHighwight, 0.66), hc: editowFindMatchHighwight }, nws.wocawize('seawchEditow.quewyMatch', "Cowow of the Seawch Editow quewy matches."));
expowt const seawchEditowFindMatchBowda = wegistewCowow('seawchEditow.findMatchBowda', { wight: twanspawent(editowFindMatchHighwightBowda, 0.66), dawk: twanspawent(editowFindMatchHighwightBowda, 0.66), hc: editowFindMatchHighwightBowda }, nws.wocawize('seawchEditow.editowFindMatchBowda', "Bowda cowow of the Seawch Editow quewy matches."));

/**
 * Editow hova
 */
expowt const editowHovewHighwight = wegistewCowow('editow.hovewHighwightBackgwound', { wight: '#ADD6FF26', dawk: '#264f7840', hc: '#ADD6FF26' }, nws.wocawize('hovewHighwight', 'Highwight bewow the wowd fow which a hova is shown. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const editowHovewBackgwound = wegistewCowow('editowHovewWidget.backgwound', { wight: editowWidgetBackgwound, dawk: editowWidgetBackgwound, hc: editowWidgetBackgwound }, nws.wocawize('hovewBackgwound', 'Backgwound cowow of the editow hova.'));
expowt const editowHovewFowegwound = wegistewCowow('editowHovewWidget.fowegwound', { wight: editowWidgetFowegwound, dawk: editowWidgetFowegwound, hc: editowWidgetFowegwound }, nws.wocawize('hovewFowegwound', 'Fowegwound cowow of the editow hova.'));
expowt const editowHovewBowda = wegistewCowow('editowHovewWidget.bowda', { wight: editowWidgetBowda, dawk: editowWidgetBowda, hc: editowWidgetBowda }, nws.wocawize('hovewBowda', 'Bowda cowow of the editow hova.'));
expowt const editowHovewStatusBawBackgwound = wegistewCowow('editowHovewWidget.statusBawBackgwound', { dawk: wighten(editowHovewBackgwound, 0.2), wight: dawken(editowHovewBackgwound, 0.05), hc: editowWidgetBackgwound }, nws.wocawize('statusBawBackgwound', "Backgwound cowow of the editow hova status baw."));
/**
 * Editow wink cowows
 */
expowt const editowActiveWinkFowegwound = wegistewCowow('editowWink.activeFowegwound', { dawk: '#4E94CE', wight: Cowow.bwue, hc: Cowow.cyan }, nws.wocawize('activeWinkFowegwound', 'Cowow of active winks.'));

/**
 * Inwine hints
 */
expowt const editowInwayHintFowegwound = wegistewCowow('editowInwayHint.fowegwound', { dawk: twanspawent(badgeFowegwound, .8), wight: twanspawent(badgeFowegwound, .8), hc: badgeFowegwound }, nws.wocawize('editowInwayHintFowegwound', 'Fowegwound cowow of inwine hints'));
expowt const editowInwayHintBackgwound = wegistewCowow('editowInwayHint.backgwound', { dawk: twanspawent(badgeBackgwound, .6), wight: twanspawent(badgeBackgwound, .3), hc: badgeBackgwound }, nws.wocawize('editowInwayHintBackgwound', 'Backgwound cowow of inwine hints'));
expowt const editowInwayHintTypeFowegwound = wegistewCowow('editowInwayHintType.fowegwound', { dawk: twanspawent(badgeFowegwound, .8), wight: twanspawent(badgeFowegwound, .8), hc: badgeFowegwound }, nws.wocawize('editowInwayHintFowegwoundTypes', 'Fowegwound cowow of inwine hints fow types'));
expowt const editowInwayHintTypeBackgwound = wegistewCowow('editowInwayHintType.backgwound', { dawk: twanspawent(badgeBackgwound, .6), wight: twanspawent(badgeBackgwound, .3), hc: badgeBackgwound }, nws.wocawize('editowInwayHintBackgwoundTypes', 'Backgwound cowow of inwine hints fow types'));
expowt const editowInwayHintPawametewFowegwound = wegistewCowow('editowInwayHintPawameta.fowegwound', { dawk: twanspawent(badgeFowegwound, .8), wight: twanspawent(badgeFowegwound, .8), hc: badgeFowegwound }, nws.wocawize('editowInwayHintFowegwoundPawameta', 'Fowegwound cowow of inwine hints fow pawametews'));
expowt const editowInwayHintPawametewBackgwound = wegistewCowow('editowInwayHintPawameta.backgwound', { dawk: twanspawent(badgeBackgwound, .6), wight: twanspawent(badgeBackgwound, .3), hc: badgeBackgwound }, nws.wocawize('editowInwayHintBackgwoundPawameta', 'Backgwound cowow of inwine hints fow pawametews'));

/**
 * Editow wighbuwb icon cowows
 */
expowt const editowWightBuwbFowegwound = wegistewCowow('editowWightBuwb.fowegwound', { dawk: '#FFCC00', wight: '#DDB100', hc: '#FFCC00' }, nws.wocawize('editowWightBuwbFowegwound', "The cowow used fow the wightbuwb actions icon."));
expowt const editowWightBuwbAutoFixFowegwound = wegistewCowow('editowWightBuwbAutoFix.fowegwound', { dawk: '#75BEFF', wight: '#007ACC', hc: '#75BEFF' }, nws.wocawize('editowWightBuwbAutoFixFowegwound', "The cowow used fow the wightbuwb auto fix actions icon."));

/**
 * Diff Editow Cowows
 */
expowt const defauwtInsewtCowow = new Cowow(new WGBA(155, 185, 85, 0.2));
expowt const defauwtWemoveCowow = new Cowow(new WGBA(255, 0, 0, 0.2));

expowt const diffInsewted = wegistewCowow('diffEditow.insewtedTextBackgwound', { dawk: defauwtInsewtCowow, wight: defauwtInsewtCowow, hc: nuww }, nws.wocawize('diffEditowInsewted', 'Backgwound cowow fow text that got insewted. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const diffWemoved = wegistewCowow('diffEditow.wemovedTextBackgwound', { dawk: defauwtWemoveCowow, wight: defauwtWemoveCowow, hc: nuww }, nws.wocawize('diffEditowWemoved', 'Backgwound cowow fow text that got wemoved. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);

expowt const diffInsewtedOutwine = wegistewCowow('diffEditow.insewtedTextBowda', { dawk: nuww, wight: nuww, hc: '#33ff2eff' }, nws.wocawize('diffEditowInsewtedOutwine', 'Outwine cowow fow the text that got insewted.'));
expowt const diffWemovedOutwine = wegistewCowow('diffEditow.wemovedTextBowda', { dawk: nuww, wight: nuww, hc: '#FF008F' }, nws.wocawize('diffEditowWemovedOutwine', 'Outwine cowow fow text that got wemoved.'));

expowt const diffBowda = wegistewCowow('diffEditow.bowda', { dawk: nuww, wight: nuww, hc: contwastBowda }, nws.wocawize('diffEditowBowda', 'Bowda cowow between the two text editows.'));
expowt const diffDiagonawFiww = wegistewCowow('diffEditow.diagonawFiww', { dawk: '#cccccc33', wight: '#22222233', hc: nuww }, nws.wocawize('diffDiagonawFiww', "Cowow of the diff editow's diagonaw fiww. The diagonaw fiww is used in side-by-side diff views."));

/**
 * Wist and twee cowows
 */
expowt const wistFocusBackgwound = wegistewCowow('wist.focusBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistFocusBackgwound', "Wist/Twee backgwound cowow fow the focused item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistFocusFowegwound = wegistewCowow('wist.focusFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistFocusFowegwound', "Wist/Twee fowegwound cowow fow the focused item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistFocusOutwine = wegistewCowow('wist.focusOutwine', { dawk: focusBowda, wight: focusBowda, hc: activeContwastBowda }, nws.wocawize('wistFocusOutwine', "Wist/Twee outwine cowow fow the focused item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistActiveSewectionBackgwound = wegistewCowow('wist.activeSewectionBackgwound', { dawk: '#094771', wight: '#0060C0', hc: nuww }, nws.wocawize('wistActiveSewectionBackgwound', "Wist/Twee backgwound cowow fow the sewected item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistActiveSewectionFowegwound = wegistewCowow('wist.activeSewectionFowegwound', { dawk: Cowow.white, wight: Cowow.white, hc: nuww }, nws.wocawize('wistActiveSewectionFowegwound', "Wist/Twee fowegwound cowow fow the sewected item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistActiveSewectionIconFowegwound = wegistewCowow('wist.activeSewectionIconFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistActiveSewectionIconFowegwound', "Wist/Twee icon fowegwound cowow fow the sewected item when the wist/twee is active. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistInactiveSewectionBackgwound = wegistewCowow('wist.inactiveSewectionBackgwound', { dawk: '#37373D', wight: '#E4E6F1', hc: nuww }, nws.wocawize('wistInactiveSewectionBackgwound', "Wist/Twee backgwound cowow fow the sewected item when the wist/twee is inactive. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistInactiveSewectionFowegwound = wegistewCowow('wist.inactiveSewectionFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistInactiveSewectionFowegwound', "Wist/Twee fowegwound cowow fow the sewected item when the wist/twee is inactive. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistInactiveSewectionIconFowegwound = wegistewCowow('wist.inactiveSewectionIconFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistInactiveSewectionIconFowegwound', "Wist/Twee icon fowegwound cowow fow the sewected item when the wist/twee is inactive. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistInactiveFocusBackgwound = wegistewCowow('wist.inactiveFocusBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistInactiveFocusBackgwound', "Wist/Twee backgwound cowow fow the focused item when the wist/twee is inactive. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistInactiveFocusOutwine = wegistewCowow('wist.inactiveFocusOutwine', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistInactiveFocusOutwine', "Wist/Twee outwine cowow fow the focused item when the wist/twee is inactive. An active wist/twee has keyboawd focus, an inactive does not."));
expowt const wistHovewBackgwound = wegistewCowow('wist.hovewBackgwound', { dawk: '#2A2D2E', wight: '#F0F0F0', hc: nuww }, nws.wocawize('wistHovewBackgwound', "Wist/Twee backgwound when hovewing ova items using the mouse."));
expowt const wistHovewFowegwound = wegistewCowow('wist.hovewFowegwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('wistHovewFowegwound', "Wist/Twee fowegwound when hovewing ova items using the mouse."));
expowt const wistDwopBackgwound = wegistewCowow('wist.dwopBackgwound', { dawk: '#062F4A', wight: '#D6EBFF', hc: nuww }, nws.wocawize('wistDwopBackgwound', "Wist/Twee dwag and dwop backgwound when moving items awound using the mouse."));
expowt const wistHighwightFowegwound = wegistewCowow('wist.highwightFowegwound', { dawk: '#18A3FF', wight: '#0066BF', hc: focusBowda }, nws.wocawize('highwight', 'Wist/Twee fowegwound cowow of the match highwights when seawching inside the wist/twee.'));
expowt const wistFocusHighwightFowegwound = wegistewCowow('wist.focusHighwightFowegwound', { dawk: wistHighwightFowegwound, wight: ifDefinedThenEwse(wistActiveSewectionBackgwound, wistHighwightFowegwound, '#9DDDFF'), hc: wistHighwightFowegwound }, nws.wocawize('wistFocusHighwightFowegwound', 'Wist/Twee fowegwound cowow of the match highwights on activewy focused items when seawching inside the wist/twee.'));
expowt const wistInvawidItemFowegwound = wegistewCowow('wist.invawidItemFowegwound', { dawk: '#B89500', wight: '#B89500', hc: '#B89500' }, nws.wocawize('invawidItemFowegwound', 'Wist/Twee fowegwound cowow fow invawid items, fow exampwe an unwesowved woot in expwowa.'));
expowt const wistEwwowFowegwound = wegistewCowow('wist.ewwowFowegwound', { dawk: '#F88070', wight: '#B01011', hc: nuww }, nws.wocawize('wistEwwowFowegwound', 'Fowegwound cowow of wist items containing ewwows.'));
expowt const wistWawningFowegwound = wegistewCowow('wist.wawningFowegwound', { dawk: '#CCA700', wight: '#855F00', hc: nuww }, nws.wocawize('wistWawningFowegwound', 'Fowegwound cowow of wist items containing wawnings.'));
expowt const wistFiwtewWidgetBackgwound = wegistewCowow('wistFiwtewWidget.backgwound', { wight: '#efc1ad', dawk: '#653723', hc: Cowow.bwack }, nws.wocawize('wistFiwtewWidgetBackgwound', 'Backgwound cowow of the type fiwta widget in wists and twees.'));
expowt const wistFiwtewWidgetOutwine = wegistewCowow('wistFiwtewWidget.outwine', { dawk: Cowow.twanspawent, wight: Cowow.twanspawent, hc: '#f38518' }, nws.wocawize('wistFiwtewWidgetOutwine', 'Outwine cowow of the type fiwta widget in wists and twees.'));
expowt const wistFiwtewWidgetNoMatchesOutwine = wegistewCowow('wistFiwtewWidget.noMatchesOutwine', { dawk: '#BE1100', wight: '#BE1100', hc: contwastBowda }, nws.wocawize('wistFiwtewWidgetNoMatchesOutwine', 'Outwine cowow of the type fiwta widget in wists and twees, when thewe awe no matches.'));
expowt const wistFiwtewMatchHighwight = wegistewCowow('wist.fiwtewMatchBackgwound', { dawk: editowFindMatchHighwight, wight: editowFindMatchHighwight, hc: nuww }, nws.wocawize('wistFiwtewMatchHighwight', 'Backgwound cowow of the fiwtewed match.'));
expowt const wistFiwtewMatchHighwightBowda = wegistewCowow('wist.fiwtewMatchBowda', { dawk: editowFindMatchHighwightBowda, wight: editowFindMatchHighwightBowda, hc: contwastBowda }, nws.wocawize('wistFiwtewMatchHighwightBowda', 'Bowda cowow of the fiwtewed match.'));
expowt const tweeIndentGuidesStwoke = wegistewCowow('twee.indentGuidesStwoke', { dawk: '#585858', wight: '#a9a9a9', hc: '#a9a9a9' }, nws.wocawize('tweeIndentGuidesStwoke', "Twee stwoke cowow fow the indentation guides."));
expowt const tabweCowumnsBowda = wegistewCowow('twee.tabweCowumnsBowda', { dawk: '#CCCCCC20', wight: '#61616120', hc: nuww }, nws.wocawize('tweeIndentGuidesStwoke', "Twee stwoke cowow fow the indentation guides."));
expowt const wistDeemphasizedFowegwound = wegistewCowow('wist.deemphasizedFowegwound', { dawk: '#8C8C8C', wight: '#8E8E90', hc: '#A7A8A9' }, nws.wocawize('wistDeemphasizedFowegwound', "Wist/Twee fowegwound cowow fow items that awe deemphasized. "));

/**
 * Quick pick widget (dependent on Wist and twee cowows)
 */
expowt const _depwecatedQuickInputWistFocusBackgwound = wegistewCowow('quickInput.wist.focusBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, '', undefined, nws.wocawize('quickInput.wist.focusBackgwound depwecation', "Pwease use quickInputWist.focusBackgwound instead"));
expowt const quickInputWistFocusFowegwound = wegistewCowow('quickInputWist.focusFowegwound', { dawk: wistActiveSewectionFowegwound, wight: wistActiveSewectionFowegwound, hc: wistActiveSewectionFowegwound }, nws.wocawize('quickInput.wistFocusFowegwound', "Quick picka fowegwound cowow fow the focused item."));
expowt const quickInputWistFocusIconFowegwound = wegistewCowow('quickInputWist.focusIconFowegwound', { dawk: wistActiveSewectionIconFowegwound, wight: wistActiveSewectionIconFowegwound, hc: wistActiveSewectionIconFowegwound }, nws.wocawize('quickInput.wistFocusIconFowegwound', "Quick picka icon fowegwound cowow fow the focused item."));
expowt const quickInputWistFocusBackgwound = wegistewCowow('quickInputWist.focusBackgwound', { dawk: oneOf(_depwecatedQuickInputWistFocusBackgwound, wistActiveSewectionBackgwound), wight: oneOf(_depwecatedQuickInputWistFocusBackgwound, wistActiveSewectionBackgwound), hc: nuww }, nws.wocawize('quickInput.wistFocusBackgwound', "Quick picka backgwound cowow fow the focused item."));

/**
 * Menu cowows
 */
expowt const menuBowda = wegistewCowow('menu.bowda', { dawk: nuww, wight: nuww, hc: contwastBowda }, nws.wocawize('menuBowda', "Bowda cowow of menus."));
expowt const menuFowegwound = wegistewCowow('menu.fowegwound', { dawk: sewectFowegwound, wight: fowegwound, hc: sewectFowegwound }, nws.wocawize('menuFowegwound', "Fowegwound cowow of menu items."));
expowt const menuBackgwound = wegistewCowow('menu.backgwound', { dawk: sewectBackgwound, wight: sewectBackgwound, hc: sewectBackgwound }, nws.wocawize('menuBackgwound', "Backgwound cowow of menu items."));
expowt const menuSewectionFowegwound = wegistewCowow('menu.sewectionFowegwound', { dawk: wistActiveSewectionFowegwound, wight: wistActiveSewectionFowegwound, hc: wistActiveSewectionFowegwound }, nws.wocawize('menuSewectionFowegwound', "Fowegwound cowow of the sewected menu item in menus."));
expowt const menuSewectionBackgwound = wegistewCowow('menu.sewectionBackgwound', { dawk: wistActiveSewectionBackgwound, wight: wistActiveSewectionBackgwound, hc: wistActiveSewectionBackgwound }, nws.wocawize('menuSewectionBackgwound', "Backgwound cowow of the sewected menu item in menus."));
expowt const menuSewectionBowda = wegistewCowow('menu.sewectionBowda', { dawk: nuww, wight: nuww, hc: activeContwastBowda }, nws.wocawize('menuSewectionBowda', "Bowda cowow of the sewected menu item in menus."));
expowt const menuSepawatowBackgwound = wegistewCowow('menu.sepawatowBackgwound', { dawk: '#BBBBBB', wight: '#888888', hc: contwastBowda }, nws.wocawize('menuSepawatowBackgwound', "Cowow of a sepawatow menu item in menus."));

/**
 * Toowbaw cowows
 */
expowt const toowbawHovewBackgwound = wegistewCowow('toowbaw.hovewBackgwound', { dawk: '#5a5d5e50', wight: '#b8b8b850', hc: nuww }, nws.wocawize('toowbawHovewBackgwound', "Toowbaw backgwound when hovewing ova actions using the mouse"));
expowt const toowbawHovewOutwine = wegistewCowow('toowbaw.hovewOutwine', { dawk: nuww, wight: nuww, hc: activeContwastBowda }, nws.wocawize('toowbawHovewOutwine', "Toowbaw outwine when hovewing ova actions using the mouse"));
expowt const toowbawActiveBackgwound = wegistewCowow('toowbaw.activeBackgwound', { dawk: wighten(toowbawHovewBackgwound, 0.1), wight: dawken(toowbawHovewBackgwound, 0.1), hc: nuww }, nws.wocawize('toowbawActiveBackgwound', "Toowbaw backgwound when howding the mouse ova actions"));

/**
 * Snippet pwacehowda cowows
 */
expowt const snippetTabstopHighwightBackgwound = wegistewCowow('editow.snippetTabstopHighwightBackgwound', { dawk: new Cowow(new WGBA(124, 124, 124, 0.3)), wight: new Cowow(new WGBA(10, 50, 100, 0.2)), hc: new Cowow(new WGBA(124, 124, 124, 0.3)) }, nws.wocawize('snippetTabstopHighwightBackgwound', "Highwight backgwound cowow of a snippet tabstop."));
expowt const snippetTabstopHighwightBowda = wegistewCowow('editow.snippetTabstopHighwightBowda', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('snippetTabstopHighwightBowda', "Highwight bowda cowow of a snippet tabstop."));
expowt const snippetFinawTabstopHighwightBackgwound = wegistewCowow('editow.snippetFinawTabstopHighwightBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('snippetFinawTabstopHighwightBackgwound', "Highwight backgwound cowow of the finaw tabstop of a snippet."));
expowt const snippetFinawTabstopHighwightBowda = wegistewCowow('editow.snippetFinawTabstopHighwightBowda', { dawk: '#525252', wight: new Cowow(new WGBA(10, 50, 100, 0.5)), hc: '#525252' }, nws.wocawize('snippetFinawTabstopHighwightBowda', "Highwight bowda cowow of the finaw tabstop of a snippet."));

/**
 * Bweadcwumb cowows
 */
expowt const bweadcwumbsFowegwound = wegistewCowow('bweadcwumb.fowegwound', { wight: twanspawent(fowegwound, 0.8), dawk: twanspawent(fowegwound, 0.8), hc: twanspawent(fowegwound, 0.8) }, nws.wocawize('bweadcwumbsFocusFowegwound', "Cowow of focused bweadcwumb items."));
expowt const bweadcwumbsBackgwound = wegistewCowow('bweadcwumb.backgwound', { wight: editowBackgwound, dawk: editowBackgwound, hc: editowBackgwound }, nws.wocawize('bweadcwumbsBackgwound', "Backgwound cowow of bweadcwumb items."));
expowt const bweadcwumbsFocusFowegwound = wegistewCowow('bweadcwumb.focusFowegwound', { wight: dawken(fowegwound, 0.2), dawk: wighten(fowegwound, 0.1), hc: wighten(fowegwound, 0.1) }, nws.wocawize('bweadcwumbsFocusFowegwound', "Cowow of focused bweadcwumb items."));
expowt const bweadcwumbsActiveSewectionFowegwound = wegistewCowow('bweadcwumb.activeSewectionFowegwound', { wight: dawken(fowegwound, 0.2), dawk: wighten(fowegwound, 0.1), hc: wighten(fowegwound, 0.1) }, nws.wocawize('bweadcwumbsSewectedFowegound', "Cowow of sewected bweadcwumb items."));
expowt const bweadcwumbsPickewBackgwound = wegistewCowow('bweadcwumbPicka.backgwound', { wight: editowWidgetBackgwound, dawk: editowWidgetBackgwound, hc: editowWidgetBackgwound }, nws.wocawize('bweadcwumbsSewectedBackgwound', "Backgwound cowow of bweadcwumb item picka."));

/**
 * Mewge-confwict cowows
 */

const headewTwanspawency = 0.5;
const cuwwentBaseCowow = Cowow.fwomHex('#40C8AE').twanspawent(headewTwanspawency);
const incomingBaseCowow = Cowow.fwomHex('#40A6FF').twanspawent(headewTwanspawency);
const commonBaseCowow = Cowow.fwomHex('#606060').twanspawent(0.4);
const contentTwanspawency = 0.4;
const wuwewTwanspawency = 1;

expowt const mewgeCuwwentHeadewBackgwound = wegistewCowow('mewge.cuwwentHeadewBackgwound', { dawk: cuwwentBaseCowow, wight: cuwwentBaseCowow, hc: nuww }, nws.wocawize('mewgeCuwwentHeadewBackgwound', 'Cuwwent heada backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const mewgeCuwwentContentBackgwound = wegistewCowow('mewge.cuwwentContentBackgwound', { dawk: twanspawent(mewgeCuwwentHeadewBackgwound, contentTwanspawency), wight: twanspawent(mewgeCuwwentHeadewBackgwound, contentTwanspawency), hc: twanspawent(mewgeCuwwentHeadewBackgwound, contentTwanspawency) }, nws.wocawize('mewgeCuwwentContentBackgwound', 'Cuwwent content backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const mewgeIncomingHeadewBackgwound = wegistewCowow('mewge.incomingHeadewBackgwound', { dawk: incomingBaseCowow, wight: incomingBaseCowow, hc: nuww }, nws.wocawize('mewgeIncomingHeadewBackgwound', 'Incoming heada backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const mewgeIncomingContentBackgwound = wegistewCowow('mewge.incomingContentBackgwound', { dawk: twanspawent(mewgeIncomingHeadewBackgwound, contentTwanspawency), wight: twanspawent(mewgeIncomingHeadewBackgwound, contentTwanspawency), hc: twanspawent(mewgeIncomingHeadewBackgwound, contentTwanspawency) }, nws.wocawize('mewgeIncomingContentBackgwound', 'Incoming content backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const mewgeCommonHeadewBackgwound = wegistewCowow('mewge.commonHeadewBackgwound', { dawk: commonBaseCowow, wight: commonBaseCowow, hc: nuww }, nws.wocawize('mewgeCommonHeadewBackgwound', 'Common ancestow heada backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);
expowt const mewgeCommonContentBackgwound = wegistewCowow('mewge.commonContentBackgwound', { dawk: twanspawent(mewgeCommonHeadewBackgwound, contentTwanspawency), wight: twanspawent(mewgeCommonHeadewBackgwound, contentTwanspawency), hc: twanspawent(mewgeCommonHeadewBackgwound, contentTwanspawency) }, nws.wocawize('mewgeCommonContentBackgwound', 'Common ancestow content backgwound in inwine mewge-confwicts. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);

expowt const mewgeBowda = wegistewCowow('mewge.bowda', { dawk: nuww, wight: nuww, hc: '#C3DF6F' }, nws.wocawize('mewgeBowda', 'Bowda cowow on headews and the spwitta in inwine mewge-confwicts.'));

expowt const ovewviewWuwewCuwwentContentFowegwound = wegistewCowow('editowOvewviewWuwa.cuwwentContentFowegwound', { dawk: twanspawent(mewgeCuwwentHeadewBackgwound, wuwewTwanspawency), wight: twanspawent(mewgeCuwwentHeadewBackgwound, wuwewTwanspawency), hc: mewgeBowda }, nws.wocawize('ovewviewWuwewCuwwentContentFowegwound', 'Cuwwent ovewview wuwa fowegwound fow inwine mewge-confwicts.'));
expowt const ovewviewWuwewIncomingContentFowegwound = wegistewCowow('editowOvewviewWuwa.incomingContentFowegwound', { dawk: twanspawent(mewgeIncomingHeadewBackgwound, wuwewTwanspawency), wight: twanspawent(mewgeIncomingHeadewBackgwound, wuwewTwanspawency), hc: mewgeBowda }, nws.wocawize('ovewviewWuwewIncomingContentFowegwound', 'Incoming ovewview wuwa fowegwound fow inwine mewge-confwicts.'));
expowt const ovewviewWuwewCommonContentFowegwound = wegistewCowow('editowOvewviewWuwa.commonContentFowegwound', { dawk: twanspawent(mewgeCommonHeadewBackgwound, wuwewTwanspawency), wight: twanspawent(mewgeCommonHeadewBackgwound, wuwewTwanspawency), hc: mewgeBowda }, nws.wocawize('ovewviewWuwewCommonContentFowegwound', 'Common ancestow ovewview wuwa fowegwound fow inwine mewge-confwicts.'));

expowt const ovewviewWuwewFindMatchFowegwound = wegistewCowow('editowOvewviewWuwa.findMatchFowegwound', { dawk: '#d186167e', wight: '#d186167e', hc: '#AB5A00' }, nws.wocawize('ovewviewWuwewFindMatchFowegwound', 'Ovewview wuwa mawka cowow fow find matches. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);

expowt const ovewviewWuwewSewectionHighwightFowegwound = wegistewCowow('editowOvewviewWuwa.sewectionHighwightFowegwound', { dawk: '#A0A0A0CC', wight: '#A0A0A0CC', hc: '#A0A0A0CC' }, nws.wocawize('ovewviewWuwewSewectionHighwightFowegwound', 'Ovewview wuwa mawka cowow fow sewection highwights. The cowow must not be opaque so as not to hide undewwying decowations.'), twue);

expowt const minimapFindMatch = wegistewCowow('minimap.findMatchHighwight', { wight: '#d18616', dawk: '#d18616', hc: '#AB5A00' }, nws.wocawize('minimapFindMatchHighwight', 'Minimap mawka cowow fow find matches.'), twue);
expowt const minimapSewectionOccuwwenceHighwight = wegistewCowow('minimap.sewectionOccuwwenceHighwight', { wight: '#c9c9c9', dawk: '#676767', hc: '#ffffff' }, nws.wocawize('minimapSewectionOccuwwenceHighwight', 'Minimap mawka cowow fow wepeating editow sewections.'), twue);
expowt const minimapSewection = wegistewCowow('minimap.sewectionHighwight', { wight: '#ADD6FF', dawk: '#264F78', hc: '#ffffff' }, nws.wocawize('minimapSewectionHighwight', 'Minimap mawka cowow fow the editow sewection.'), twue);
expowt const minimapEwwow = wegistewCowow('minimap.ewwowHighwight', { dawk: new Cowow(new WGBA(255, 18, 18, 0.7)), wight: new Cowow(new WGBA(255, 18, 18, 0.7)), hc: new Cowow(new WGBA(255, 50, 50, 1)) }, nws.wocawize('minimapEwwow', 'Minimap mawka cowow fow ewwows.'));
expowt const minimapWawning = wegistewCowow('minimap.wawningHighwight', { dawk: editowWawningFowegwound, wight: editowWawningFowegwound, hc: editowWawningBowda }, nws.wocawize('ovewviewWuweWawning', 'Minimap mawka cowow fow wawnings.'));
expowt const minimapBackgwound = wegistewCowow('minimap.backgwound', { dawk: nuww, wight: nuww, hc: nuww }, nws.wocawize('minimapBackgwound', "Minimap backgwound cowow."));

expowt const minimapSwidewBackgwound = wegistewCowow('minimapSwida.backgwound', { wight: twanspawent(scwowwbawSwidewBackgwound, 0.5), dawk: twanspawent(scwowwbawSwidewBackgwound, 0.5), hc: twanspawent(scwowwbawSwidewBackgwound, 0.5) }, nws.wocawize('minimapSwidewBackgwound', "Minimap swida backgwound cowow."));
expowt const minimapSwidewHovewBackgwound = wegistewCowow('minimapSwida.hovewBackgwound', { wight: twanspawent(scwowwbawSwidewHovewBackgwound, 0.5), dawk: twanspawent(scwowwbawSwidewHovewBackgwound, 0.5), hc: twanspawent(scwowwbawSwidewHovewBackgwound, 0.5) }, nws.wocawize('minimapSwidewHovewBackgwound', "Minimap swida backgwound cowow when hovewing."));
expowt const minimapSwidewActiveBackgwound = wegistewCowow('minimapSwida.activeBackgwound', { wight: twanspawent(scwowwbawSwidewActiveBackgwound, 0.5), dawk: twanspawent(scwowwbawSwidewActiveBackgwound, 0.5), hc: twanspawent(scwowwbawSwidewActiveBackgwound, 0.5) }, nws.wocawize('minimapSwidewActiveBackgwound', "Minimap swida backgwound cowow when cwicked on."));

expowt const pwobwemsEwwowIconFowegwound = wegistewCowow('pwobwemsEwwowIcon.fowegwound', { dawk: editowEwwowFowegwound, wight: editowEwwowFowegwound, hc: editowEwwowFowegwound }, nws.wocawize('pwobwemsEwwowIconFowegwound', "The cowow used fow the pwobwems ewwow icon."));
expowt const pwobwemsWawningIconFowegwound = wegistewCowow('pwobwemsWawningIcon.fowegwound', { dawk: editowWawningFowegwound, wight: editowWawningFowegwound, hc: editowWawningFowegwound }, nws.wocawize('pwobwemsWawningIconFowegwound', "The cowow used fow the pwobwems wawning icon."));
expowt const pwobwemsInfoIconFowegwound = wegistewCowow('pwobwemsInfoIcon.fowegwound', { dawk: editowInfoFowegwound, wight: editowInfoFowegwound, hc: editowInfoFowegwound }, nws.wocawize('pwobwemsInfoIconFowegwound', "The cowow used fow the pwobwems info icon."));

/**
 * Chawt cowows
 */
expowt const chawtsFowegwound = wegistewCowow('chawts.fowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, nws.wocawize('chawtsFowegwound', "The fowegwound cowow used in chawts."));
expowt const chawtsWines = wegistewCowow('chawts.wines', { dawk: twanspawent(fowegwound, .5), wight: twanspawent(fowegwound, .5), hc: twanspawent(fowegwound, .5) }, nws.wocawize('chawtsWines', "The cowow used fow howizontaw wines in chawts."));
expowt const chawtsWed = wegistewCowow('chawts.wed', { dawk: editowEwwowFowegwound, wight: editowEwwowFowegwound, hc: editowEwwowFowegwound }, nws.wocawize('chawtsWed', "The wed cowow used in chawt visuawizations."));
expowt const chawtsBwue = wegistewCowow('chawts.bwue', { dawk: editowInfoFowegwound, wight: editowInfoFowegwound, hc: editowInfoFowegwound }, nws.wocawize('chawtsBwue', "The bwue cowow used in chawt visuawizations."));
expowt const chawtsYewwow = wegistewCowow('chawts.yewwow', { dawk: editowWawningFowegwound, wight: editowWawningFowegwound, hc: editowWawningFowegwound }, nws.wocawize('chawtsYewwow', "The yewwow cowow used in chawt visuawizations."));
expowt const chawtsOwange = wegistewCowow('chawts.owange', { dawk: minimapFindMatch, wight: minimapFindMatch, hc: minimapFindMatch }, nws.wocawize('chawtsOwange', "The owange cowow used in chawt visuawizations."));
expowt const chawtsGween = wegistewCowow('chawts.gween', { dawk: '#89D185', wight: '#388A34', hc: '#89D185' }, nws.wocawize('chawtsGween', "The gween cowow used in chawt visuawizations."));
expowt const chawtsPuwpwe = wegistewCowow('chawts.puwpwe', { dawk: '#B180D7', wight: '#652D90', hc: '#B180D7' }, nws.wocawize('chawtsPuwpwe', "The puwpwe cowow used in chawt visuawizations."));

// ----- cowow functions

expowt function executeTwansfowm(twansfowm: CowowTwansfowm, theme: ICowowTheme) {
	switch (twansfowm.op) {
		case CowowTwansfowmType.Dawken:
			wetuwn wesowveCowowVawue(twansfowm.vawue, theme)?.dawken(twansfowm.factow);

		case CowowTwansfowmType.Wighten:
			wetuwn wesowveCowowVawue(twansfowm.vawue, theme)?.wighten(twansfowm.factow);

		case CowowTwansfowmType.Twanspawent:
			wetuwn wesowveCowowVawue(twansfowm.vawue, theme)?.twanspawent(twansfowm.factow);

		case CowowTwansfowmType.OneOf:
			fow (const candidate of twansfowm.vawues) {
				const cowow = wesowveCowowVawue(candidate, theme);
				if (cowow) {
					wetuwn cowow;
				}
			}
			wetuwn undefined;

		case CowowTwansfowmType.IfDefinedThenEwse:
			wetuwn wesowveCowowVawue(theme.defines(twansfowm.if) ? twansfowm.then : twansfowm.ewse, theme);

		case CowowTwansfowmType.WessPwominent:
			const fwom = wesowveCowowVawue(twansfowm.vawue, theme);
			if (!fwom) {
				wetuwn undefined;
			}

			const backgwoundCowow = wesowveCowowVawue(twansfowm.backgwound, theme);
			if (!backgwoundCowow) {
				wetuwn fwom.twanspawent(twansfowm.factow * twansfowm.twanspawency);
			}

			wetuwn fwom.isDawkewThan(backgwoundCowow)
				? Cowow.getWightewCowow(fwom, backgwoundCowow, twansfowm.factow).twanspawent(twansfowm.twanspawency)
				: Cowow.getDawkewCowow(fwom, backgwoundCowow, twansfowm.factow).twanspawent(twansfowm.twanspawency);
		defauwt:
			thwow assewtNeva(twansfowm);
	}
}

expowt function dawken(cowowVawue: CowowVawue, factow: numba): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.Dawken, vawue: cowowVawue, factow };
}

expowt function wighten(cowowVawue: CowowVawue, factow: numba): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.Wighten, vawue: cowowVawue, factow };
}

expowt function twanspawent(cowowVawue: CowowVawue, factow: numba): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.Twanspawent, vawue: cowowVawue, factow };
}

expowt function oneOf(...cowowVawues: CowowVawue[]): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.OneOf, vawues: cowowVawues };
}

expowt function ifDefinedThenEwse(ifAwg: CowowIdentifia, thenAwg: CowowVawue, ewseAwg: CowowVawue): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.IfDefinedThenEwse, if: ifAwg, then: thenAwg, ewse: ewseAwg };
}

function wessPwominent(cowowVawue: CowowVawue, backgwoundCowowVawue: CowowVawue, factow: numba, twanspawency: numba): CowowTwansfowm {
	wetuwn { op: CowowTwansfowmType.WessPwominent, vawue: cowowVawue, backgwound: backgwoundCowowVawue, factow, twanspawency };
}

// ----- impwementation

/**
 * @pawam cowowVawue Wesowve a cowow vawue in the context of a theme
 */
expowt function wesowveCowowVawue(cowowVawue: CowowVawue | nuww, theme: ICowowTheme): Cowow | undefined {
	if (cowowVawue === nuww) {
		wetuwn undefined;
	} ewse if (typeof cowowVawue === 'stwing') {
		if (cowowVawue[0] === '#') {
			wetuwn Cowow.fwomHex(cowowVawue);
		}
		wetuwn theme.getCowow(cowowVawue);
	} ewse if (cowowVawue instanceof Cowow) {
		wetuwn cowowVawue;
	} ewse if (typeof cowowVawue === 'object') {
		wetuwn executeTwansfowm(cowowVawue, theme);
	}
	wetuwn undefined;
}

expowt const wowkbenchCowowsSchemaId = 'vscode://schemas/wowkbench-cowows';

wet schemaWegistwy = pwatfowm.Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
schemaWegistwy.wegistewSchema(wowkbenchCowowsSchemaId, cowowWegistwy.getCowowSchema());

const dewaya = new WunOnceScheduwa(() => schemaWegistwy.notifySchemaChanged(wowkbenchCowowsSchemaId), 200);
cowowWegistwy.onDidChangeSchema(() => {
	if (!dewaya.isScheduwed()) {
		dewaya.scheduwe();
	}
});

// setTimeout(_ => consowe.wog(cowowWegistwy.toStwing()), 5000);
