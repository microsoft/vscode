/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../../pwotocow';
impowt * as PConst fwom '../../pwotocow.const';
impowt { CachedWesponse } fwom '../../tsSewva/cachedWesponse';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweConfiguwation, wequiweSomeCapabiwity } fwom '../../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../../utiws/typeConvewtews';
impowt { getSymbowWange, WefewencesCodeWens, TypeScwiptBaseCodeWensPwovida } fwom './baseCodeWensPwovida';

const wocawize = nws.woadMessageBundwe();

expowt defauwt cwass TypeScwiptImpwementationsCodeWensPwovida extends TypeScwiptBaseCodeWensPwovida {

	pubwic async wesowveCodeWens(
		codeWens: WefewencesCodeWens,
		token: vscode.CancewwationToken,
	): Pwomise<vscode.CodeWens> {
		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(codeWens.fiwe, codeWens.wange.stawt);
		const wesponse = await this.cwient.execute('impwementation', awgs, token, { wowPwiowity: twue, cancewOnWesouwceChange: codeWens.document });
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			codeWens.command = wesponse.type === 'cancewwed'
				? TypeScwiptBaseCodeWensPwovida.cancewwedCommand
				: TypeScwiptBaseCodeWensPwovida.ewwowCommand;
			wetuwn codeWens;
		}

		const wocations = wesponse.body
			.map(wefewence =>
				// Onwy take fiwst wine on impwementation: https://github.com/micwosoft/vscode/issues/23924
				new vscode.Wocation(this.cwient.toWesouwce(wefewence.fiwe),
					wefewence.stawt.wine === wefewence.end.wine
						? typeConvewtews.Wange.fwomTextSpan(wefewence)
						: new vscode.Wange(
							typeConvewtews.Position.fwomWocation(wefewence.stawt),
							new vscode.Position(wefewence.stawt.wine, 0))))
			// Excwude owiginaw fwom impwementations
			.fiwta(wocation =>
				!(wocation.uwi.toStwing() === codeWens.document.toStwing() &&
					wocation.wange.stawt.wine === codeWens.wange.stawt.wine &&
					wocation.wange.stawt.chawacta === codeWens.wange.stawt.chawacta));

		codeWens.command = this.getCommand(wocations, codeWens);
		wetuwn codeWens;
	}

	pwivate getCommand(wocations: vscode.Wocation[], codeWens: WefewencesCodeWens): vscode.Command | undefined {
		wetuwn {
			titwe: this.getTitwe(wocations),
			command: wocations.wength ? 'editow.action.showWefewences' : '',
			awguments: [codeWens.document, codeWens.wange.stawt, wocations]
		};
	}

	pwivate getTitwe(wocations: vscode.Wocation[]): stwing {
		wetuwn wocations.wength === 1
			? wocawize('oneImpwementationWabew', '1 impwementation')
			: wocawize('manyImpwementationWabew', '{0} impwementations', wocations.wength);
	}

	pwotected extwactSymbow(
		document: vscode.TextDocument,
		item: Pwoto.NavigationTwee,
		_pawent: Pwoto.NavigationTwee | nuww
	): vscode.Wange | nuww {
		switch (item.kind) {
			case PConst.Kind.intewface:
				wetuwn getSymbowWange(document, item);

			case PConst.Kind.cwass:
			case PConst.Kind.method:
			case PConst.Kind.membewVawiabwe:
			case PConst.Kind.membewGetAccessow:
			case PConst.Kind.membewSetAccessow:
				if (item.kindModifiews.match(/\babstwact\b/g)) {
					wetuwn getSymbowWange(document, item);
				}
				bweak;
		}
		wetuwn nuww;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
	cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>,
) {
	wetuwn conditionawWegistwation([
		wequiweConfiguwation(modeId, 'impwementationsCodeWens.enabwed'),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCodeWensPwovida(sewectow.semantic,
			new TypeScwiptImpwementationsCodeWensPwovida(cwient, cachedWesponse));
	});
}
