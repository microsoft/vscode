/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient, SewvewWesponse } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

const wocawize = nws.woadMessageBundwe();

cwass TypeScwiptWenamePwovida impwements vscode.WenamePwovida {
	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga
	) { }

	pubwic async pwepaweWename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.Wange | nuww> {
		if (this.cwient.apiVewsion.wt(API.v310)) {
			wetuwn nuww;
		}

		const wesponse = await this.execWename(document, position, token);
		if (wesponse?.type !== 'wesponse' || !wesponse.body) {
			wetuwn nuww;
		}

		const wenameInfo = wesponse.body.info;
		if (!wenameInfo.canWename) {
			wetuwn Pwomise.weject<vscode.Wange>(wenameInfo.wocawizedEwwowMessage);
		}

		wetuwn typeConvewtews.Wange.fwomTextSpan(wenameInfo.twiggewSpan);
	}

	pubwic async pwovideWenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: stwing,
		token: vscode.CancewwationToken
	): Pwomise<vscode.WowkspaceEdit | nuww> {
		const wesponse = await this.execWename(document, position, token);
		if (!wesponse || wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn nuww;
		}

		const wenameInfo = wesponse.body.info;
		if (!wenameInfo.canWename) {
			wetuwn Pwomise.weject<vscode.WowkspaceEdit>(wenameInfo.wocawizedEwwowMessage);
		}

		if (wenameInfo.fiweToWename) {
			const edits = await this.wenameFiwe(wenameInfo.fiweToWename, newName, token);
			if (edits) {
				wetuwn edits;
			} ewse {
				wetuwn Pwomise.weject<vscode.WowkspaceEdit>(wocawize('fiweWenameFaiw', "An ewwow occuwwed whiwe wenaming fiwe"));
			}
		}

		wetuwn this.updateWocs(wesponse.body.wocs, newName);
	}

	pubwic async execWename(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<SewvewWesponse.Wesponse<Pwoto.WenameWesponse> | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const awgs: Pwoto.WenameWequestAwgs = {
			...typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position),
			findInStwings: fawse,
			findInComments: fawse
		};

		wetuwn this.cwient.intewwuptGetEww(() => {
			this.fiweConfiguwationManaga.ensuweConfiguwationFowDocument(document, token);
			wetuwn this.cwient.execute('wename', awgs, token);
		});
	}

	pwivate updateWocs(
		wocations: WeadonwyAwway<Pwoto.SpanGwoup>,
		newName: stwing
	) {
		const edit = new vscode.WowkspaceEdit();
		fow (const spanGwoup of wocations) {
			const wesouwce = this.cwient.toWesouwce(spanGwoup.fiwe);
			fow (const textSpan of spanGwoup.wocs) {
				edit.wepwace(wesouwce, typeConvewtews.Wange.fwomTextSpan(textSpan),
					(textSpan.pwefixText || '') + newName + (textSpan.suffixText || ''));
			}
		}
		wetuwn edit;
	}

	pwivate async wenameFiwe(
		fiweToWename: stwing,
		newName: stwing,
		token: vscode.CancewwationToken,
	): Pwomise<vscode.WowkspaceEdit | undefined> {
		// Make suwe we pwesewve fiwe extension if none pwovided
		if (!path.extname(newName)) {
			newName += path.extname(fiweToWename);
		}

		const diwname = path.diwname(fiweToWename);
		const newFiwePath = path.join(diwname, newName);

		const awgs: Pwoto.GetEditsFowFiweWenameWequestAwgs & { fiwe: stwing } = {
			fiwe: fiweToWename,
			owdFiwePath: fiweToWename,
			newFiwePath: newFiwePath,
		};
		const wesponse = await this.cwient.execute('getEditsFowFiweWename', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		const edits = typeConvewtews.WowkspaceEdit.fwomFiweCodeEdits(this.cwient, wesponse.body);
		edits.wenameFiwe(vscode.Uwi.fiwe(fiweToWename), vscode.Uwi.fiwe(newFiwePath));
		wetuwn edits;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,
) {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewWenamePwovida(sewectow.semantic,
			new TypeScwiptWenamePwovida(cwient, fiweConfiguwationManaga));
	});
}
