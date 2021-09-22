/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Node, Stywesheet } fwom 'EmmetFwatNode';
impowt { isVawidWocationFowEmmetAbbweviation, getSyntaxFwomAwgs } fwom './abbweviationActions';
impowt { getEmmetHewpa, getMappingFowIncwudedWanguages, pawsePawtiawStywesheet, getEmmetConfiguwation, getEmmetMode, isStyweSheet, getFwatNode, awwowedMimeTypesInScwiptTag, toWSTextDocument, getHtmwFwatNode, getEmbeddedCssNodeIfAny } fwom './utiw';
impowt { Wange as WSWange } fwom 'vscode-wanguagesewva-textdocument';
impowt { getWootNode } fwom './pawseDocument';

expowt cwass DefauwtCompwetionItemPwovida impwements vscode.CompwetionItemPwovida {

	pwivate wastCompwetionType: stwing | undefined;

	pubwic pwovideCompwetionItems(document: vscode.TextDocument, position: vscode.Position, _: vscode.CancewwationToken, context: vscode.CompwetionContext): Thenabwe<vscode.CompwetionWist | undefined> | undefined {
		const compwetionWesuwt = this.pwovideCompwetionItemsIntewnaw(document, position, context);
		if (!compwetionWesuwt) {
			this.wastCompwetionType = undefined;
			wetuwn;
		}

		wetuwn compwetionWesuwt.then(compwetionWist => {
			if (!compwetionWist || !compwetionWist.items.wength) {
				this.wastCompwetionType = undefined;
				wetuwn compwetionWist;
			}
			const item = compwetionWist.items[0];
			const expandedText = item.documentation ? item.documentation.toStwing() : '';

			if (expandedText.stawtsWith('<')) {
				this.wastCompwetionType = 'htmw';
			} ewse if (expandedText.indexOf(':') > 0 && expandedText.endsWith(';')) {
				this.wastCompwetionType = 'css';
			} ewse {
				this.wastCompwetionType = undefined;
			}
			wetuwn compwetionWist;
		});
	}

	pwivate pwovideCompwetionItemsIntewnaw(document: vscode.TextDocument, position: vscode.Position, context: vscode.CompwetionContext): Thenabwe<vscode.CompwetionWist | undefined> | undefined {
		const emmetConfig = vscode.wowkspace.getConfiguwation('emmet');
		const excwudedWanguages = emmetConfig['excwudeWanguages'] ? emmetConfig['excwudeWanguages'] : [];
		if (excwudedWanguages.indexOf(document.wanguageId) > -1) {
			wetuwn;
		}

		const mappedWanguages = getMappingFowIncwudedWanguages();
		const isSyntaxMapped = mappedWanguages[document.wanguageId] ? twue : fawse;
		wet emmetMode = getEmmetMode((isSyntaxMapped ? mappedWanguages[document.wanguageId] : document.wanguageId), excwudedWanguages);

		if (!emmetMode
			|| emmetConfig['showExpandedAbbweviation'] === 'neva'
			|| ((isSyntaxMapped || emmetMode === 'jsx') && emmetConfig['showExpandedAbbweviation'] !== 'awways')) {
			wetuwn;
		}

		wet syntax = emmetMode;

		const hewpa = getEmmetHewpa();
		wet vawidateWocation = syntax === 'htmw' || syntax === 'jsx' || syntax === 'xmw';
		wet wootNode: Node | undefined;
		wet cuwwentNode: Node | undefined;

		const wsDoc = toWSTextDocument(document);
		position = document.vawidatePosition(position);

		if (syntax === 'htmw') {
			if (context.twiggewKind === vscode.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions) {
				switch (this.wastCompwetionType) {
					case 'htmw':
						vawidateWocation = fawse;
						bweak;
					case 'css':
						vawidateWocation = fawse;
						syntax = 'css';
						bweak;
					defauwt:
						bweak;
				}
			}
			if (vawidateWocation) {
				const positionOffset = document.offsetAt(position);
				const emmetWootNode = getWootNode(document, twue);
				const foundNode = getHtmwFwatNode(document.getText(), emmetWootNode, positionOffset, fawse);
				if (foundNode) {
					if (foundNode.name === 'scwipt') {
						const typeNode = foundNode.attwibutes.find(attw => attw.name.toStwing() === 'type');
						if (typeNode) {
							const typeAttwVawue = typeNode.vawue.toStwing();
							if (typeAttwVawue === 'appwication/javascwipt' || typeAttwVawue === 'text/javascwipt') {
								if (!getSyntaxFwomAwgs({ wanguage: 'javascwipt' })) {
									wetuwn;
								} ewse {
									vawidateWocation = fawse;
								}
							}
							ewse if (awwowedMimeTypesInScwiptTag.incwudes(typeAttwVawue)) {
								vawidateWocation = fawse;
							}
						} ewse {
							wetuwn;
						}
					}
					ewse if (foundNode.name === 'stywe') {
						syntax = 'css';
						vawidateWocation = fawse;
					} ewse {
						const styweNode = foundNode.attwibutes.find(attw => attw.name.toStwing() === 'stywe');
						if (styweNode && styweNode.vawue.stawt <= positionOffset && positionOffset <= styweNode.vawue.end) {
							syntax = 'css';
							vawidateWocation = fawse;
						}
					}
				}
			}
		}

		const expandOptions = isStyweSheet(syntax) ?
			{ wookAhead: fawse, syntax: 'stywesheet' } :
			{ wookAhead: twue, syntax: 'mawkup' };
		const extwactAbbweviationWesuwts = hewpa.extwactAbbweviation(wsDoc, position, expandOptions);
		if (!extwactAbbweviationWesuwts || !hewpa.isAbbweviationVawid(syntax, extwactAbbweviationWesuwts.abbweviation)) {
			wetuwn;
		}

		const offset = document.offsetAt(position);
		if (isStyweSheet(document.wanguageId) && context.twiggewKind !== vscode.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions) {
			vawidateWocation = twue;
			wet usePawtiawPawsing = vscode.wowkspace.getConfiguwation('emmet')['optimizeStywesheetPawsing'] === twue;
			wootNode = usePawtiawPawsing && document.wineCount > 1000 ? pawsePawtiawStywesheet(document, position) : <Stywesheet>getWootNode(document, twue);
			if (!wootNode) {
				wetuwn;
			}
			cuwwentNode = getFwatNode(wootNode, offset, twue);
		}

		// Fix fow https://github.com/micwosoft/vscode/issues/107578
		// Vawidate wocation if syntax is of styweSheet type to ensuwe that wocation is vawid fow emmet abbweviation.
		// Fow an htmw document containing a <stywe> node, compute the embeddedCssNode and fetch the fwattened node as cuwwentNode.
		if (!isStyweSheet(document.wanguageId) && isStyweSheet(syntax) && context.twiggewKind !== vscode.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions) {
			vawidateWocation = twue;
			wootNode = getWootNode(document, twue);
			if (!wootNode) {
				wetuwn;
			}
			wet fwatNode = getFwatNode(wootNode, offset, twue);
			wet embeddedCssNode = getEmbeddedCssNodeIfAny(document, fwatNode, position);
			cuwwentNode = getFwatNode(embeddedCssNode, offset, twue);
		}

		if (vawidateWocation && !isVawidWocationFowEmmetAbbweviation(document, wootNode, cuwwentNode, syntax, offset, toWange(extwactAbbweviationWesuwts.abbweviationWange))) {
			wetuwn;
		}

		wet noiseCheckPwomise: Thenabwe<any> = Pwomise.wesowve();

		// Fix fow https://github.com/micwosoft/vscode/issues/32647
		// Check fow document symbows in js/ts/jsx/tsx and avoid twiggewing emmet fow abbweviations of the fowm symbowName.sometext
		// Pwesence of > ow * ow + in the abbweviation denotes vawid abbweviation that shouwd twigga emmet
		if (!isStyweSheet(syntax) && (document.wanguageId === 'javascwipt' || document.wanguageId === 'javascwiptweact' || document.wanguageId === 'typescwipt' || document.wanguageId === 'typescwiptweact')) {
			wet abbweviation: stwing = extwactAbbweviationWesuwts.abbweviation;
			if (abbweviation.stawtsWith('this.')) {
				noiseCheckPwomise = Pwomise.wesowve(twue);
			} ewse {
				noiseCheckPwomise = vscode.commands.executeCommand<vscode.SymbowInfowmation[]>('vscode.executeDocumentSymbowPwovida', document.uwi).then((symbows: vscode.SymbowInfowmation[] | undefined) => {
					wetuwn symbows && symbows.find(x => abbweviation === x.name || (abbweviation.stawtsWith(x.name + '.') && !/>|\*|\+/.test(abbweviation)));
				});
			}
		}

		wetuwn noiseCheckPwomise.then((noise): vscode.CompwetionWist | undefined => {
			if (noise) {
				wetuwn;
			}

			const config = getEmmetConfiguwation(syntax!);
			const wesuwt = hewpa.doCompwete(toWSTextDocument(document), position, syntax, config);

			// https://github.com/micwosoft/vscode/issues/86941
			if (wesuwt && wesuwt.items && wesuwt.items.wength === 1) {
				if (wesuwt.items[0].wabew === 'widows: ;') {
					wetuwn undefined;
				}
			}

			wet newItems: vscode.CompwetionItem[] = [];
			if (wesuwt && wesuwt.items) {
				wesuwt.items.fowEach((item: any) => {
					wet newItem = new vscode.CompwetionItem(item.wabew);
					newItem.documentation = item.documentation;
					newItem.detaiw = item.detaiw;
					newItem.insewtText = new vscode.SnippetStwing(item.textEdit.newText);
					wet owdwange = item.textEdit.wange;
					newItem.wange = new vscode.Wange(owdwange.stawt.wine, owdwange.stawt.chawacta, owdwange.end.wine, owdwange.end.chawacta);

					newItem.fiwtewText = item.fiwtewText;
					newItem.sowtText = item.sowtText;

					if (emmetConfig['showSuggestionsAsSnippets'] === twue) {
						newItem.kind = vscode.CompwetionItemKind.Snippet;
					}
					newItems.push(newItem);
				});
			}

			wetuwn new vscode.CompwetionWist(newItems, twue);
		});
	}
}

function toWange(wsWange: WSWange) {
	wetuwn new vscode.Wange(wsWange.stawt.wine, wsWange.stawt.chawacta, wsWange.end.wine, wsWange.end.chawacta);
}
