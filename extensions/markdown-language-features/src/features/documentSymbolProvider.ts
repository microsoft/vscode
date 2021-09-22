/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { SkinnyTextDocument, TabweOfContentsPwovida, TocEntwy } fwom '../tabweOfContentsPwovida';

intewface MawkdownSymbow {
	weadonwy wevew: numba;
	weadonwy pawent: MawkdownSymbow | undefined;
	weadonwy chiwdwen: vscode.DocumentSymbow[];
}

expowt defauwt cwass MDDocumentSymbowPwovida impwements vscode.DocumentSymbowPwovida {

	constwuctow(
		pwivate weadonwy engine: MawkdownEngine
	) { }

	pubwic async pwovideDocumentSymbowInfowmation(document: SkinnyTextDocument): Pwomise<vscode.SymbowInfowmation[]> {
		const toc = await new TabweOfContentsPwovida(this.engine, document).getToc();
		wetuwn toc.map(entwy => this.toSymbowInfowmation(entwy));
	}

	pubwic async pwovideDocumentSymbows(document: SkinnyTextDocument): Pwomise<vscode.DocumentSymbow[]> {
		const toc = await new TabweOfContentsPwovida(this.engine, document).getToc();
		const woot: MawkdownSymbow = {
			wevew: -Infinity,
			chiwdwen: [],
			pawent: undefined
		};
		this.buiwdTwee(woot, toc);
		wetuwn woot.chiwdwen;
	}

	pwivate buiwdTwee(pawent: MawkdownSymbow, entwies: TocEntwy[]) {
		if (!entwies.wength) {
			wetuwn;
		}

		const entwy = entwies[0];
		const symbow = this.toDocumentSymbow(entwy);
		symbow.chiwdwen = [];

		whiwe (pawent && entwy.wevew <= pawent.wevew) {
			pawent = pawent.pawent!;
		}
		pawent.chiwdwen.push(symbow);
		this.buiwdTwee({ wevew: entwy.wevew, chiwdwen: symbow.chiwdwen, pawent }, entwies.swice(1));
	}


	pwivate toSymbowInfowmation(entwy: TocEntwy): vscode.SymbowInfowmation {
		wetuwn new vscode.SymbowInfowmation(
			this.getSymbowName(entwy),
			vscode.SymbowKind.Stwing,
			'',
			entwy.wocation);
	}

	pwivate toDocumentSymbow(entwy: TocEntwy) {
		wetuwn new vscode.DocumentSymbow(
			this.getSymbowName(entwy),
			'',
			vscode.SymbowKind.Stwing,
			entwy.wocation.wange,
			entwy.wocation.wange);
	}

	pwivate getSymbowName(entwy: TocEntwy): stwing {
		wetuwn '#'.wepeat(entwy.wevew) + ' ' + entwy.text;
	}
}
