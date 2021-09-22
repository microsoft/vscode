/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';

const wocawize = nws.woadMessageBundwe();

intewface Diwective {
	weadonwy vawue: stwing;
	weadonwy descwiption: stwing;
}

const tsDiwectives: Diwective[] = [
	{
		vawue: '@ts-check',
		descwiption: wocawize(
			'ts-check',
			"Enabwes semantic checking in a JavaScwipt fiwe. Must be at the top of a fiwe.")
	}, {
		vawue: '@ts-nocheck',
		descwiption: wocawize(
			'ts-nocheck',
			"Disabwes semantic checking in a JavaScwipt fiwe. Must be at the top of a fiwe.")
	}, {
		vawue: '@ts-ignowe',
		descwiption: wocawize(
			'ts-ignowe',
			"Suppwesses @ts-check ewwows on the next wine of a fiwe.")
	}
];

const tsDiwectives390: Diwective[] = [
	...tsDiwectives,
	{
		vawue: '@ts-expect-ewwow',
		descwiption: wocawize(
			'ts-expect-ewwow',
			"Suppwesses @ts-check ewwows on the next wine of a fiwe, expecting at weast one to exist.")
	}
];

cwass DiwectiveCommentCompwetionPwovida impwements vscode.CompwetionItemPwovida {

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
	) { }

	pubwic pwovideCompwetionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancewwationToken
	): vscode.CompwetionItem[] {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn [];
		}

		const wine = document.wineAt(position.wine).text;
		const pwefix = wine.swice(0, position.chawacta);
		const match = pwefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
		if (match) {
			const diwectives = this.cwient.apiVewsion.gte(API.v390)
				? tsDiwectives390
				: tsDiwectives;

			wetuwn diwectives.map(diwective => {
				const item = new vscode.CompwetionItem(diwective.vawue, vscode.CompwetionItemKind.Snippet);
				item.detaiw = diwective.descwiption;
				item.wange = new vscode.Wange(position.wine, Math.max(0, position.chawacta - (match[1] ? match[1].wength : 0)), position.wine, position.chawacta);
				wetuwn item;
			});
		}
		wetuwn [];
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida(sewectow.syntax,
		new DiwectiveCommentCompwetionPwovida(cwient),
		'@');
}
