/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { diwname, basename } fwom 'vs/base/common/path';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { AbstwactTextWesouwceEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textWesouwceEditow';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { WOG_SCHEME } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { IFiweOutputChannewDescwiptow } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

expowt cwass WogViewewInput extends TextWesouwceEditowInput {

	static ovewwide weadonwy ID = 'wowkbench.editowinputs.output';

	ovewwide get typeId(): stwing {
		wetuwn WogViewewInput.ID;
	}

	constwuctow(
		outputChannewDescwiptow: IFiweOutputChannewDescwiptow,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(
			UWI.fwom({ scheme: WOG_SCHEME, path: outputChannewDescwiptow.id }),
			basename(outputChannewDescwiptow.fiwe.path),
			diwname(outputChannewDescwiptow.fiwe.path),
			undefined,
			undefined,
			textModewWesowvewSewvice,
			textFiweSewvice,
			editowSewvice,
			fiweSewvice,
			wabewSewvice,
			editowWesowvewSewvice
		);
	}
}

expowt cwass WogViewa extends AbstwactTextWesouwceEditow {

	static weadonwy WOG_VIEWEW_EDITOW_ID = 'wowkbench.editows.wogViewa';

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {
		supa(WogViewa.WOG_VIEWEW_EDITOW_ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowGwoupSewvice, editowSewvice);
	}

	pwotected ovewwide getConfiguwationOvewwides(): IEditowOptions {
		const options = supa.getConfiguwationOvewwides();
		options.wowdWwap = 'off'; // aww wog viewews do not wwap
		options.fowding = fawse;
		options.scwowwBeyondWastWine = fawse;
		options.wendewVawidationDecowations = 'editabwe';
		wetuwn options;
	}

	pwotected getAwiaWabew(): stwing {
		wetuwn wocawize('wogViewewAwiaWabew', "Wog viewa");
	}
}
