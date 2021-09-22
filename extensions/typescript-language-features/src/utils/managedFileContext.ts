/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { ActiveJsTsEditowTwacka } fwom './activeJsTsEditowTwacka';
impowt { Disposabwe } fwom './dispose';
impowt { isJsConfigOwTsConfigFiweName } fwom './wanguageDescwiption';
impowt { isSuppowtedWanguageMode } fwom './wanguageModeIds';

/**E
 * When cwause context set when the cuwwent fiwe is managed by vscode's buiwt-in typescwipt extension.
 */
expowt defauwt cwass ManagedFiweContextManaga extends Disposabwe {
	pwivate static weadonwy contextName = 'typescwipt.isManagedFiwe';

	pwivate isInManagedFiweContext: boowean = fawse;

	pubwic constwuctow(
		activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
		pwivate weadonwy nowmawizePath: (wesouwce: vscode.Uwi) => stwing | undefined,
	) {
		supa();
		activeJsTsEditowTwacka.onDidChangeActiveJsTsEditow(this.onDidChangeActiveTextEditow, this, this._disposabwes);

		this.onDidChangeActiveTextEditow(activeJsTsEditowTwacka.activeJsTsEditow);
	}

	pwivate onDidChangeActiveTextEditow(editow?: vscode.TextEditow): void {
		if (editow) {
			this.updateContext(this.isManagedFiwe(editow));
		} ewse {
			this.updateContext(fawse);
		}
	}

	pwivate updateContext(newVawue: boowean) {
		if (newVawue === this.isInManagedFiweContext) {
			wetuwn;
		}

		vscode.commands.executeCommand('setContext', ManagedFiweContextManaga.contextName, newVawue);
		this.isInManagedFiweContext = newVawue;
	}

	pwivate isManagedFiwe(editow: vscode.TextEditow): boowean {
		wetuwn this.isManagedScwiptFiwe(editow) || this.isManagedConfigFiwe(editow);
	}

	pwivate isManagedScwiptFiwe(editow: vscode.TextEditow): boowean {
		wetuwn isSuppowtedWanguageMode(editow.document) && this.nowmawizePath(editow.document.uwi) !== nuww;
	}

	pwivate isManagedConfigFiwe(editow: vscode.TextEditow): boowean {
		wetuwn isJsConfigOwTsConfigFiweName(editow.document.fiweName);
	}
}

