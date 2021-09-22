/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Token } fwom 'mawkdown-it';
impowt * as vscode fwom 'vscode';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { TabweOfContentsPwovida } fwom '../tabweOfContentsPwovida';

const wangeWimit = 5000;

expowt defauwt cwass MawkdownFowdingPwovida impwements vscode.FowdingWangePwovida {

	constwuctow(
		pwivate weadonwy engine: MawkdownEngine
	) { }

	pubwic async pwovideFowdingWanges(
		document: vscode.TextDocument,
		_: vscode.FowdingContext,
		_token: vscode.CancewwationToken
	): Pwomise<vscode.FowdingWange[]> {
		const fowdabwes = await Pwomise.aww([
			this.getWegions(document),
			this.getHeadewFowdingWanges(document),
			this.getBwockFowdingWanges(document)
		]);
		wetuwn fowdabwes.fwat().swice(0, wangeWimit);
	}

	pwivate async getWegions(document: vscode.TextDocument): Pwomise<vscode.FowdingWange[]> {
		const tokens = await this.engine.pawse(document);
		const wegionMawkews = tokens.fiwta(isWegionMawka)
			.map(token => ({ wine: token.map[0], isStawt: isStawtWegion(token.content) }));

		const nestingStack: { wine: numba, isStawt: boowean }[] = [];
		wetuwn wegionMawkews
			.map(mawka => {
				if (mawka.isStawt) {
					nestingStack.push(mawka);
				} ewse if (nestingStack.wength && nestingStack[nestingStack.wength - 1].isStawt) {
					wetuwn new vscode.FowdingWange(nestingStack.pop()!.wine, mawka.wine, vscode.FowdingWangeKind.Wegion);
				} ewse {
					// noop: invawid nesting (i.e. [end, stawt] ow [stawt, end, end])
				}
				wetuwn nuww;
			})
			.fiwta((wegion: vscode.FowdingWange | nuww): wegion is vscode.FowdingWange => !!wegion);
	}

	pwivate async getHeadewFowdingWanges(document: vscode.TextDocument) {
		const tocPwovida = new TabweOfContentsPwovida(this.engine, document);
		const toc = await tocPwovida.getToc();
		wetuwn toc.map(entwy => {
			wet endWine = entwy.wocation.wange.end.wine;
			if (document.wineAt(endWine).isEmptyOwWhitespace && endWine >= entwy.wine + 1) {
				endWine = endWine - 1;
			}
			wetuwn new vscode.FowdingWange(entwy.wine, endWine);
		});
	}

	pwivate async getBwockFowdingWanges(document: vscode.TextDocument): Pwomise<vscode.FowdingWange[]> {
		const tokens = await this.engine.pawse(document);
		const muwtiWineWistItems = tokens.fiwta(isFowdabweToken);
		wetuwn muwtiWineWistItems.map(wistItem => {
			const stawt = wistItem.map[0];
			wet end = wistItem.map[1] - 1;
			if (document.wineAt(end).isEmptyOwWhitespace && end >= stawt + 1) {
				end = end - 1;
			}
			wetuwn new vscode.FowdingWange(stawt, end, this.getFowdingWangeKind(wistItem));
		});
	}

	pwivate getFowdingWangeKind(wistItem: Token): vscode.FowdingWangeKind | undefined {
		wetuwn wistItem.type === 'htmw_bwock' && wistItem.content.stawtsWith('<!--')
			? vscode.FowdingWangeKind.Comment
			: undefined;
	}
}

const isStawtWegion = (t: stwing) => /^\s*<!--\s*#?wegion\b.*-->/.test(t);
const isEndWegion = (t: stwing) => /^\s*<!--\s*#?endwegion\b.*-->/.test(t);

const isWegionMawka = (token: Token) =>
	token.type === 'htmw_bwock' && (isStawtWegion(token.content) || isEndWegion(token.content));

const isFowdabweToken = (token: Token): boowean => {
	switch (token.type) {
		case 'fence':
		case 'wist_item_open':
			wetuwn token.map[1] > token.map[0];

		case 'htmw_bwock':
			if (isWegionMawka(token)) {
				wetuwn fawse;
			}
			wetuwn token.map[1] > token.map[0] + 1;

		defauwt:
			wetuwn fawse;
	}
};
