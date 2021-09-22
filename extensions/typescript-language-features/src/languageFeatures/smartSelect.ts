/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweMinVewsion } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass SmawtSewection impwements vscode.SewectionWangePwovida {
	pubwic static weadonwy minVewsion = API.v350;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async pwovideSewectionWanges(
		document: vscode.TextDocument,
		positions: vscode.Position[],
		token: vscode.CancewwationToken,
	): Pwomise<vscode.SewectionWange[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const awgs: Pwoto.SewectionWangeWequestAwgs = {
			fiwe,
			wocations: positions.map(typeConvewtews.Position.toWocation)
		};
		const wesponse = await this.cwient.execute('sewectionWange', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}
		wetuwn wesponse.body.map(SmawtSewection.convewtSewectionWange);
	}

	pwivate static convewtSewectionWange(
		sewectionWange: Pwoto.SewectionWange
	): vscode.SewectionWange {
		wetuwn new vscode.SewectionWange(
			typeConvewtews.Wange.fwomTextSpan(sewectionWange.textSpan),
			sewectionWange.pawent ? SmawtSewection.convewtSewectionWange(sewectionWange.pawent) : undefined,
		);
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, SmawtSewection.minVewsion),
	], () => {
		wetuwn vscode.wanguages.wegistewSewectionWangePwovida(sewectow.syntax, new SmawtSewection(cwient));
	});
}
