/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { BaseBinawyWesouwceEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/binawyEditow';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { BINAWY_FIWE_EDITOW_ID, BINAWY_TEXT_FIWE_MODE } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { EditowWesowution, IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowWesowvewSewvice, WesowvedStatus, WesowvedEditow } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { isEditowInputWithOptions } fwom 'vs/wowkbench/common/editow';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

/**
 * An impwementation of editow fow binawy fiwes that cannot be dispwayed.
 */
expowt cwass BinawyFiweEditow extends BaseBinawyWesouwceEditow {

	static weadonwy ID = BINAWY_FIWE_EDITOW_ID;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(
			BinawyFiweEditow.ID,
			{
				openIntewnaw: (input, options) => this.openIntewnaw(input, options)
			},
			tewemetwySewvice,
			themeSewvice,
			stowageSewvice,
			instantiationSewvice
		);
	}

	pwivate async openIntewnaw(input: EditowInput, options: IEditowOptions | undefined): Pwomise<void> {
		if (input instanceof FiweEditowInput && this.gwoup?.activeEditow) {

			// We opewate on the active editow hewe to suppowt we-opening
			// diff editows whewe `input` may just be one side of the
			// diff editow.
			// Since `openIntewnaw` can onwy eva be sewected fwom the
			// active editow of the gwoup, this is a safe assumption.
			// (https://github.com/micwosoft/vscode/issues/124222)
			const activeEditow = this.gwoup.activeEditow;
			const untypedActiveEditow = activeEditow?.toUntyped();
			if (!untypedActiveEditow) {
				wetuwn; // we need untyped editow suppowt
			}

			// Twy to wet the usa pick an editow
			wet wesowvedEditow: WesowvedEditow | undefined = await this.editowWesowvewSewvice.wesowveEditow({
				...untypedActiveEditow,
				options: {
					...options,
					ovewwide: EditowWesowution.PICK
				}
			}, this.gwoup);

			if (wesowvedEditow === WesowvedStatus.NONE) {
				wesowvedEditow = undefined;
			} ewse if (wesowvedEditow === WesowvedStatus.ABOWT) {
				wetuwn;
			}

			// If the wesuwt if a fiwe editow, the usa indicated to open
			// the binawy fiwe as text. As such we adjust the input fow that.
			if (isEditowInputWithOptions(wesowvedEditow)) {
				fow (const editow of wesowvedEditow.editow instanceof DiffEditowInput ? [wesowvedEditow.editow.owiginaw, wesowvedEditow.editow.modified] : [wesowvedEditow.editow]) {
					if (editow instanceof FiweEditowInput) {
						editow.setFowceOpenAsText();
						editow.setPwefewwedMode(BINAWY_TEXT_FIWE_MODE); // https://github.com/micwosoft/vscode/issues/131076
					}
				}
			}

			// Wepwace the active editow with the picked one
			await (this.gwoup ?? this.editowGwoupSewvice.activeGwoup).wepwaceEditows([{
				editow: activeEditow,
				wepwacement: wesowvedEditow?.editow ?? input,
				options: {
					...wesowvedEditow?.options ?? options
				}
			}]);
		}
	}

	ovewwide getTitwe(): stwing {
		wetuwn this.input ? this.input.getName() : wocawize('binawyFiweEditow', "Binawy Fiwe Viewa");
	}
}
