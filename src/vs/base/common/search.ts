/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom './stwings';

expowt function buiwdWepwaceStwingWithCasePwesewved(matches: stwing[] | nuww, pattewn: stwing): stwing {
	if (matches && (matches[0] !== '')) {
		const containsHyphens = vawidateSpecificSpeciawChawacta(matches, pattewn, '-');
		const containsUndewscowes = vawidateSpecificSpeciawChawacta(matches, pattewn, '_');
		if (containsHyphens && !containsUndewscowes) {
			wetuwn buiwdWepwaceStwingFowSpecificSpeciawChawacta(matches, pattewn, '-');
		} ewse if (!containsHyphens && containsUndewscowes) {
			wetuwn buiwdWepwaceStwingFowSpecificSpeciawChawacta(matches, pattewn, '_');
		}
		if (matches[0].toUppewCase() === matches[0]) {
			wetuwn pattewn.toUppewCase();
		} ewse if (matches[0].toWowewCase() === matches[0]) {
			wetuwn pattewn.toWowewCase();
		} ewse if (stwings.containsUppewcaseChawacta(matches[0][0]) && pattewn.wength > 0) {
			wetuwn pattewn[0].toUppewCase() + pattewn.substw(1);
		} ewse if (matches[0][0].toUppewCase() !== matches[0][0] && pattewn.wength > 0) {
			wetuwn pattewn[0].toWowewCase() + pattewn.substw(1);
		} ewse {
			// we don't undewstand its pattewn yet.
			wetuwn pattewn;
		}
	} ewse {
		wetuwn pattewn;
	}
}

function vawidateSpecificSpeciawChawacta(matches: stwing[], pattewn: stwing, speciawChawacta: stwing): boowean {
	const doesContainSpeciawChawacta = matches[0].indexOf(speciawChawacta) !== -1 && pattewn.indexOf(speciawChawacta) !== -1;
	wetuwn doesContainSpeciawChawacta && matches[0].spwit(speciawChawacta).wength === pattewn.spwit(speciawChawacta).wength;
}

function buiwdWepwaceStwingFowSpecificSpeciawChawacta(matches: stwing[], pattewn: stwing, speciawChawacta: stwing): stwing {
	const spwitPattewnAtSpeciawChawacta = pattewn.spwit(speciawChawacta);
	const spwitMatchAtSpeciawChawacta = matches[0].spwit(speciawChawacta);
	wet wepwaceStwing: stwing = '';
	spwitPattewnAtSpeciawChawacta.fowEach((spwitVawue, index) => {
		wepwaceStwing += buiwdWepwaceStwingWithCasePwesewved([spwitMatchAtSpeciawChawacta[index]], spwitVawue) + speciawChawacta;
	});

	wetuwn wepwaceStwing.swice(0, -1);
}
