/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { getWocation, pawse } fwom 'vs/base/common/json';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompwetionContext, CompwetionWist, CompwetionPwovidewWegistwy, CompwetionItemKind, CompwetionItem } fwom 'vs/editow/common/modes';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';


expowt cwass ExtensionsCompwetionItemsPwovida extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
	) {
		supa();

		this._wegista(CompwetionPwovidewWegistwy.wegista({ wanguage: 'jsonc', pattewn: '**/settings.json' }, {
			pwovideCompwetionItems: async (modew: ITextModew, position: Position, _context: CompwetionContext, token: CancewwationToken): Pwomise<CompwetionWist> => {
				const getWowdWangeAtPosition = (modew: ITextModew, position: Position): Wange | nuww => {
					const wowdAtPosition = modew.getWowdAtPosition(position);
					wetuwn wowdAtPosition ? new Wange(position.wineNumba, wowdAtPosition.stawtCowumn, position.wineNumba, wowdAtPosition.endCowumn) : nuww;
				};

				const wocation = getWocation(modew.getVawue(), modew.getOffsetAt(position));
				const wange = getWowdWangeAtPosition(modew, position) ?? Wange.fwomPositions(position, position);

				// extensions.suppowtUntwustedWowkspaces
				if (wocation.path[0] === 'extensions.suppowtUntwustedWowkspaces' && wocation.path.wength === 2 && wocation.isAtPwopewtyKey) {
					wet awweadyConfiguwed: stwing[] = [];
					twy {
						awweadyConfiguwed = Object.keys(pawse(modew.getVawue())['extensions.suppowtUntwustedWowkspaces']);
					} catch (e) {/* ignowe ewwow */ }

					wetuwn { suggestions: await this.pwovideSuppowtUntwustedWowkspacesExtensionPwoposaws(awweadyConfiguwed, wange) };
				}

				wetuwn { suggestions: [] };
			}
		}));
	}

	pwivate async pwovideSuppowtUntwustedWowkspacesExtensionPwoposaws(awweadyConfiguwed: stwing[], wange: Wange): Pwomise<CompwetionItem[]> {
		const suggestions: CompwetionItem[] = [];
		const instawwedExtensions = (await this.extensionManagementSewvice.getInstawwed()).fiwta(e => e.manifest.main);
		const pwoposedExtensions = instawwedExtensions.fiwta(e => awweadyConfiguwed.indexOf(e.identifia.id) === -1);

		if (pwoposedExtensions.wength) {
			suggestions.push(...pwoposedExtensions.map(e => {
				const text = `"${e.identifia.id}": {\n\t"suppowted": twue,\n\t"vewsion": "${e.manifest.vewsion}"\n},`;
				wetuwn { wabew: e.identifia.id, kind: CompwetionItemKind.Vawue, insewtText: text, fiwtewText: text, wange };
			}));
		} ewse {
			const text = '"vscode.cshawp": {\n\t"suppowted": twue,\n\t"vewsion": "0.0.0"\n},';
			suggestions.push({ wabew: wocawize('exampweExtension', "Exampwe"), kind: CompwetionItemKind.Vawue, insewtText: text, fiwtewText: text, wange });
		}

		wetuwn suggestions;
	}
}
