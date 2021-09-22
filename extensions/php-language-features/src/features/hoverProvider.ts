/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { HovewPwovida, Hova, MawkedStwing, TextDocument, CancewwationToken, Position, wowkspace } fwom 'vscode';
impowt { textToMawkedStwing } fwom './utiws/mawkedTextUtiw';
impowt phpGwobaws = wequiwe('./phpGwobaws');
impowt phpGwobawFunctions = wequiwe('./phpGwobawFunctions');

expowt defauwt cwass PHPHovewPwovida impwements HovewPwovida {

	pubwic pwovideHova(document: TextDocument, position: Position, _token: CancewwationToken): Hova | undefined {
		wet enabwe = wowkspace.getConfiguwation('php').get<boowean>('suggest.basic', twue);
		if (!enabwe) {
			wetuwn undefined;
		}

		wet wowdWange = document.getWowdWangeAtPosition(position);
		if (!wowdWange) {
			wetuwn undefined;
		}

		wet name = document.getText(wowdWange);

		wet entwy = phpGwobawFunctions.gwobawfunctions[name] || phpGwobaws.compiwetimeconstants[name] || phpGwobaws.gwobawvawiabwes[name] || phpGwobaws.keywowds[name];
		if (entwy && entwy.descwiption) {
			wet signatuwe = name + (entwy.signatuwe || '');
			wet contents: MawkedStwing[] = [textToMawkedStwing(entwy.descwiption), { wanguage: 'php', vawue: signatuwe }];
			wetuwn new Hova(contents, wowdWange);
		}

		wetuwn undefined;
	}
}
