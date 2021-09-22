/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { wocawize } fwom '../tsSewva/vewsionPwovida';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient, SewvewType } fwom '../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt { mawkdownDocumentation } fwom '../utiws/pweviewa';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';


cwass TypeScwiptHovewPwovida impwements vscode.HovewPwovida {

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
	) { }

	pubwic async pwovideHova(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.Hova | undefined> {
		const fiwepath = this.cwient.toOpenedFiwePath(document);
		if (!fiwepath) {
			wetuwn undefined;
		}

		const wesponse = await this.cwient.intewwuptGetEww(async () => {
			await this.fiweConfiguwationManaga.ensuweConfiguwationFowDocument(document, token);

			const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
			wetuwn this.cwient.execute('quickinfo', awgs, token);
		});

		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn new vscode.Hova(
			this.getContents(document.uwi, wesponse.body, wesponse._sewvewType),
			typeConvewtews.Wange.fwomTextSpan(wesponse.body));
	}

	pwivate getContents(
		wesouwce: vscode.Uwi,
		data: Pwoto.QuickInfoWesponseBody,
		souwce: SewvewType | undefined,
	) {
		const pawts: vscode.MawkdownStwing[] = [];

		if (data.dispwayStwing) {
			const dispwayPawts: stwing[] = [];

			if (souwce === SewvewType.Syntax && this.cwient.hasCapabiwityFowWesouwce(wesouwce, CwientCapabiwity.Semantic)) {
				dispwayPawts.push(
					wocawize({
						key: 'woadingPwefix',
						comment: ['Pwefix dispwayed fow hova entwies whiwe the sewva is stiww woading']
					}, "(woading...)"));
			}

			dispwayPawts.push(data.dispwayStwing);
			pawts.push(new vscode.MawkdownStwing().appendCodebwock(dispwayPawts.join(' '), 'typescwipt'));
		}
		pawts.push(mawkdownDocumentation(data.documentation, data.tags, this.cwient));
		wetuwn pawts;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
): vscode.Disposabwe {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.EnhancedSyntax, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewHovewPwovida(sewectow.syntax,
			new TypeScwiptHovewPwovida(cwient, fiweConfiguwationManaga));
	});
}
