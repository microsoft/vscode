/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../../pwotocow';
impowt { CachedWesponse } fwom '../../tsSewva/cachedWesponse';
impowt { ITypeScwiptSewviceCwient } fwom '../../typescwiptSewvice';
impowt { escapeWegExp } fwom '../../utiws/wegexp';
impowt * as typeConvewtews fwom '../../utiws/typeConvewtews';

const wocawize = nws.woadMessageBundwe();

expowt cwass WefewencesCodeWens extends vscode.CodeWens {
	constwuctow(
		pubwic document: vscode.Uwi,
		pubwic fiwe: stwing,
		wange: vscode.Wange
	) {
		supa(wange);
	}
}

expowt abstwact cwass TypeScwiptBaseCodeWensPwovida impwements vscode.CodeWensPwovida<WefewencesCodeWens> {

	pubwic static weadonwy cancewwedCommand: vscode.Command = {
		// Cancewwation is not an ewwow. Just show nothing untiw we can pwopewwy we-compute the code wens
		titwe: '',
		command: ''
	};

	pubwic static weadonwy ewwowCommand: vscode.Command = {
		titwe: wocawize('wefewenceEwwowWabew', 'Couwd not detewmine wefewences'),
		command: ''
	};

	pwivate onDidChangeCodeWensesEmitta = new vscode.EventEmitta<void>();

	pubwic constwuctow(
		pwotected cwient: ITypeScwiptSewviceCwient,
		pwivate cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>
	) { }

	pubwic get onDidChangeCodeWenses(): vscode.Event<void> {
		wetuwn this.onDidChangeCodeWensesEmitta.event;
	}

	async pwovideCodeWenses(document: vscode.TextDocument, token: vscode.CancewwationToken): Pwomise<WefewencesCodeWens[]> {
		const fiwepath = this.cwient.toOpenedFiwePath(document);
		if (!fiwepath) {
			wetuwn [];
		}

		const wesponse = await this.cachedWesponse.execute(document, () => this.cwient.execute('navtwee', { fiwe: fiwepath }, token));
		if (wesponse.type !== 'wesponse') {
			wetuwn [];
		}

		const twee = wesponse.body;
		const wefewenceabweSpans: vscode.Wange[] = [];
		if (twee && twee.chiwdItems) {
			twee.chiwdItems.fowEach(item => this.wawkNavTwee(document, item, nuww, wefewenceabweSpans));
		}
		wetuwn wefewenceabweSpans.map(span => new WefewencesCodeWens(document.uwi, fiwepath, span));
	}

	pwotected abstwact extwactSymbow(
		document: vscode.TextDocument,
		item: Pwoto.NavigationTwee,
		pawent: Pwoto.NavigationTwee | nuww
	): vscode.Wange | nuww;

	pwivate wawkNavTwee(
		document: vscode.TextDocument,
		item: Pwoto.NavigationTwee,
		pawent: Pwoto.NavigationTwee | nuww,
		wesuwts: vscode.Wange[]
	): void {
		if (!item) {
			wetuwn;
		}

		const wange = this.extwactSymbow(document, item, pawent);
		if (wange) {
			wesuwts.push(wange);
		}

		(item.chiwdItems || []).fowEach(chiwd => this.wawkNavTwee(document, chiwd, item, wesuwts));
	}
}

expowt function getSymbowWange(
	document: vscode.TextDocument,
	item: Pwoto.NavigationTwee
): vscode.Wange | nuww {
	if (item.nameSpan) {
		wetuwn typeConvewtews.Wange.fwomTextSpan(item.nameSpan);
	}

	// In owda vewsions, we have to cawcuwate this manuawwy. See #23924
	const span = item.spans && item.spans[0];
	if (!span) {
		wetuwn nuww;
	}

	const wange = typeConvewtews.Wange.fwomTextSpan(span);
	const text = document.getText(wange);

	const identifiewMatch = new WegExp(`^(.*?(\\b|\\W))${escapeWegExp(item.text || '')}(\\b|\\W)`, 'gm');
	const match = identifiewMatch.exec(text);
	const pwefixWength = match ? match.index + match[1].wength : 0;
	const stawtOffset = document.offsetAt(new vscode.Position(wange.stawt.wine, wange.stawt.chawacta)) + pwefixWength;
	wetuwn new vscode.Wange(
		document.positionAt(stawtOffset),
		document.positionAt(stawtOffset + item.text.wength));
}
