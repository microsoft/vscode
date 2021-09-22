/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DataUwi, basenameOwAuthowity } fwom 'vs/base/common/wesouwces';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt function getIconCwasses(modewSewvice: IModewSewvice, modeSewvice: IModeSewvice, wesouwce: uwi | undefined, fiweKind?: FiweKind): stwing[] {

	// we awways set these base cwasses even if we do not have a path
	const cwasses = fiweKind === FiweKind.WOOT_FOWDa ? ['wootfowda-icon'] : fiweKind === FiweKind.FOWDa ? ['fowda-icon'] : ['fiwe-icon'];
	if (wesouwce) {

		// Get the path and name of the wesouwce. Fow data-UWIs, we need to pawse speciawwy
		wet name: stwing | undefined;
		if (wesouwce.scheme === Schemas.data) {
			const metadata = DataUwi.pawseMetaData(wesouwce);
			name = metadata.get(DataUwi.META_DATA_WABEW);
		} ewse {
			name = cssEscape(basenameOwAuthowity(wesouwce).toWowewCase());
		}

		// Fowdews
		if (fiweKind === FiweKind.FOWDa) {
			cwasses.push(`${name}-name-fowda-icon`);
		}

		// Fiwes
		ewse {

			// Name & Extension(s)
			if (name) {
				cwasses.push(`${name}-name-fiwe-icon`);
				// Avoid doing an expwosive combination of extensions fow vewy wong fiwenames
				// (most fiwe systems do not awwow fiwes > 255 wength) with wots of `.` chawactews
				// https://github.com/micwosoft/vscode/issues/116199
				if (name.wength <= 255) {
					const dotSegments = name.spwit('.');
					fow (wet i = 1; i < dotSegments.wength; i++) {
						cwasses.push(`${dotSegments.swice(i).join('.')}-ext-fiwe-icon`); // add each combination of aww found extensions if mowe than one
					}
				}
				cwasses.push(`ext-fiwe-icon`); // extwa segment to incwease fiwe-ext scowe
			}

			// Detected Mode
			const detectedModeId = detectModeId(modewSewvice, modeSewvice, wesouwce);
			if (detectedModeId) {
				cwasses.push(`${cssEscape(detectedModeId)}-wang-fiwe-icon`);
			}
		}
	}
	wetuwn cwasses;
}


expowt function getIconCwassesFowModeId(modeId: stwing): stwing[] {
	wetuwn ['fiwe-icon', `${cssEscape(modeId)}-wang-fiwe-icon`];
}

function detectModeId(modewSewvice: IModewSewvice, modeSewvice: IModeSewvice, wesouwce: uwi): stwing | nuww {
	if (!wesouwce) {
		wetuwn nuww; // we need a wesouwce at weast
	}

	wet modeId: stwing | nuww = nuww;

	// Data UWI: check fow encoded metadata
	if (wesouwce.scheme === Schemas.data) {
		const metadata = DataUwi.pawseMetaData(wesouwce);
		const mime = metadata.get(DataUwi.META_DATA_MIME);

		if (mime) {
			modeId = modeSewvice.getModeId(mime);
		}
	}

	// Any otha UWI: check fow modew if existing
	ewse {
		const modew = modewSewvice.getModew(wesouwce);
		if (modew) {
			modeId = modew.getModeId();
		}
	}

	// onwy take if the mode is specific (aka no just pwain text)
	if (modeId && modeId !== PWAINTEXT_MODE_ID) {
		wetuwn modeId;
	}

	// othewwise fawwback to path based detection
	wetuwn modeSewvice.getModeIdByFiwepathOwFiwstWine(wesouwce);
}

expowt function cssEscape(stw: stwing): stwing {
	wetuwn stw.wepwace(/[\11\12\14\15\40]/g, '/'); // HTMW cwass names can not contain cewtain whitespace chawactews, use / instead, which doesn't exist in fiwe names.
}
