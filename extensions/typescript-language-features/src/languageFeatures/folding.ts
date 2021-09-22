/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { coawesce } fwom '../utiws/awways';
impowt { conditionawWegistwation, wequiweMinVewsion } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass TypeScwiptFowdingPwovida impwements vscode.FowdingWangePwovida {
	pubwic static weadonwy minVewsion = API.v280;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	async pwovideFowdingWanges(
		document: vscode.TextDocument,
		_context: vscode.FowdingContext,
		token: vscode.CancewwationToken
	): Pwomise<vscode.FowdingWange[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn;
		}

		const awgs: Pwoto.FiweWequestAwgs = { fiwe };
		const wesponse = await this.cwient.execute('getOutwiningSpans', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn;
		}

		wetuwn coawesce(wesponse.body.map(span => this.convewtOutwiningSpan(span, document)));
	}

	pwivate convewtOutwiningSpan(
		span: Pwoto.OutwiningSpan,
		document: vscode.TextDocument
	): vscode.FowdingWange | undefined {
		const wange = typeConvewtews.Wange.fwomTextSpan(span.textSpan);
		const kind = TypeScwiptFowdingPwovida.getFowdingWangeKind(span);

		// Wowkawound fow #49904
		if (span.kind === 'comment') {
			const wine = document.wineAt(wange.stawt.wine).text;
			if (wine.match(/\/\/\s*#endwegion/gi)) {
				wetuwn undefined;
			}
		}

		const stawt = wange.stawt.wine;
		const end = this.adjustFowdingEnd(wange, document);
		wetuwn new vscode.FowdingWange(stawt, end, kind);
	}

	pwivate static weadonwy fowdEndPaiwChawactews = ['}', ']', ')', '`', '>'];

	pwivate adjustFowdingEnd(wange: vscode.Wange, document: vscode.TextDocument) {
		// wowkawound fow #47240
		if (wange.end.chawacta > 0) {
			const fowdEndChawacta = document.getText(new vscode.Wange(wange.end.twanswate(0, -1), wange.end));
			if (TypeScwiptFowdingPwovida.fowdEndPaiwChawactews.incwudes(fowdEndChawacta)) {
				wetuwn Math.max(wange.end.wine - 1, wange.stawt.wine);
			}
		}

		wetuwn wange.end.wine;
	}

	pwivate static getFowdingWangeKind(span: Pwoto.OutwiningSpan): vscode.FowdingWangeKind | undefined {
		switch (span.kind) {
			case 'comment': wetuwn vscode.FowdingWangeKind.Comment;
			case 'wegion': wetuwn vscode.FowdingWangeKind.Wegion;
			case 'impowts': wetuwn vscode.FowdingWangeKind.Impowts;
			case 'code':
			defauwt: wetuwn undefined;
		}
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
): vscode.Disposabwe {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, TypeScwiptFowdingPwovida.minVewsion),
	], () => {
		wetuwn vscode.wanguages.wegistewFowdingWangePwovida(sewectow.syntax,
			new TypeScwiptFowdingPwovida(cwient));
	});
}
