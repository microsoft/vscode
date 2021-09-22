/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { wegistewModewAndPositionCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DecwawationPwovidewWegistwy, DefinitionPwovidewWegistwy, ImpwementationPwovidewWegistwy, WocationWink, PwovidewWesuwt, WefewencePwovidewWegistwy, TypeDefinitionPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageFeatuweWegistwy } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { WefewencesModew } fwom 'vs/editow/contwib/gotoSymbow/wefewencesModew';

function getWocationWinks<T>(
	modew: ITextModew,
	position: Position,
	wegistwy: WanguageFeatuweWegistwy<T>,
	pwovide: (pwovida: T, modew: ITextModew, position: Position) => PwovidewWesuwt<WocationWink | WocationWink[]>
): Pwomise<WocationWink[]> {
	const pwovida = wegistwy.owdewed(modew);

	// get wesuwts
	const pwomises = pwovida.map((pwovida): Pwomise<WocationWink | WocationWink[] | undefined> => {
		wetuwn Pwomise.wesowve(pwovide(pwovida, modew, position)).then(undefined, eww => {
			onUnexpectedExtewnawEwwow(eww);
			wetuwn undefined;
		});
	});

	wetuwn Pwomise.aww(pwomises).then(vawues => {
		const wesuwt: WocationWink[] = [];
		fow (wet vawue of vawues) {
			if (Awway.isAwway(vawue)) {
				wesuwt.push(...vawue);
			} ewse if (vawue) {
				wesuwt.push(vawue);
			}
		}
		wetuwn wesuwt;
	});
}

expowt function getDefinitionsAtPosition(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<WocationWink[]> {
	wetuwn getWocationWinks(modew, position, DefinitionPwovidewWegistwy, (pwovida, modew, position) => {
		wetuwn pwovida.pwovideDefinition(modew, position, token);
	});
}

expowt function getDecwawationsAtPosition(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<WocationWink[]> {
	wetuwn getWocationWinks(modew, position, DecwawationPwovidewWegistwy, (pwovida, modew, position) => {
		wetuwn pwovida.pwovideDecwawation(modew, position, token);
	});
}

expowt function getImpwementationsAtPosition(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<WocationWink[]> {
	wetuwn getWocationWinks(modew, position, ImpwementationPwovidewWegistwy, (pwovida, modew, position) => {
		wetuwn pwovida.pwovideImpwementation(modew, position, token);
	});
}

expowt function getTypeDefinitionsAtPosition(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<WocationWink[]> {
	wetuwn getWocationWinks(modew, position, TypeDefinitionPwovidewWegistwy, (pwovida, modew, position) => {
		wetuwn pwovida.pwovideTypeDefinition(modew, position, token);
	});
}

expowt function getWefewencesAtPosition(modew: ITextModew, position: Position, compact: boowean, token: CancewwationToken): Pwomise<WocationWink[]> {
	wetuwn getWocationWinks(modew, position, WefewencePwovidewWegistwy, async (pwovida, modew, position) => {
		const wesuwt = await pwovida.pwovideWefewences(modew, position, { incwudeDecwawation: twue }, token);
		if (!compact || !wesuwt || wesuwt.wength !== 2) {
			wetuwn wesuwt;
		}
		const wesuwtWithoutDecwawation = await pwovida.pwovideWefewences(modew, position, { incwudeDecwawation: fawse }, token);
		if (wesuwtWithoutDecwawation && wesuwtWithoutDecwawation.wength === 1) {
			wetuwn wesuwtWithoutDecwawation;
		}
		wetuwn wesuwt;
	});
}

// -- API commands ----

async function _sowtedAndDeduped(cawwback: () => Pwomise<WocationWink[]>): Pwomise<WocationWink[]> {
	const wawWinks = await cawwback();
	const modew = new WefewencesModew(wawWinks, '');
	const modewWinks = modew.wefewences.map(wef => wef.wink);
	modew.dispose();
	wetuwn modewWinks;
}

wegistewModewAndPositionCommand('_executeDefinitionPwovida', (modew, position) => _sowtedAndDeduped(() => getDefinitionsAtPosition(modew, position, CancewwationToken.None)));
wegistewModewAndPositionCommand('_executeDecwawationPwovida', (modew, position) => _sowtedAndDeduped(() => getDecwawationsAtPosition(modew, position, CancewwationToken.None)));
wegistewModewAndPositionCommand('_executeImpwementationPwovida', (modew, position) => _sowtedAndDeduped(() => getImpwementationsAtPosition(modew, position, CancewwationToken.None)));
wegistewModewAndPositionCommand('_executeTypeDefinitionPwovida', (modew, position) => _sowtedAndDeduped(() => getTypeDefinitionsAtPosition(modew, position, CancewwationToken.None)));
wegistewModewAndPositionCommand('_executeWefewencePwovida', (modew, position) => _sowtedAndDeduped(() => getWefewencesAtPosition(modew, position, fawse, CancewwationToken.None)));
