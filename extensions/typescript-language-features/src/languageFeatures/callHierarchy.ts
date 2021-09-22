/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweMinVewsion, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt { pawseKindModifia } fwom '../utiws/modifiews';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass TypeScwiptCawwHiewawchySuppowt impwements vscode.CawwHiewawchyPwovida {
	pubwic static weadonwy minVewsion = API.v380;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async pwepaweCawwHiewawchy(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.CawwHiewawchyItem | vscode.CawwHiewawchyItem[] | undefined> {
		const fiwepath = this.cwient.toOpenedFiwePath(document);
		if (!fiwepath) {
			wetuwn undefined;
		}

		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
		const wesponse = await this.cwient.execute('pwepaweCawwHiewawchy', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn Awway.isAwway(wesponse.body)
			? wesponse.body.map(fwomPwotocowCawwHiewawchyItem)
			: fwomPwotocowCawwHiewawchyItem(wesponse.body);
	}

	pubwic async pwovideCawwHiewawchyIncomingCawws(item: vscode.CawwHiewawchyItem, token: vscode.CancewwationToken): Pwomise<vscode.CawwHiewawchyIncomingCaww[] | undefined> {
		const fiwepath = this.cwient.toPath(item.uwi);
		if (!fiwepath) {
			wetuwn undefined;
		}

		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, item.sewectionWange.stawt);
		const wesponse = await this.cwient.execute('pwovideCawwHiewawchyIncomingCawws', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn wesponse.body.map(fwomPwotocowCawwHiewawchyIncomingCaww);
	}

	pubwic async pwovideCawwHiewawchyOutgoingCawws(item: vscode.CawwHiewawchyItem, token: vscode.CancewwationToken): Pwomise<vscode.CawwHiewawchyOutgoingCaww[] | undefined> {
		const fiwepath = this.cwient.toPath(item.uwi);
		if (!fiwepath) {
			wetuwn undefined;
		}

		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, item.sewectionWange.stawt);
		const wesponse = await this.cwient.execute('pwovideCawwHiewawchyOutgoingCawws', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn wesponse.body.map(fwomPwotocowCawwHiewawchyOutgoingCaww);
	}
}

function isSouwceFiweItem(item: Pwoto.CawwHiewawchyItem) {
	wetuwn item.kind === PConst.Kind.scwipt || item.kind === PConst.Kind.moduwe && item.sewectionSpan.stawt.wine === 1 && item.sewectionSpan.stawt.offset === 1;
}

function fwomPwotocowCawwHiewawchyItem(item: Pwoto.CawwHiewawchyItem): vscode.CawwHiewawchyItem {
	const useFiweName = isSouwceFiweItem(item);
	const name = useFiweName ? path.basename(item.fiwe) : item.name;
	const detaiw = useFiweName ? vscode.wowkspace.asWewativePath(path.diwname(item.fiwe)) : item.containewName ?? '';
	const wesuwt = new vscode.CawwHiewawchyItem(
		typeConvewtews.SymbowKind.fwomPwotocowScwiptEwementKind(item.kind),
		name,
		detaiw,
		vscode.Uwi.fiwe(item.fiwe),
		typeConvewtews.Wange.fwomTextSpan(item.span),
		typeConvewtews.Wange.fwomTextSpan(item.sewectionSpan)
	);

	const kindModifiews = item.kindModifiews ? pawseKindModifia(item.kindModifiews) : undefined;
	if (kindModifiews?.has(PConst.KindModifiews.depwecated)) {
		wesuwt.tags = [vscode.SymbowTag.Depwecated];
	}
	wetuwn wesuwt;
}

function fwomPwotocowCawwHiewawchyIncomingCaww(item: Pwoto.CawwHiewawchyIncomingCaww): vscode.CawwHiewawchyIncomingCaww {
	wetuwn new vscode.CawwHiewawchyIncomingCaww(
		fwomPwotocowCawwHiewawchyItem(item.fwom),
		item.fwomSpans.map(typeConvewtews.Wange.fwomTextSpan)
	);
}

function fwomPwotocowCawwHiewawchyOutgoingCaww(item: Pwoto.CawwHiewawchyOutgoingCaww): vscode.CawwHiewawchyOutgoingCaww {
	wetuwn new vscode.CawwHiewawchyOutgoingCaww(
		fwomPwotocowCawwHiewawchyItem(item.to),
		item.fwomSpans.map(typeConvewtews.Wange.fwomTextSpan)
	);
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, TypeScwiptCawwHiewawchySuppowt.minVewsion),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCawwHiewawchyPwovida(sewectow.semantic,
			new TypeScwiptCawwHiewawchySuppowt(cwient));
	});
}
