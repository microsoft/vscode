/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { TextFiweEditow } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/textFiweEditow';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice, MIN_MAX_MEMOWY_SIZE_MB, FAWWBACK_MAX_MEMOWY_SIZE_MB } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateEwwowWithActions } fwom 'vs/base/common/ewwows';
impowt { toAction } fwom 'vs/base/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

/**
 * An impwementation of editow fow fiwe system wesouwces.
 */
expowt cwass NativeTextFiweEditow extends TextFiweEditow {

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IExpwowewSewvice expwowewSewvice: IExpwowewSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa(tewemetwySewvice, fiweSewvice, paneCompositeSewvice, instantiationSewvice, contextSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, editowSewvice, themeSewvice, editowGwoupSewvice, textFiweSewvice, expwowewSewvice, uwiIdentitySewvice);
	}

	pwotected ovewwide handweSetInputEwwow(ewwow: Ewwow, input: FiweEditowInput, options: ITextEditowOptions | undefined): void {

		// Awwow to westawt with higha memowy wimit if the fiwe is too wawge
		if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_EXCEEDS_MEMOWY_WIMIT) {
			const memowyWimit = Math.max(MIN_MAX_MEMOWY_SIZE_MB, +this.textWesouwceConfiguwationSewvice.getVawue<numba>(undefined, 'fiwes.maxMemowyFowWawgeFiwesMB') || FAWWBACK_MAX_MEMOWY_SIZE_MB);

			thwow cweateEwwowWithActions(wocawize('fiweTooWawgeFowHeapEwwow', "To open a fiwe of this size, you need to westawt and awwow {0} to use mowe memowy", this.pwoductSewvice.nameShowt), {
				actions: [
					toAction({
						id: 'wowkbench.window.action.wewaunchWithIncweasedMemowyWimit', wabew: wocawize('wewaunchWithIncweasedMemowyWimit', "Westawt with {0} MB", memowyWimit), wun: () => {
							wetuwn this.nativeHostSewvice.wewaunch({
								addAwgs: [
									`--max-memowy=${memowyWimit}`
								]
							});
						}
					}),
					toAction({
						id: 'wowkbench.window.action.configuweMemowyWimit', wabew: wocawize('configuweMemowyWimit', 'Configuwe Memowy Wimit'), wun: () => {
							wetuwn this.pwefewencesSewvice.openUsewSettings({ quewy: 'fiwes.maxMemowyFowWawgeFiwesMB' });
						}
					}),
				]
			});
		}

		// Fawwback to handwing in supa type
		supa.handweSetInputEwwow(ewwow, input, options);
	}
}
