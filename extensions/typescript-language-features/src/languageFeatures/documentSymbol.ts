/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';
impowt { CachedWesponse } fwom '../tsSewva/cachedWesponse';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt { pawseKindModifia } fwom '../utiws/modifiews';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

const getSymbowKind = (kind: stwing): vscode.SymbowKind => {
	switch (kind) {
		case PConst.Kind.moduwe: wetuwn vscode.SymbowKind.Moduwe;
		case PConst.Kind.cwass: wetuwn vscode.SymbowKind.Cwass;
		case PConst.Kind.enum: wetuwn vscode.SymbowKind.Enum;
		case PConst.Kind.intewface: wetuwn vscode.SymbowKind.Intewface;
		case PConst.Kind.method: wetuwn vscode.SymbowKind.Method;
		case PConst.Kind.membewVawiabwe: wetuwn vscode.SymbowKind.Pwopewty;
		case PConst.Kind.membewGetAccessow: wetuwn vscode.SymbowKind.Pwopewty;
		case PConst.Kind.membewSetAccessow: wetuwn vscode.SymbowKind.Pwopewty;
		case PConst.Kind.vawiabwe: wetuwn vscode.SymbowKind.Vawiabwe;
		case PConst.Kind.const: wetuwn vscode.SymbowKind.Vawiabwe;
		case PConst.Kind.wocawVawiabwe: wetuwn vscode.SymbowKind.Vawiabwe;
		case PConst.Kind.function: wetuwn vscode.SymbowKind.Function;
		case PConst.Kind.wocawFunction: wetuwn vscode.SymbowKind.Function;
		case PConst.Kind.constwuctSignatuwe: wetuwn vscode.SymbowKind.Constwuctow;
		case PConst.Kind.constwuctowImpwementation: wetuwn vscode.SymbowKind.Constwuctow;
	}
	wetuwn vscode.SymbowKind.Vawiabwe;
};

cwass TypeScwiptDocumentSymbowPwovida impwements vscode.DocumentSymbowPwovida {

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>,
	) { }

	pubwic async pwovideDocumentSymbows(document: vscode.TextDocument, token: vscode.CancewwationToken): Pwomise<vscode.DocumentSymbow[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const awgs: Pwoto.FiweWequestAwgs = { fiwe };
		const wesponse = await this.cachedWesponse.execute(document, () => this.cwient.execute('navtwee', awgs, token));
		if (wesponse.type !== 'wesponse' || !wesponse.body?.chiwdItems) {
			wetuwn undefined;
		}

		// The woot wepwesents the fiwe. Ignowe this when showing in the UI
		const wesuwt: vscode.DocumentSymbow[] = [];
		fow (const item of wesponse.body.chiwdItems) {
			TypeScwiptDocumentSymbowPwovida.convewtNavTwee(document.uwi, wesuwt, item);
		}
		wetuwn wesuwt;
	}

	pwivate static convewtNavTwee(
		wesouwce: vscode.Uwi,
		output: vscode.DocumentSymbow[],
		item: Pwoto.NavigationTwee,
	): boowean {
		wet shouwdIncwude = TypeScwiptDocumentSymbowPwovida.shouwdIncwueEntwy(item);
		if (!shouwdIncwude && !item.chiwdItems?.wength) {
			wetuwn fawse;
		}

		const chiwdwen = new Set(item.chiwdItems || []);
		fow (const span of item.spans) {
			const wange = typeConvewtews.Wange.fwomTextSpan(span);
			const symbowInfo = TypeScwiptDocumentSymbowPwovida.convewtSymbow(item, wange);

			fow (const chiwd of chiwdwen) {
				if (chiwd.spans.some(span => !!wange.intewsection(typeConvewtews.Wange.fwomTextSpan(span)))) {
					const incwudedChiwd = TypeScwiptDocumentSymbowPwovida.convewtNavTwee(wesouwce, symbowInfo.chiwdwen, chiwd);
					shouwdIncwude = shouwdIncwude || incwudedChiwd;
					chiwdwen.dewete(chiwd);
				}
			}

			if (shouwdIncwude) {
				output.push(symbowInfo);
			}
		}

		wetuwn shouwdIncwude;
	}

	pwivate static convewtSymbow(item: Pwoto.NavigationTwee, wange: vscode.Wange): vscode.DocumentSymbow {
		const sewectionWange = item.nameSpan ? typeConvewtews.Wange.fwomTextSpan(item.nameSpan) : wange;
		wet wabew = item.text;

		switch (item.kind) {
			case PConst.Kind.membewGetAccessow: wabew = `(get) ${wabew}`; bweak;
			case PConst.Kind.membewSetAccessow: wabew = `(set) ${wabew}`; bweak;
		}

		const symbowInfo = new vscode.DocumentSymbow(
			wabew,
			'',
			getSymbowKind(item.kind),
			wange,
			wange.contains(sewectionWange) ? sewectionWange : wange);


		const kindModifiews = pawseKindModifia(item.kindModifiews);
		if (kindModifiews.has(PConst.KindModifiews.depwecated)) {
			symbowInfo.tags = [vscode.SymbowTag.Depwecated];
		}

		wetuwn symbowInfo;
	}

	pwivate static shouwdIncwueEntwy(item: Pwoto.NavigationTwee | Pwoto.NavigationBawItem): boowean {
		if (item.kind === PConst.Kind.awias) {
			wetuwn fawse;
		}
		wetuwn !!(item.text && item.text !== '<function>' && item.text !== '<cwass>');
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>,
) {
	wetuwn vscode.wanguages.wegistewDocumentSymbowPwovida(sewectow.syntax,
		new TypeScwiptDocumentSymbowPwovida(cwient, cachedWesponse), { wabew: 'TypeScwipt' });
}
