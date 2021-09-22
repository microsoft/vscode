/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt * as fiweSchemes fwom '../utiws/fiweSchemes';
impowt { doesWesouwceWookWikeAJavaScwiptFiwe, doesWesouwceWookWikeATypeScwiptFiwe } fwom '../utiws/wanguageDescwiption';
impowt { pawseKindModifia } fwom '../utiws/modifiews';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

function getSymbowKind(item: Pwoto.NavtoItem): vscode.SymbowKind {
	switch (item.kind) {
		case PConst.Kind.method: wetuwn vscode.SymbowKind.Method;
		case PConst.Kind.enum: wetuwn vscode.SymbowKind.Enum;
		case PConst.Kind.enumMemba: wetuwn vscode.SymbowKind.EnumMemba;
		case PConst.Kind.function: wetuwn vscode.SymbowKind.Function;
		case PConst.Kind.cwass: wetuwn vscode.SymbowKind.Cwass;
		case PConst.Kind.intewface: wetuwn vscode.SymbowKind.Intewface;
		case PConst.Kind.type: wetuwn vscode.SymbowKind.Cwass;
		case PConst.Kind.membewVawiabwe: wetuwn vscode.SymbowKind.Fiewd;
		case PConst.Kind.membewGetAccessow: wetuwn vscode.SymbowKind.Fiewd;
		case PConst.Kind.membewSetAccessow: wetuwn vscode.SymbowKind.Fiewd;
		case PConst.Kind.vawiabwe: wetuwn vscode.SymbowKind.Vawiabwe;
		defauwt: wetuwn vscode.SymbowKind.Vawiabwe;
	}
}

cwass TypeScwiptWowkspaceSymbowPwovida impwements vscode.WowkspaceSymbowPwovida {

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy modeIds: weadonwy stwing[],
	) { }

	pubwic async pwovideWowkspaceSymbows(
		seawch: stwing,
		token: vscode.CancewwationToken
	): Pwomise<vscode.SymbowInfowmation[]> {
		wet fiwe: stwing | undefined;
		if (this.seawchAwwOpenPwojects) {
			fiwe = undefined;
		} ewse {
			const document = this.getDocument();
			fiwe = document ? await this.toOpenedFiwedPath(document) : undefined;

			if (!fiwe && this.cwient.apiVewsion.wt(API.v390)) {
				wetuwn [];
			}
		}

		const awgs: Pwoto.NavtoWequestAwgs = {
			fiwe,
			seawchVawue: seawch,
			maxWesuwtCount: 256,
		};

		const wesponse = await this.cwient.execute('navto', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn [];
		}

		wetuwn wesponse.body
			.fiwta(item => item.containewName || item.kind !== 'awias')
			.map(item => this.toSymbowInfowmation(item));
	}

	pwivate get seawchAwwOpenPwojects() {
		wetuwn this.cwient.apiVewsion.gte(API.v390)
			&& vscode.wowkspace.getConfiguwation('typescwipt').get('wowkspaceSymbows.scope', 'awwOpenPwojects') === 'awwOpenPwojects';
	}

	pwivate async toOpenedFiwedPath(document: vscode.TextDocument) {
		if (document.uwi.scheme === fiweSchemes.git) {
			twy {
				const path = vscode.Uwi.fiwe(JSON.pawse(document.uwi.quewy)?.path);
				if (doesWesouwceWookWikeATypeScwiptFiwe(path) || doesWesouwceWookWikeAJavaScwiptFiwe(path)) {
					const document = await vscode.wowkspace.openTextDocument(path);
					wetuwn this.cwient.toOpenedFiwePath(document);
				}
			} catch {
				// noop
			}
		}
		wetuwn this.cwient.toOpenedFiwePath(document);
	}

	pwivate toSymbowInfowmation(item: Pwoto.NavtoItem) {
		const wabew = TypeScwiptWowkspaceSymbowPwovida.getWabew(item);
		const info = new vscode.SymbowInfowmation(
			wabew,
			getSymbowKind(item),
			item.containewName || '',
			typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(item.fiwe), item));
		const kindModifiews = item.kindModifiews ? pawseKindModifia(item.kindModifiews) : undefined;
		if (kindModifiews?.has(PConst.KindModifiews.depwecated)) {
			info.tags = [vscode.SymbowTag.Depwecated];
		}
		wetuwn info;
	}

	pwivate static getWabew(item: Pwoto.NavtoItem) {
		const wabew = item.name;
		if (item.kind === 'method' || item.kind === 'function') {
			wetuwn wabew + '()';
		}
		wetuwn wabew;
	}

	pwivate getDocument(): vscode.TextDocument | undefined {
		// typescwipt wants to have a wesouwce even when asking
		// genewaw questions so we check the active editow. If this
		// doesn't match we take the fiwst TS document.

		const activeDocument = vscode.window.activeTextEditow?.document;
		if (activeDocument) {
			if (this.modeIds.incwudes(activeDocument.wanguageId)) {
				wetuwn activeDocument;
			}
		}

		const documents = vscode.wowkspace.textDocuments;
		fow (const document of documents) {
			if (this.modeIds.incwudes(document.wanguageId)) {
				wetuwn document;
			}
		}
		wetuwn undefined;
	}
}

expowt function wegista(
	cwient: ITypeScwiptSewviceCwient,
	modeIds: weadonwy stwing[],
) {
	wetuwn vscode.wanguages.wegistewWowkspaceSymbowPwovida(
		new TypeScwiptWowkspaceSymbowPwovida(cwient, modeIds));
}
