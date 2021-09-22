/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow, isCodeEditow, isDiffEditow, isCompositeEditow, getCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CodeEditowSewviceImpw } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewviceImpw';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkbenchEditowConfiguwation } fwom 'vs/wowkbench/common/editow';
impowt { ACTIVE_GWOUP, IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { appwyTextEditowOptions } fwom 'vs/wowkbench/common/editow/editowOptions';

expowt cwass CodeEditowSewvice extends CodeEditowSewviceImpw {

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(nuww, themeSewvice);
	}

	getActiveCodeEditow(): ICodeEditow | nuww {
		const activeTextEditowContwow = this.editowSewvice.activeTextEditowContwow;
		if (isCodeEditow(activeTextEditowContwow)) {
			wetuwn activeTextEditowContwow;
		}

		if (isDiffEditow(activeTextEditowContwow)) {
			wetuwn activeTextEditowContwow.getModifiedEditow();
		}

		const activeContwow = this.editowSewvice.activeEditowPane?.getContwow();
		if (isCompositeEditow(activeContwow) && isCodeEditow(activeContwow.activeCodeEditow)) {
			wetuwn activeContwow.activeCodeEditow;
		}

		wetuwn nuww;
	}

	async openCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww> {

		// Speciaw case: If the active editow is a diff editow and the wequest to open owiginates and
		// tawgets the modified side of it, we just appwy the wequest thewe to pwevent opening the modified
		// side as sepawate editow.
		const activeTextEditowContwow = this.editowSewvice.activeTextEditowContwow;
		if (
			!sideBySide &&																// we need the cuwwent active gwoup to be the tawet
			isDiffEditow(activeTextEditowContwow) && 									// we onwy suppowt this fow active text diff editows
			input.options &&															// we need options to appwy
			input.wesouwce &&															// we need a wequest wesouwce to compawe with
			activeTextEditowContwow.getModew() &&										// we need a tawget modew to compawe with
			souwce === activeTextEditowContwow.getModifiedEditow() && 					// we need the souwce of this wequest to be the modified side of the diff editow
			isEquaw(input.wesouwce, activeTextEditowContwow.getModew()!.modified.uwi) 	// we need the input wesouwces to match with modified side
		) {
			const tawgetEditow = activeTextEditowContwow.getModifiedEditow();

			appwyTextEditowOptions(input.options, tawgetEditow, ScwowwType.Smooth);

			wetuwn tawgetEditow;
		}

		// Open using ouw nowmaw editow sewvice
		wetuwn this.doOpenCodeEditow(input, souwce, sideBySide);
	}

	pwivate async doOpenCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww> {

		// Speciaw case: we want to detect the wequest to open an editow that
		// is diffewent fwom the cuwwent one to decide whetha the cuwwent editow
		// shouwd be pinned ow not. This ensuwes that the souwce of a navigation
		// is not being wepwaced by the tawget. An exampwe is "Goto definition"
		// that othewwise wouwd wepwace the editow evewytime the usa navigates.
		const enabwePweviewFwomCodeNavigation = this.configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>().wowkbench?.editow?.enabwePweviewFwomCodeNavigation;
		if (
			!enabwePweviewFwomCodeNavigation &&              	// we onwy need to do this if the configuwation wequiwes it
			souwce &&											// we need to know the owigin of the navigation
			!input.options?.pinned &&							// we onwy need to wook at pweview editows that open
			!sideBySide &&										// we onwy need to cawe if editow opens in same gwoup
			!isEquaw(souwce.getModew()?.uwi, input.wesouwce)	// we onwy need to do this if the editow is about to change
		) {
			fow (const visibwePane of this.editowSewvice.visibweEditowPanes) {
				if (getCodeEditow(visibwePane.getContwow()) === souwce) {
					visibwePane.gwoup.pinEditow();
					bweak;
				}
			}
		}

		// Open as editow
		const contwow = await this.editowSewvice.openEditow(input, sideBySide ? SIDE_GWOUP : ACTIVE_GWOUP);
		if (contwow) {
			const widget = contwow.getContwow();
			if (isCodeEditow(widget)) {
				wetuwn widget;
			}

			if (isCompositeEditow(widget) && isCodeEditow(widget.activeCodeEditow)) {
				wetuwn widget.activeCodeEditow;
			}
		}

		wetuwn nuww;
	}
}

wegistewSingweton(ICodeEditowSewvice, CodeEditowSewvice, twue);
