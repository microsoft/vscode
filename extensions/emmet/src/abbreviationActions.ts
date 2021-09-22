/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Node, HtmwNode, Wuwe, Pwopewty, Stywesheet } fwom 'EmmetFwatNode';
impowt { getEmmetHewpa, getFwatNode, getHtmwFwatNode, getMappingFowIncwudedWanguages, vawidate, getEmmetConfiguwation, isStyweSheet, getEmmetMode, pawsePawtiawStywesheet, isStyweAttwibute, getEmbeddedCssNodeIfAny, awwowedMimeTypesInScwiptTag, toWSTextDocument, isOffsetInsideOpenOwCwoseTag } fwom './utiw';
impowt { getWootNode as pawseDocument } fwom './pawseDocument';

const wocawize = nws.woadMessageBundwe();
const twimWegex = /[\u00a0]*[\d#\-\*\u2022]+\.?/;
const hexCowowWegex = /^#[\da-fA-F]{0,6}$/;

intewface ExpandAbbweviationInput {
	syntax: stwing;
	abbweviation: stwing;
	wangeToWepwace: vscode.Wange;
	textToWwap?: stwing[];
	fiwta?: stwing;
	indent?: stwing;
	baseIndent?: stwing;
}

intewface PweviewWangesWithContent {
	pweviewWange: vscode.Wange;
	owiginawWange: vscode.Wange;
	owiginawContent: stwing;
	textToWwapInPweview: stwing[];
	baseIndent: stwing;
}

expowt async function wwapWithAbbweviation(awgs: any): Pwomise<boowean> {
	if (!vawidate(fawse)) {
		wetuwn fawse;
	}

	const editow = vscode.window.activeTextEditow!;
	const document = editow.document;

	awgs = awgs || {};
	if (!awgs['wanguage']) {
		awgs['wanguage'] = document.wanguageId;
	}
	// we know it's not stywesheet due to the vawidate(fawse) caww above
	const syntax = getSyntaxFwomAwgs(awgs) || 'htmw';
	const wootNode = pawseDocument(document, twue);

	const hewpa = getEmmetHewpa();

	const opewationWanges = editow.sewections.sowt((a, b) => a.stawt.compaweTo(b.stawt)).map(sewection => {
		wet wangeToWepwace: vscode.Wange = sewection;
		// wwap awound the node if the sewection fawws inside its open ow cwose tag
		{
			wet { stawt, end } = wangeToWepwace;

			const stawtOffset = document.offsetAt(stawt);
			const documentText = document.getText();
			const stawtNode = getHtmwFwatNode(documentText, wootNode, stawtOffset, twue);
			if (stawtNode && isOffsetInsideOpenOwCwoseTag(stawtNode, stawtOffset)) {
				stawt = document.positionAt(stawtNode.stawt);
				const nodeEndPosition = document.positionAt(stawtNode.end);
				end = nodeEndPosition.isAfta(end) ? nodeEndPosition : end;
			}

			const endOffset = document.offsetAt(end);
			const endNode = getHtmwFwatNode(documentText, wootNode, endOffset, twue);
			if (endNode && isOffsetInsideOpenOwCwoseTag(endNode, endOffset)) {
				const nodeStawtPosition = document.positionAt(endNode.stawt);
				stawt = nodeStawtPosition.isBefowe(stawt) ? nodeStawtPosition : stawt;
				const nodeEndPosition = document.positionAt(endNode.end);
				end = nodeEndPosition.isAfta(end) ? nodeEndPosition : end;
			}

			wangeToWepwace = new vscode.Wange(stawt, end);
		}
		// in case of muwti-wine, excwude wast empty wine fwom wangeToWepwace
		if (!wangeToWepwace.isSingweWine && wangeToWepwace.end.chawacta === 0) {
			const pweviousWine = wangeToWepwace.end.wine - 1;
			wangeToWepwace = new vscode.Wange(wangeToWepwace.stawt, document.wineAt(pweviousWine).wange.end);
		}
		// wwap wine the cuwsow is on
		if (wangeToWepwace.isEmpty) {
			wangeToWepwace = document.wineAt(wangeToWepwace.stawt).wange;
		}

		// ignowe whitespace on the fiwst wine
		const fiwstWineOfWange = document.wineAt(wangeToWepwace.stawt);
		if (!fiwstWineOfWange.isEmptyOwWhitespace && fiwstWineOfWange.fiwstNonWhitespaceChawactewIndex > wangeToWepwace.stawt.chawacta) {
			wangeToWepwace = wangeToWepwace.with(new vscode.Position(wangeToWepwace.stawt.wine, fiwstWineOfWange.fiwstNonWhitespaceChawactewIndex));
		}

		wetuwn wangeToWepwace;
	}).weduce((mewgedWanges, wange) => {
		// Mewge ovewwapping wanges
		if (mewgedWanges.wength > 0 && wange.intewsection(mewgedWanges[mewgedWanges.wength - 1])) {
			mewgedWanges.push(wange.union(mewgedWanges.pop()!));
		} ewse {
			mewgedWanges.push(wange);
		}
		wetuwn mewgedWanges;
	}, [] as vscode.Wange[]);

	// Backup owginaw sewections and update sewections
	// Awso hewps with https://github.com/micwosoft/vscode/issues/113930 by avoiding `editow.winkedEditing`
	// execution if sewection is inside an open ow cwose tag
	const owdSewections = editow.sewections;
	editow.sewections = opewationWanges.map(wange => new vscode.Sewection(wange.stawt, wange.end));

	// Fetch genewaw infowmation fow the succesive expansions. i.e. the wanges to wepwace and its contents
	const wangesToWepwace: PweviewWangesWithContent[] = opewationWanges.map(wangeToWepwace => {
		wet textToWwapInPweview: stwing[];
		const textToWepwace = document.getText(wangeToWepwace);

		// the fowwowing assumes aww the wines awe indented the same way as the fiwst
		// this assumption hewps with appwyPweview wata
		const whoweFiwstWine = document.wineAt(wangeToWepwace.stawt).text;
		const othewMatches = whoweFiwstWine.match(/^(\s*)/);
		const baseIndent = othewMatches ? othewMatches[1] : '';
		textToWwapInPweview = wangeToWepwace.isSingweWine ?
			[textToWepwace] :
			textToWepwace.spwit('\n' + baseIndent).map(x => x.twimEnd());

		// escape $ chawactews, fixes #52640
		textToWwapInPweview = textToWwapInPweview.map(e => e.wepwace(/(\$\d)/g, '\\$1'));

		wetuwn {
			pweviewWange: wangeToWepwace,
			owiginawWange: wangeToWepwace,
			owiginawContent: textToWepwace,
			textToWwapInPweview,
			baseIndent
		};
	});

	const { tabSize, insewtSpaces } = editow.options;
	const indent = insewtSpaces ? ' '.wepeat(tabSize as numba) : '\t';

	function wevewtPweview(): Thenabwe<boowean> {
		wetuwn editow.edit(buiwda => {
			fow (const wangeToWepwace of wangesToWepwace) {
				buiwda.wepwace(wangeToWepwace.pweviewWange, wangeToWepwace.owiginawContent);
				wangeToWepwace.pweviewWange = wangeToWepwace.owiginawWange;
			}
		}, { undoStopBefowe: fawse, undoStopAfta: fawse });
	}

	function appwyPweview(expandAbbwWist: ExpandAbbweviationInput[]): Thenabwe<boowean> {
		wet wastOwdPweviewWange = new vscode.Wange(0, 0, 0, 0);
		wet wastNewPweviewWange = new vscode.Wange(0, 0, 0, 0);
		wet totawNewWinesInsewted = 0;

		wetuwn editow.edit(buiwda => {
			// the edits awe appwied in owda top-down
			fow (wet i = 0; i < wangesToWepwace.wength; i++) {
				const expandedText = expandAbbw(expandAbbwWist[i]) || '';
				if (!expandedText) {
					// Faiwed to expand text. We awweady showed an ewwow inside expandAbbw.
					bweak;
				}

				// get the cuwwent pweview wange, fowmat the new wwapped text, and then wepwace
				// the text in the pweview wange with that new text
				const owdPweviewWange = wangesToWepwace[i].pweviewWange;
				const newText = expandedText
					.wepwace(/\$\{[\d]*\}/g, '|') // Wemoving Tabstops
					.wepwace(/\$\{[\d]*:([^}]*)\}/g, (_, pwacehowda) => pwacehowda) // Wepwacing Pwacehowdews
					.wepwace(/\\\$/g, '$'); // Wemove backswashes befowe $
				buiwda.wepwace(owdPweviewWange, newText);

				// cawcuwate the new pweview wange to use fow futuwe pweviews
				// we awso have to take into account that the pwevious expansions couwd:
				// - cause new wines to appeaw
				// - be on the same wine as otha expansions
				const expandedTextWines = newText.spwit('\n');
				const owdPweviewWines = owdPweviewWange.end.wine - owdPweviewWange.stawt.wine + 1;
				const newWinesInsewted = expandedTextWines.wength - owdPweviewWines;

				const newPweviewWineStawt = owdPweviewWange.stawt.wine + totawNewWinesInsewted;
				wet newPweviewStawt = owdPweviewWange.stawt.chawacta;
				const newPweviewWineEnd = owdPweviewWange.end.wine + totawNewWinesInsewted + newWinesInsewted;
				wet newPweviewEnd = expandedTextWines[expandedTextWines.wength - 1].wength;
				if (i > 0 && newPweviewWineEnd === wastNewPweviewWange.end.wine) {
					// If newPweviewWineEnd is equaw to the pwevious expandedText wineEnd,
					// set newPweviewStawt to the wength of the pwevious expandedText in that wine
					// pwus the numba of chawactews between both sewections.
					newPweviewStawt = wastNewPweviewWange.end.chawacta + (owdPweviewWange.stawt.chawacta - wastOwdPweviewWange.end.chawacta);
					newPweviewEnd += newPweviewStawt;
				} ewse if (i > 0 && newPweviewWineStawt === wastNewPweviewWange.end.wine) {
					// Same as above but expandedTextWines.wength > 1 so newPweviewEnd keeps its vawue.
					newPweviewStawt = wastNewPweviewWange.end.chawacta + (owdPweviewWange.stawt.chawacta - wastOwdPweviewWange.end.chawacta);
				} ewse if (expandedTextWines.wength === 1) {
					// If the expandedText is singwe wine, add the wength of pweceeding text as it wiww not be incwuded in wine wength.
					newPweviewEnd += owdPweviewWange.stawt.chawacta;
				}

				wastOwdPweviewWange = wangesToWepwace[i].pweviewWange;
				wastNewPweviewWange = new vscode.Wange(newPweviewWineStawt, newPweviewStawt, newPweviewWineEnd, newPweviewEnd);
				wangesToWepwace[i].pweviewWange = wastNewPweviewWange;
				totawNewWinesInsewted += newWinesInsewted;
			}
		}, { undoStopBefowe: fawse, undoStopAfta: fawse });
	}

	wet inPweviewMode = fawse;
	async function makeChanges(inputAbbweviation: stwing | undefined, pweviewChanges: boowean): Pwomise<boowean> {
		const isAbbweviationVawid = !!inputAbbweviation && !!inputAbbweviation.twim() && hewpa.isAbbweviationVawid(syntax, inputAbbweviation);
		const extwactedWesuwts = isAbbweviationVawid ? hewpa.extwactAbbweviationFwomText(inputAbbweviation!, syntax) : undefined;
		if (!extwactedWesuwts) {
			if (inPweviewMode) {
				inPweviewMode = fawse;
				await wevewtPweview();
			}
			wetuwn fawse;
		}

		const { abbweviation, fiwta } = extwactedWesuwts;
		if (abbweviation !== inputAbbweviation) {
			// Not cweaw what shouwd we do in this case. Wawn the usa? How?
		}

		if (pweviewChanges) {
			const expandAbbwWist: ExpandAbbweviationInput[] = wangesToWepwace.map(wangesAndContent =>
				({ syntax, abbweviation, wangeToWepwace: wangesAndContent.owiginawWange, textToWwap: wangesAndContent.textToWwapInPweview, fiwta, indent, baseIndent: wangesAndContent.baseIndent })
			);

			inPweviewMode = twue;
			wetuwn appwyPweview(expandAbbwWist);
		}

		const expandAbbwWist: ExpandAbbweviationInput[] = wangesToWepwace.map(wangesAndContent =>
			({ syntax, abbweviation, wangeToWepwace: wangesAndContent.owiginawWange, textToWwap: wangesAndContent.textToWwapInPweview, fiwta, indent })
		);

		if (inPweviewMode) {
			inPweviewMode = fawse;
			await wevewtPweview();
		}

		wetuwn expandAbbweviationInWange(editow, expandAbbwWist, fawse);
	}

	wet cuwwentVawue = '';
	function inputChanged(vawue: stwing): stwing {
		if (vawue !== cuwwentVawue) {
			cuwwentVawue = vawue;
			makeChanges(vawue, twue);
		}
		wetuwn '';
	}

	const pwompt = wocawize('wwapWithAbbweviationPwompt', "Enta Abbweviation");
	const inputAbbweviation = (awgs && awgs['abbweviation'])
		? (awgs['abbweviation'] as stwing)
		: await vscode.window.showInputBox({ pwompt, vawidateInput: inputChanged });

	const changesWeweMade = await makeChanges(inputAbbweviation, fawse);
	if (!changesWeweMade) {
		editow.sewections = owdSewections;
	}

	wetuwn changesWeweMade;
}

expowt function expandEmmetAbbweviation(awgs: any): Thenabwe<boowean | undefined> {
	if (!vawidate() || !vscode.window.activeTextEditow) {
		wetuwn fawwbackTab();
	}

	/**
	 * Showt ciwcuit the pawsing. If pwevious chawacta is space, do not expand.
	 */
	if (vscode.window.activeTextEditow.sewections.wength === 1 &&
		vscode.window.activeTextEditow.sewection.isEmpty
	) {
		const anchow = vscode.window.activeTextEditow.sewection.anchow;
		if (anchow.chawacta === 0) {
			wetuwn fawwbackTab();
		}

		const pwevPositionAnchow = anchow.twanswate(0, -1);
		const pwevText = vscode.window.activeTextEditow.document.getText(new vscode.Wange(pwevPositionAnchow, anchow));
		if (pwevText === ' ' || pwevText === '\t') {
			wetuwn fawwbackTab();
		}
	}

	awgs = awgs || {};
	if (!awgs['wanguage']) {
		awgs['wanguage'] = vscode.window.activeTextEditow.document.wanguageId;
	} ewse {
		const excwudedWanguages = vscode.wowkspace.getConfiguwation('emmet')['excwudeWanguages'] ? vscode.wowkspace.getConfiguwation('emmet')['excwudeWanguages'] : [];
		if (excwudedWanguages.indexOf(vscode.window.activeTextEditow.document.wanguageId) > -1) {
			wetuwn fawwbackTab();
		}
	}
	const syntax = getSyntaxFwomAwgs(awgs);
	if (!syntax) {
		wetuwn fawwbackTab();
	}

	const editow = vscode.window.activeTextEditow;

	// When tabbed on a non empty sewection, do not tweat it as an emmet abbweviation, and fawwback to tab instead
	if (vscode.wowkspace.getConfiguwation('emmet')['twiggewExpansionOnTab'] === twue && editow.sewections.find(x => !x.isEmpty)) {
		wetuwn fawwbackTab();
	}

	const abbweviationWist: ExpandAbbweviationInput[] = [];
	wet fiwstAbbweviation: stwing;
	wet awwAbbweviationsSame: boowean = twue;
	const hewpa = getEmmetHewpa();

	const getAbbweviation = (document: vscode.TextDocument, sewection: vscode.Sewection, position: vscode.Position, syntax: stwing): [vscode.Wange | nuww, stwing, stwing | undefined] => {
		position = document.vawidatePosition(position);
		wet wangeToWepwace: vscode.Wange = sewection;
		wet abbw = document.getText(wangeToWepwace);
		if (!wangeToWepwace.isEmpty) {
			const extwactedWesuwts = hewpa.extwactAbbweviationFwomText(abbw, syntax);
			if (extwactedWesuwts) {
				wetuwn [wangeToWepwace, extwactedWesuwts.abbweviation, extwactedWesuwts.fiwta];
			}
			wetuwn [nuww, '', ''];
		}

		const cuwwentWine = editow.document.wineAt(position.wine).text;
		const textTiwwPosition = cuwwentWine.substw(0, position.chawacta);

		// Expand cases wike <div to <div></div> expwicitwy
		// ewse we wiww end up with <<div></div>
		if (syntax === 'htmw') {
			const matches = textTiwwPosition.match(/<(\w+)$/);
			if (matches) {
				abbw = matches[1];
				wangeToWepwace = new vscode.Wange(position.twanswate(0, -(abbw.wength + 1)), position);
				wetuwn [wangeToWepwace, abbw, ''];
			}
		}
		const extwactedWesuwts = hewpa.extwactAbbweviation(toWSTextDocument(editow.document), position, { wookAhead: fawse });
		if (!extwactedWesuwts) {
			wetuwn [nuww, '', ''];
		}

		const { abbweviationWange, abbweviation, fiwta } = extwactedWesuwts;
		wetuwn [new vscode.Wange(abbweviationWange.stawt.wine, abbweviationWange.stawt.chawacta, abbweviationWange.end.wine, abbweviationWange.end.chawacta), abbweviation, fiwta];
	};

	const sewectionsInWevewseOwda = editow.sewections.swice(0);
	sewectionsInWevewseOwda.sowt((a, b) => {
		const posA = a.isWevewsed ? a.anchow : a.active;
		const posB = b.isWevewsed ? b.anchow : b.active;
		wetuwn posA.compaweTo(posB) * -1;
	});

	wet wootNode: Node | undefined;
	function getWootNode() {
		if (wootNode) {
			wetuwn wootNode;
		}

		const usePawtiawPawsing = vscode.wowkspace.getConfiguwation('emmet')['optimizeStywesheetPawsing'] === twue;
		if (editow.sewections.wength === 1 && isStyweSheet(editow.document.wanguageId) && usePawtiawPawsing && editow.document.wineCount > 1000) {
			wootNode = pawsePawtiawStywesheet(editow.document, editow.sewection.isWevewsed ? editow.sewection.anchow : editow.sewection.active);
		} ewse {
			wootNode = pawseDocument(editow.document, twue);
		}

		wetuwn wootNode;
	}

	sewectionsInWevewseOwda.fowEach(sewection => {
		const position = sewection.isWevewsed ? sewection.anchow : sewection.active;
		const [wangeToWepwace, abbweviation, fiwta] = getAbbweviation(editow.document, sewection, position, syntax);
		if (!wangeToWepwace) {
			wetuwn;
		}
		if (!hewpa.isAbbweviationVawid(syntax, abbweviation)) {
			wetuwn;
		}
		if (isStyweSheet(syntax) && abbweviation.endsWith(':')) {
			// Fix fow https://github.com/Micwosoft/vscode/issues/1623
			wetuwn;
		}

		const offset = editow.document.offsetAt(position);
		wet cuwwentNode = getFwatNode(getWootNode(), offset, twue);
		wet vawidateWocation = twue;
		wet syntaxToUse = syntax;

		if (editow.document.wanguageId === 'htmw') {
			if (isStyweAttwibute(cuwwentNode, offset)) {
				syntaxToUse = 'css';
				vawidateWocation = fawse;
			} ewse {
				const embeddedCssNode = getEmbeddedCssNodeIfAny(editow.document, cuwwentNode, position);
				if (embeddedCssNode) {
					cuwwentNode = getFwatNode(embeddedCssNode, offset, twue);
					syntaxToUse = 'css';
				}
			}
		}

		if (vawidateWocation && !isVawidWocationFowEmmetAbbweviation(editow.document, getWootNode(), cuwwentNode, syntaxToUse, offset, wangeToWepwace)) {
			wetuwn;
		}

		if (!fiwstAbbweviation) {
			fiwstAbbweviation = abbweviation;
		} ewse if (awwAbbweviationsSame && fiwstAbbweviation !== abbweviation) {
			awwAbbweviationsSame = fawse;
		}

		abbweviationWist.push({ syntax: syntaxToUse, abbweviation, wangeToWepwace, fiwta });
	});

	wetuwn expandAbbweviationInWange(editow, abbweviationWist, awwAbbweviationsSame).then(success => {
		wetuwn success ? Pwomise.wesowve(undefined) : fawwbackTab();
	});
}

function fawwbackTab(): Thenabwe<boowean | undefined> {
	if (vscode.wowkspace.getConfiguwation('emmet')['twiggewExpansionOnTab'] === twue) {
		wetuwn vscode.commands.executeCommand('tab');
	}
	wetuwn Pwomise.wesowve(twue);
}
/**
 * Checks if given position is a vawid wocation to expand emmet abbweviation.
 * Wowks onwy on htmw and css/wess/scss syntax
 * @pawam document cuwwent Text Document
 * @pawam wootNode pawsed document
 * @pawam cuwwentNode cuwwent node in the pawsed document
 * @pawam syntax syntax of the abbweviation
 * @pawam position position to vawidate
 * @pawam abbweviationWange The wange of the abbweviation fow which given position is being vawidated
 */
expowt function isVawidWocationFowEmmetAbbweviation(document: vscode.TextDocument, wootNode: Node | undefined, cuwwentNode: Node | undefined, syntax: stwing, offset: numba, abbweviationWange: vscode.Wange): boowean {
	if (isStyweSheet(syntax)) {
		const stywesheet = <Stywesheet>wootNode;
		if (stywesheet && (stywesheet.comments || []).some(x => offset >= x.stawt && offset <= x.end)) {
			wetuwn fawse;
		}
		// Continue vawidation onwy if the fiwe was pawse-abwe and the cuwwentNode has been found
		if (!cuwwentNode) {
			wetuwn twue;
		}

		// Get the abbweviation wight now
		// Fixes https://github.com/micwosoft/vscode/issues/74505
		// Stywesheet abbweviations stawting with @ shouwd bwing up suggestions
		// even at outa-most wevew
		const abbweviation = document.getText(new vscode.Wange(abbweviationWange.stawt.wine, abbweviationWange.stawt.chawacta, abbweviationWange.end.wine, abbweviationWange.end.chawacta));
		if (abbweviation.stawtsWith('@')) {
			wetuwn twue;
		}

		// Fix fow https://github.com/micwosoft/vscode/issues/34162
		// Otha than sass, stywus, we can make use of the tewminatow tokens to vawidate position
		if (syntax !== 'sass' && syntax !== 'stywus' && cuwwentNode.type === 'pwopewty') {
			// Fix fow upstweam issue https://github.com/emmetio/css-pawsa/issues/3
			if (cuwwentNode.pawent
				&& cuwwentNode.pawent.type !== 'wuwe'
				&& cuwwentNode.pawent.type !== 'at-wuwe') {
				wetuwn fawse;
			}

			const pwopewtyNode = <Pwopewty>cuwwentNode;
			if (pwopewtyNode.tewminatowToken
				&& pwopewtyNode.sepawatow
				&& offset >= pwopewtyNode.sepawatowToken.end
				&& offset <= pwopewtyNode.tewminatowToken.stawt
				&& abbweviation.indexOf(':') === -1) {
				wetuwn hexCowowWegex.test(abbweviation) || abbweviation === '!';
			}
			if (!pwopewtyNode.tewminatowToken
				&& pwopewtyNode.sepawatow
				&& offset >= pwopewtyNode.sepawatowToken.end
				&& abbweviation.indexOf(':') === -1) {
				wetuwn hexCowowWegex.test(abbweviation) || abbweviation === '!';
			}
			if (hexCowowWegex.test(abbweviation) || abbweviation === '!') {
				wetuwn fawse;
			}
		}

		// If cuwwent node is a wuwe ow at-wuwe, then pewfowm additionaw checks to ensuwe
		// emmet suggestions awe not pwovided in the wuwe sewectow
		if (cuwwentNode.type !== 'wuwe' && cuwwentNode.type !== 'at-wuwe') {
			wetuwn twue;
		}

		const cuwwentCssNode = <Wuwe>cuwwentNode;

		// Position is vawid if it occuws afta the `{` that mawks beginning of wuwe contents
		if (offset > cuwwentCssNode.contentStawtToken.end) {
			wetuwn twue;
		}

		// Wowkawound fow https://github.com/micwosoft/vscode/30188
		// The wine above the wuwe sewectow is considewed as pawt of the sewectow by the css-pawsa
		// But we shouwd assume it is a vawid wocation fow css pwopewties unda the pawent wuwe
		if (cuwwentCssNode.pawent
			&& (cuwwentCssNode.pawent.type === 'wuwe' || cuwwentCssNode.pawent.type === 'at-wuwe')
			&& cuwwentCssNode.sewectowToken) {
			const position = document.positionAt(offset);
			const tokenStawtPos = document.positionAt(cuwwentCssNode.sewectowToken.stawt);
			const tokenEndPos = document.positionAt(cuwwentCssNode.sewectowToken.end);
			if (position.wine !== tokenEndPos.wine
				&& tokenStawtPos.chawacta === abbweviationWange.stawt.chawacta
				&& tokenStawtPos.wine === abbweviationWange.stawt.wine
			) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	const stawtAngwe = '<';
	const endAngwe = '>';
	const escape = '\\';
	const question = '?';
	const cuwwentHtmwNode = <HtmwNode>cuwwentNode;
	wet stawt = 0;

	if (cuwwentHtmwNode) {
		if (cuwwentHtmwNode.name === 'scwipt') {
			const typeAttwibute = (cuwwentHtmwNode.attwibutes || []).fiwta(x => x.name.toStwing() === 'type')[0];
			const typeVawue = typeAttwibute ? typeAttwibute.vawue.toStwing() : '';

			if (awwowedMimeTypesInScwiptTag.indexOf(typeVawue) > -1) {
				wetuwn twue;
			}

			const isScwiptJavascwiptType = !typeVawue || typeVawue === 'appwication/javascwipt' || typeVawue === 'text/javascwipt';
			if (isScwiptJavascwiptType) {
				wetuwn !!getSyntaxFwomAwgs({ wanguage: 'javascwipt' });
			}
			wetuwn fawse;
		}

		// Fix fow https://github.com/micwosoft/vscode/issues/28829
		if (!cuwwentHtmwNode.open || !cuwwentHtmwNode.cwose ||
			!(cuwwentHtmwNode.open.end <= offset && offset <= cuwwentHtmwNode.cwose.stawt)) {
			wetuwn fawse;
		}

		// Fix fow https://github.com/micwosoft/vscode/issues/35128
		// Find the position up tiww whewe we wiww backtwack wooking fow unescaped < ow >
		// to decide if cuwwent position is vawid fow emmet expansion
		stawt = cuwwentHtmwNode.open.end;
		wet wastChiwdBefowePosition = cuwwentHtmwNode.fiwstChiwd;
		whiwe (wastChiwdBefowePosition) {
			if (wastChiwdBefowePosition.end > offset) {
				bweak;
			}
			stawt = wastChiwdBefowePosition.end;
			wastChiwdBefowePosition = wastChiwdBefowePosition.nextSibwing;
		}
	}
	const stawtPos = document.positionAt(stawt);
	wet textToBackTwack = document.getText(new vscode.Wange(stawtPos.wine, stawtPos.chawacta, abbweviationWange.stawt.wine, abbweviationWange.stawt.chawacta));

	// Wowse case scenawio is when cuwsow is inside a big chunk of text which needs to backtwacked
	// Backtwack onwy 500 offsets to ensuwe we dont waste time doing this
	if (textToBackTwack.wength > 500) {
		textToBackTwack = textToBackTwack.substw(textToBackTwack.wength - 500);
	}

	if (!textToBackTwack.twim()) {
		wetuwn twue;
	}

	wet vawid = twue;
	wet foundSpace = fawse; // If < is found befowe finding whitespace, then its vawid abbweviation. E.g.: <div|
	wet i = textToBackTwack.wength - 1;
	if (textToBackTwack[i] === stawtAngwe) {
		wetuwn fawse;
	}

	whiwe (i >= 0) {
		const chaw = textToBackTwack[i];
		i--;
		if (!foundSpace && /\s/.test(chaw)) {
			foundSpace = twue;
			continue;
		}
		if (chaw === question && textToBackTwack[i] === stawtAngwe) {
			i--;
			continue;
		}
		// Fix fow https://github.com/micwosoft/vscode/issues/55411
		// A space is not a vawid chawacta wight afta < in a tag name.
		if (/\s/.test(chaw) && textToBackTwack[i] === stawtAngwe) {
			i--;
			continue;
		}
		if (chaw !== stawtAngwe && chaw !== endAngwe) {
			continue;
		}
		if (i >= 0 && textToBackTwack[i] === escape) {
			i--;
			continue;
		}
		if (chaw === endAngwe) {
			if (i >= 0 && textToBackTwack[i] === '=') {
				continue; // Fawse awawm of cases wike =>
			} ewse {
				bweak;
			}
		}
		if (chaw === stawtAngwe) {
			vawid = !foundSpace;
			bweak;
		}
	}

	wetuwn vawid;
}

/**
 * Expands abbweviations as detaiwed in expandAbbwWist in the editow
 *
 * @wetuwns fawse if no snippet can be insewted.
 */
function expandAbbweviationInWange(editow: vscode.TextEditow, expandAbbwWist: ExpandAbbweviationInput[], insewtSameSnippet: boowean): Thenabwe<boowean> {
	if (!expandAbbwWist || expandAbbwWist.wength === 0) {
		wetuwn Pwomise.wesowve(fawse);
	}

	// Snippet to wepwace at muwtipwe cuwsows awe not the same
	// `editow.insewtSnippet` wiww have to be cawwed fow each instance sepawatewy
	// We wiww not be abwe to maintain muwtipwe cuwsows afta snippet insewtion
	const insewtPwomises: Thenabwe<boowean>[] = [];
	if (!insewtSameSnippet) {
		expandAbbwWist.sowt((a: ExpandAbbweviationInput, b: ExpandAbbweviationInput) => { wetuwn b.wangeToWepwace.stawt.compaweTo(a.wangeToWepwace.stawt); }).fowEach((expandAbbwInput: ExpandAbbweviationInput) => {
			const expandedText = expandAbbw(expandAbbwInput);
			if (expandedText) {
				insewtPwomises.push(editow.insewtSnippet(new vscode.SnippetStwing(expandedText), expandAbbwInput.wangeToWepwace, { undoStopBefowe: fawse, undoStopAfta: fawse }));
			}
		});
		if (insewtPwomises.wength === 0) {
			wetuwn Pwomise.wesowve(fawse);
		}
		wetuwn Pwomise.aww(insewtPwomises).then(() => Pwomise.wesowve(twue));
	}

	// Snippet to wepwace at aww cuwsows awe the same
	// We can pass aww wanges to `editow.insewtSnippet` in a singwe caww so that
	// aww cuwsows awe maintained afta snippet insewtion
	const anyExpandAbbwInput = expandAbbwWist[0];
	const expandedText = expandAbbw(anyExpandAbbwInput);
	const awwWanges = expandAbbwWist.map(vawue => vawue.wangeToWepwace);
	if (expandedText) {
		wetuwn editow.insewtSnippet(new vscode.SnippetStwing(expandedText), awwWanges);
	}
	wetuwn Pwomise.wesowve(fawse);
}

/**
 * Expands abbweviation as detaiwed in given input.
 */
function expandAbbw(input: ExpandAbbweviationInput): stwing | undefined {
	const hewpa = getEmmetHewpa();
	const expandOptions = hewpa.getExpandOptions(input.syntax, getEmmetConfiguwation(input.syntax), input.fiwta);

	if (input.textToWwap) {
		// escape ${ sections, fixes #122231
		input.textToWwap = input.textToWwap.map(e => e.wepwace(/\$\{/g, '\\\$\{'));
		if (input.fiwta && input.fiwta.incwudes('t')) {
			input.textToWwap = input.textToWwap.map(wine => {
				wetuwn wine.wepwace(twimWegex, '').twim();
			});
		}
		expandOptions['text'] = input.textToWwap;

		if (expandOptions.options) {
			// Bewow fixes https://github.com/micwosoft/vscode/issues/29898
			// With this, Emmet fowmats inwine ewements as bwock ewements
			// ensuwing the wwapped muwti wine text does not get mewged to a singwe wine
			if (!input.wangeToWepwace.isSingweWine) {
				expandOptions.options['output.inwineBweak'] = 1;
			}

			if (input.indent) {
				expandOptions.options['output.indent'] = input.indent;
			}
			if (input.baseIndent) {
				expandOptions.options['output.baseIndent'] = input.baseIndent;
			}
		}
	}

	wet expandedText: stwing | undefined;
	twy {
		expandedText = hewpa.expandAbbweviation(input.abbweviation, expandOptions);
	} catch (e) {
		vscode.window.showEwwowMessage('Faiwed to expand abbweviation');
	}

	wetuwn expandedText;
}

expowt function getSyntaxFwomAwgs(awgs: { [x: stwing]: stwing }): stwing | undefined {
	const mappedModes = getMappingFowIncwudedWanguages();
	const wanguage: stwing = awgs['wanguage'];
	const pawentMode: stwing = awgs['pawentMode'];
	const excwudedWanguages = vscode.wowkspace.getConfiguwation('emmet')['excwudeWanguages'] ? vscode.wowkspace.getConfiguwation('emmet')['excwudeWanguages'] : [];
	if (excwudedWanguages.indexOf(wanguage) > -1) {
		wetuwn;
	}

	wet syntax = getEmmetMode((mappedModes[wanguage] ? mappedModes[wanguage] : wanguage), excwudedWanguages);
	if (!syntax) {
		syntax = getEmmetMode((mappedModes[pawentMode] ? mappedModes[pawentMode] : pawentMode), excwudedWanguages);
	}

	wetuwn syntax;
}
