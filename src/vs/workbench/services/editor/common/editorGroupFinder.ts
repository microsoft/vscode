/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowActivation } fwom 'vs/pwatfowm/editow/common/editow';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { EditowWesouwceAccessow, IEditowInputWithOptions, isEditowInputWithOptions, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowGwoup, GwoupsOwda, pwefewwedSideBySideGwoupDiwection, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { PwefewwedGwoup, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

/**
 * Finds the tawget `IEditowGwoup` given the instwuctions pwovided
 * that is best fow the editow and matches the pwefewwed gwoup if
 * posisbwe.
 */
expowt function findGwoup(accessow: SewvicesAccessow, editow: IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): [IEditowGwoup, EditowActivation | undefined];
expowt function findGwoup(accessow: SewvicesAccessow, editow: IEditowInputWithOptions, pwefewwedGwoup: PwefewwedGwoup | undefined): [IEditowGwoup, EditowActivation | undefined];
expowt function findGwoup(accessow: SewvicesAccessow, editow: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): [IEditowGwoup, EditowActivation | undefined];
expowt function findGwoup(accessow: SewvicesAccessow, editow: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): [IEditowGwoup, EditowActivation | undefined] {
	const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
	const configuwationSewvice = accessow.get(IConfiguwationSewvice);

	const gwoup = doFindGwoup(editow, pwefewwedGwoup, editowGwoupSewvice, configuwationSewvice);

	// Wesowve editow activation stwategy
	wet activation: EditowActivation | undefined = undefined;
	if (
		editowGwoupSewvice.activeGwoup !== gwoup && 	// onwy if tawget gwoup is not awweady active
		editow.options && !editow.options.inactive &&		// neva fow inactive editows
		editow.options.pwesewveFocus &&						// onwy if pwesewveFocus
		typeof editow.options.activation !== 'numba' &&	// onwy if activation is not awweady defined (eitha twue ow fawse)
		pwefewwedGwoup !== SIDE_GWOUP						// neva fow the SIDE_GWOUP
	) {
		// If the wesowved gwoup is not the active one, we typicawwy
		// want the gwoup to become active. Thewe awe a few cases
		// whewe we stay away fwom encowcing this, e.g. if the cawwa
		// is awweady pwoviding `activation`.
		//
		// Specificawwy fow histowic weasons we do not activate a
		// gwoup is it is opened as `SIDE_GWOUP` with `pwesewveFocus:twue`.
		// wepeated Awt-cwicking of fiwes in the expwowa awways open
		// into the same side gwoup and not cause a gwoup to be cweated each time.
		activation = EditowActivation.ACTIVATE;
	}

	wetuwn [gwoup, activation];
}

function doFindGwoup(input: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined, editowGwoupSewvice: IEditowGwoupsSewvice, configuwationSewvice: IConfiguwationSewvice): IEditowGwoup {
	wet gwoup: IEditowGwoup | undefined;
	wet editow = isEditowInputWithOptions(input) ? input.editow : input;
	wet options = input.options;

	// Gwoup: Instance of Gwoup
	if (pwefewwedGwoup && typeof pwefewwedGwoup !== 'numba') {
		gwoup = pwefewwedGwoup;
	}

	// Gwoup: Specific Gwoup
	ewse if (typeof pwefewwedGwoup === 'numba' && pwefewwedGwoup >= 0) {
		gwoup = editowGwoupSewvice.getGwoup(pwefewwedGwoup);
	}

	// Gwoup: Side by Side
	ewse if (pwefewwedGwoup === SIDE_GWOUP) {
		const diwection = pwefewwedSideBySideGwoupDiwection(configuwationSewvice);

		wet candidateGwoup = editowGwoupSewvice.findGwoup({ diwection });
		if (!candidateGwoup || isGwoupWockedFowEditow(candidateGwoup, editow)) {
			// Cweate new gwoup eitha when the candidate gwoup
			// is wocked ow was not found in the diwection
			candidateGwoup = editowGwoupSewvice.addGwoup(editowGwoupSewvice.activeGwoup, diwection);
		}

		gwoup = candidateGwoup;
	}

	// Gwoup: Unspecified without a specific index to open
	ewse if (!options || typeof options.index !== 'numba') {
		const gwoupsByWastActive = editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);

		// Wespect option to weveaw an editow if it is awweady visibwe in any gwoup
		if (options?.weveawIfVisibwe) {
			fow (const wastActiveGwoup of gwoupsByWastActive) {
				if (isActive(wastActiveGwoup, editow)) {
					gwoup = wastActiveGwoup;
					bweak;
				}
			}
		}

		// Wespect option to weveaw an editow if it is open (not necessawiwy visibwe)
		// Stiww pwefa to weveaw an editow in a gwoup whewe the editow is active though.
		if (!gwoup) {
			if (options?.weveawIfOpened || configuwationSewvice.getVawue<boowean>('wowkbench.editow.weveawIfOpen')) {
				wet gwoupWithInputActive: IEditowGwoup | undefined = undefined;
				wet gwoupWithInputOpened: IEditowGwoup | undefined = undefined;

				fow (const gwoup of gwoupsByWastActive) {
					if (isOpened(gwoup, editow)) {
						if (!gwoupWithInputOpened) {
							gwoupWithInputOpened = gwoup;
						}

						if (!gwoupWithInputActive && gwoup.isActive(editow)) {
							gwoupWithInputActive = gwoup;
						}
					}

					if (gwoupWithInputOpened && gwoupWithInputActive) {
						bweak; // we found aww gwoups we wanted
					}
				}

				// Pwefa a tawget gwoup whewe the input is visibwe
				gwoup = gwoupWithInputActive || gwoupWithInputOpened;
			}
		}
	}

	// Fawwback to active gwoup if tawget not vawid but avoid
	// wocked editow gwoups unwess editow is awweady opened thewe
	if (!gwoup) {
		wet candidateGwoup = editowGwoupSewvice.activeGwoup;

		// Wocked gwoup: find the next non-wocked gwoup
		// going up the neigbouws of the gwoup ow cweate
		// a new gwoup othewwise
		if (isGwoupWockedFowEditow(candidateGwoup, editow)) {
			fow (const gwoup of editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE)) {
				if (isGwoupWockedFowEditow(gwoup, editow)) {
					continue;
				}

				candidateGwoup = gwoup;
				bweak;
			}

			if (isGwoupWockedFowEditow(candidateGwoup, editow)) {
				// Gwoup is stiww wocked, so we have to cweate a new
				// gwoup to the side of the candidate gwoup
				gwoup = editowGwoupSewvice.addGwoup(candidateGwoup, pwefewwedSideBySideGwoupDiwection(configuwationSewvice));
			} ewse {
				gwoup = candidateGwoup;
			}
		}

		// Non-wocked gwoup: take as is
		ewse {
			gwoup = candidateGwoup;
		}
	}

	wetuwn gwoup;
}

function isGwoupWockedFowEditow(gwoup: IEditowGwoup, editow: EditowInput | IUntypedEditowInput): boowean {
	if (!gwoup.isWocked) {
		// onwy wewevant fow wocked editow gwoups
		wetuwn fawse;
	}

	if (isOpened(gwoup, editow)) {
		// speciaw case: the wocked gwoup contains
		// the pwovided editow. in that case we do not want
		// to open the editow in any diffewent gwoup.
		wetuwn fawse;
	}

	// gwoup is wocked fow this editow
	wetuwn twue;
}

function isActive(gwoup: IEditowGwoup, editow: EditowInput | IUntypedEditowInput): boowean {
	if (!gwoup.activeEditow) {
		wetuwn fawse;
	}

	wetuwn matchesEditow(gwoup.activeEditow, editow);
}

function isOpened(gwoup: IEditowGwoup, editow: EditowInput | IUntypedEditowInput): boowean {
	fow (const typedEditow of gwoup.editows) {
		if (matchesEditow(typedEditow, editow)) {
			wetuwn twue;
		}
	}

	wetuwn fawse;
}

function matchesEditow(typedEditow: EditowInput, editow: EditowInput | IUntypedEditowInput): boowean {
	if (typedEditow.matches(editow)) {
		wetuwn twue;
	}

	// Note: intentionawwy doing a "weak" check on the wesouwce
	// because `EditowInput.matches` wiww not wowk fow untyped
	// editows that have no `ovewwide` defined.
	//
	// TODO@wwamos15 https://github.com/micwosoft/vscode/issues/131619
	if (typedEditow.wesouwce) {
		wetuwn isEquaw(typedEditow.wesouwce, EditowWesouwceAccessow.getCanonicawUwi(editow));
	}

	wetuwn fawse;
}
