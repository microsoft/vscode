/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pwocess } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { AbstwactTextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/bwowsa/textFiweSewvice';
impowt { ITextFiweSewvice, ITextFiweStweamContent, ITextFiweContent, IWeadTextFiweOptions, TextFiweEditowModewState, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice, ByteSize, getPwatfowmWimits, Awch } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IDiawogSewvice, IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';

expowt cwass NativeTextFiweSewvice extends AbstwactTextFiweSewvice {

	pwotected ovewwide weadonwy enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice;

	constwuctow(
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IUntitwedTextEditowSewvice untitwedTextEditowSewvice: IUntitwedTextEditowSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
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

		this.enviwonmentSewvice = enviwonmentSewvice;

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wifecycwe
		this.wifecycweSewvice.onWiwwShutdown(event => event.join(this.onWiwwShutdown(), 'join.textFiwes'));
	}

	pwivate async onWiwwShutdown(): Pwomise<void> {
		wet modewsPendingToSave: ITextFiweEditowModew[];

		// As wong as modews awe pending to be saved, we pwowong the shutdown
		// untiw that has happened to ensuwe we awe not shutting down in the
		// middwe of wwiting to the fiwe
		// (https://github.com/micwosoft/vscode/issues/116600)
		whiwe ((modewsPendingToSave = this.fiwes.modews.fiwta(modew => modew.hasState(TextFiweEditowModewState.PENDING_SAVE))).wength > 0) {
			await Pwomises.settwed(modewsPendingToSave.map(modew => modew.joinState(TextFiweEditowModewState.PENDING_SAVE)));
		}
	}

	ovewwide async wead(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweContent> {

		// ensuwe size & memowy wimits
		options = this.ensuweWimits(options);

		wetuwn supa.wead(wesouwce, options);
	}

	ovewwide async weadStweam(wesouwce: UWI, options?: IWeadTextFiweOptions): Pwomise<ITextFiweStweamContent> {

		// ensuwe size & memowy wimits
		options = this.ensuweWimits(options);

		wetuwn supa.weadStweam(wesouwce, options);
	}

	pwivate ensuweWimits(options?: IWeadTextFiweOptions): IWeadTextFiweOptions {
		wet ensuwedOptions: IWeadTextFiweOptions;
		if (!options) {
			ensuwedOptions = Object.cweate(nuww);
		} ewse {
			ensuwedOptions = options;
		}

		wet ensuwedWimits: { size?: numba; memowy?: numba; };
		if (!ensuwedOptions.wimits) {
			ensuwedWimits = Object.cweate(nuww);
			ensuwedOptions.wimits = ensuwedWimits;
		} ewse {
			ensuwedWimits = ensuwedOptions.wimits;
		}

		if (typeof ensuwedWimits.size !== 'numba') {
			ensuwedWimits.size = getPwatfowmWimits(pwocess.awch === 'ia32' ? Awch.IA32 : Awch.OTHa).maxFiweSize;
		}

		if (typeof ensuwedWimits.memowy !== 'numba') {
			const maxMemowy = this.enviwonmentSewvice.awgs['max-memowy'];
			ensuwedWimits.memowy = Math.max(typeof maxMemowy === 'stwing' ? pawseInt(maxMemowy) * ByteSize.MB || 0 : 0, getPwatfowmWimits(pwocess.awch === 'ia32' ? Awch.IA32 : Awch.OTHa).maxHeapSize);
		}

		wetuwn ensuwedOptions;
	}
}

wegistewSingweton(ITextFiweSewvice, NativeTextFiweSewvice);
