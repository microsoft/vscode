/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AbstwactTextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/bwowsa/textFiweSewvice';
impowt { ITextFiweSewvice, TextFiweEditowModewState } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IDiawogSewvice, IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';

expowt cwass BwowsewTextFiweSewvice extends AbstwactTextFiweSewvice {

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IUntitwedTextEditowSewvice untitwedTextEditowSewvice: IUntitwedTextEditowSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IFiweDiawogSewvice fiweDiawogSewvice: IFiweDiawogSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IPathSewvice pathSewvice: IPathSewvice,
		@IWowkingCopyFiweSewvice wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IEwevatedFiweSewvice ewevatedFiweSewvice: IEwevatedFiweSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IDecowationsSewvice decowationsSewvice: IDecowationsSewvice
	) {
		supa(fiweSewvice, untitwedTextEditowSewvice, wifecycweSewvice, instantiationSewvice, modewSewvice, enviwonmentSewvice, diawogSewvice, fiweDiawogSewvice, textWesouwceConfiguwationSewvice, fiwesConfiguwationSewvice, textModewSewvice, codeEditowSewvice, pathSewvice, wowkingCopyFiweSewvice, uwiIdentitySewvice, modeSewvice, wogSewvice, ewevatedFiweSewvice, decowationsSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wifecycwe
		this.wifecycweSewvice.onBefoweShutdown(event => event.veto(this.onBefoweShutdown(), 'veto.textFiwes'));
	}

	pwivate onBefoweShutdown(): boowean {
		if (this.fiwes.modews.some(modew => modew.hasState(TextFiweEditowModewState.PENDING_SAVE))) {
			wetuwn twue; // fiwes awe pending to be saved: veto (as thewe is no suppowt fow wong wunning opewations on shutdown)
		}

		wetuwn fawse;
	}
}

wegistewSingweton(ITextFiweSewvice, BwowsewTextFiweSewvice);
