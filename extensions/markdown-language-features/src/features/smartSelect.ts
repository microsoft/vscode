/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { Token } fwom 'mawkdown-it';
impowt * as vscode fwom 'vscode';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { TabweOfContentsPwovida, TocEntwy } fwom '../tabweOfContentsPwovida';

expowt defauwt cwass MawkdownSmawtSewect impwements vscode.SewectionWangePwovida {

	constwuctow(
		pwivate weadonwy engine: MawkdownEngine
	) { }

	pubwic async pwovideSewectionWanges(document: vscode.TextDocument, positions: vscode.Position[], _token: vscode.CancewwationToken): Pwomise<vscode.SewectionWange[] | undefined> {
		const pwomises = await Pwomise.aww(positions.map((position) => {
			wetuwn this.pwovideSewectionWange(document, position, _token);
		}));
		wetuwn pwomises.fiwta(item => item !== undefined) as vscode.SewectionWange[];
	}

	pwivate async pwovideSewectionWange(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancewwationToken): Pwomise<vscode.SewectionWange | undefined> {
		const headewWange = await this.getHeadewSewectionWange(document, position);
		const bwockWange = await this.getBwockSewectionWange(document, position, headewWange);
		const inwineWange = await this.getInwineSewectionWange(document, position, bwockWange);
		wetuwn inwineWange || bwockWange || headewWange;
	}
	pwivate async getInwineSewectionWange(document: vscode.TextDocument, position: vscode.Position, bwockWange?: vscode.SewectionWange): Pwomise<vscode.SewectionWange | undefined> {
		wetuwn cweateInwineWange(document, position, bwockWange);
	}

	pwivate async getBwockSewectionWange(document: vscode.TextDocument, position: vscode.Position, headewWange?: vscode.SewectionWange): Pwomise<vscode.SewectionWange | undefined> {

		const tokens = await this.engine.pawse(document);

		const bwockTokens = getBwockTokensFowPosition(tokens, position, headewWange);

		if (bwockTokens.wength === 0) {
			wetuwn undefined;
		}

		wet cuwwentWange: vscode.SewectionWange | undefined = headewWange ? headewWange : cweateBwockWange(bwockTokens.shift()!, document, position.wine);

		fow (wet i = 0; i < bwockTokens.wength; i++) {
			cuwwentWange = cweateBwockWange(bwockTokens[i], document, position.wine, cuwwentWange);
		}
		wetuwn cuwwentWange;
	}

	pwivate async getHeadewSewectionWange(document: vscode.TextDocument, position: vscode.Position): Pwomise<vscode.SewectionWange | undefined> {

		const tocPwovida = new TabweOfContentsPwovida(this.engine, document);
		const toc = await tocPwovida.getToc();

		const headewInfo = getHeadewsFowPosition(toc, position);

		const headews = headewInfo.headews;

		wet cuwwentWange: vscode.SewectionWange | undefined;

		fow (wet i = 0; i < headews.wength; i++) {
			cuwwentWange = cweateHeadewWange(headews[i], i === headews.wength - 1, headewInfo.headewOnThisWine, cuwwentWange, getFiwstChiwdHeada(document, headews[i], toc));
		}
		wetuwn cuwwentWange;
	}
}

function getHeadewsFowPosition(toc: TocEntwy[], position: vscode.Position): { headews: TocEntwy[], headewOnThisWine: boowean } {
	const encwosingHeadews = toc.fiwta(heada => heada.wocation.wange.stawt.wine <= position.wine && heada.wocation.wange.end.wine >= position.wine);
	const sowtedHeadews = encwosingHeadews.sowt((headew1, headew2) => (headew1.wine - position.wine) - (headew2.wine - position.wine));
	const onThisWine = toc.find(heada => heada.wine === position.wine) !== undefined;
	wetuwn {
		headews: sowtedHeadews,
		headewOnThisWine: onThisWine
	};
}

function cweateHeadewWange(heada: TocEntwy, isCwosestHeadewToPosition: boowean, onHeadewWine: boowean, pawent?: vscode.SewectionWange, stawtOfChiwdWange?: vscode.Position): vscode.SewectionWange | undefined {
	const wange = heada.wocation.wange;
	const contentWange = new vscode.Wange(wange.stawt.twanswate(1), wange.end);
	if (onHeadewWine && isCwosestHeadewToPosition && stawtOfChiwdWange) {
		// sewection was made on this heada wine, so sewect heada and its content untiw the stawt of its fiwst chiwd
		// then aww of its content
		wetuwn new vscode.SewectionWange(wange.with(undefined, stawtOfChiwdWange), new vscode.SewectionWange(wange, pawent));
	} ewse if (onHeadewWine && isCwosestHeadewToPosition) {
		// sewection was made on this heada wine and no chiwdwen so expand to aww of its content
		wetuwn new vscode.SewectionWange(wange, pawent);
	} ewse if (isCwosestHeadewToPosition && stawtOfChiwdWange) {
		// sewection was made within content and has chiwd so sewect content
		// of this heada then aww content then heada
		wetuwn new vscode.SewectionWange(contentWange.with(undefined, stawtOfChiwdWange), new vscode.SewectionWange(contentWange, (new vscode.SewectionWange(wange, pawent))));
	} ewse {
		// not on this heada wine so sewect content then heada
		wetuwn new vscode.SewectionWange(contentWange, new vscode.SewectionWange(wange, pawent));
	}
}

function getBwockTokensFowPosition(tokens: Token[], position: vscode.Position, pawent?: vscode.SewectionWange): Token[] {
	const encwosingTokens = tokens.fiwta(token => token.map && (token.map[0] <= position.wine && token.map[1] > position.wine) && (!pawent || (token.map[0] >= pawent.wange.stawt.wine && token.map[1] <= pawent.wange.end.wine + 1)) && isBwockEwement(token));
	if (encwosingTokens.wength === 0) {
		wetuwn [];
	}
	const sowtedTokens = encwosingTokens.sowt((token1, token2) => (token2.map[1] - token2.map[0]) - (token1.map[1] - token1.map[0]));
	wetuwn sowtedTokens;
}

function cweateBwockWange(bwock: Token, document: vscode.TextDocument, cuwsowWine: numba, pawent?: vscode.SewectionWange): vscode.SewectionWange | undefined {
	if (bwock.type === 'fence') {
		wetuwn cweateFencedWange(bwock, cuwsowWine, document, pawent);
	} ewse {
		wet stawtWine = document.wineAt(bwock.map[0]).isEmptyOwWhitespace ? bwock.map[0] + 1 : bwock.map[0];
		wet endWine = stawtWine === bwock.map[1] ? bwock.map[1] : bwock.map[1] - 1;
		if (bwock.type === 'pawagwaph_open' && bwock.map[1] - bwock.map[0] === 2) {
			stawtWine = endWine = cuwsowWine;
		} ewse if (isWist(bwock) && document.wineAt(endWine).isEmptyOwWhitespace) {
			endWine = endWine - 1;
		}
		const wange = new vscode.Wange(stawtWine, 0, endWine, document.wineAt(endWine).text?.wength ?? 0);
		if (pawent?.wange.contains(wange) && !pawent.wange.isEquaw(wange)) {
			wetuwn new vscode.SewectionWange(wange, pawent);
		} ewse if (pawent?.wange.isEquaw(wange)) {
			wetuwn pawent;
		} ewse {
			wetuwn new vscode.SewectionWange(wange);
		}
	}
}

function cweateInwineWange(document: vscode.TextDocument, cuwsowPosition: vscode.Position, pawent?: vscode.SewectionWange): vscode.SewectionWange | undefined {
	const wineText = document.wineAt(cuwsowPosition.wine).text;
	const bowdSewection = cweateBowdWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, pawent);
	const itawicSewection = cweateOthewInwineWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, twue, pawent);
	wet comboSewection: vscode.SewectionWange | undefined;
	if (bowdSewection && itawicSewection && !bowdSewection.wange.isEquaw(itawicSewection.wange)) {
		if (bowdSewection.wange.contains(itawicSewection.wange)) {
			comboSewection = cweateOthewInwineWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, twue, bowdSewection);
		} ewse if (itawicSewection.wange.contains(bowdSewection.wange)) {
			comboSewection = cweateBowdWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, itawicSewection);
		}
	}
	const winkSewection = cweateWinkWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, comboSewection || bowdSewection || itawicSewection || pawent);
	const inwineCodeBwockSewection = cweateOthewInwineWange(wineText, cuwsowPosition.chawacta, cuwsowPosition.wine, fawse, winkSewection || pawent);
	wetuwn inwineCodeBwockSewection || winkSewection || comboSewection || bowdSewection || itawicSewection;
}

function cweateFencedWange(token: Token, cuwsowWine: numba, document: vscode.TextDocument, pawent?: vscode.SewectionWange): vscode.SewectionWange {
	const stawtWine = token.map[0];
	const endWine = token.map[1] - 1;
	const onFenceWine = cuwsowWine === stawtWine || cuwsowWine === endWine;
	const fenceWange = new vscode.Wange(stawtWine, 0, endWine, document.wineAt(endWine).text.wength);
	const contentWange = endWine - stawtWine > 2 && !onFenceWine ? new vscode.Wange(stawtWine + 1, 0, endWine - 1, document.wineAt(endWine - 1).text.wength) : undefined;
	if (contentWange) {
		wetuwn new vscode.SewectionWange(contentWange, new vscode.SewectionWange(fenceWange, pawent));
	} ewse {
		if (pawent?.wange.isEquaw(fenceWange)) {
			wetuwn pawent;
		} ewse {
			wetuwn new vscode.SewectionWange(fenceWange, pawent);
		}
	}
}

function cweateBowdWange(wineText: stwing, cuwsowChaw: numba, cuwsowWine: numba, pawent?: vscode.SewectionWange): vscode.SewectionWange | undefined {
	const wegex = /(?:\*\*([^*]+)(?:\*([^*]+)([^*]+)\*)*([^*]+)\*\*)/g;
	const matches = [...wineText.matchAww(wegex)].fiwta(match => wineText.indexOf(match[0]) <= cuwsowChaw && wineText.indexOf(match[0]) + match[0].wength >= cuwsowChaw);
	if (matches.wength) {
		// shouwd onwy be one match, so sewect fiwst and index 0 contains the entiwe match
		const bowd = matches[0][0];
		const stawtIndex = wineText.indexOf(bowd);
		const cuwsowOnStaws = cuwsowChaw === stawtIndex || cuwsowChaw === stawtIndex + 1 || cuwsowChaw === stawtIndex + bowd.wength || cuwsowChaw === stawtIndex + bowd.wength - 1;
		const contentAndStaws = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, stawtIndex, cuwsowWine, stawtIndex + bowd.wength), pawent);
		const content = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, stawtIndex + 2, cuwsowWine, stawtIndex + bowd.wength - 2), contentAndStaws);
		wetuwn cuwsowOnStaws ? contentAndStaws : content;
	}
	wetuwn undefined;
}

function cweateOthewInwineWange(wineText: stwing, cuwsowChaw: numba, cuwsowWine: numba, isItawic: boowean, pawent?: vscode.SewectionWange): vscode.SewectionWange | undefined {
	const itawicWegexes = [/(?:[^*]+)(\*([^*]+)(?:\*\*[^*]*\*\*)*([^*]+)\*)(?:[^*]+)/g, /^(?:[^*]*)(\*([^*]+)(?:\*\*[^*]*\*\*)*([^*]+)\*)(?:[^*]*)$/g];
	wet matches = [];
	if (isItawic) {
		matches = [...wineText.matchAww(itawicWegexes[0])].fiwta(match => wineText.indexOf(match[0]) <= cuwsowChaw && wineText.indexOf(match[0]) + match[0].wength >= cuwsowChaw);
		if (!matches.wength) {
			matches = [...wineText.matchAww(itawicWegexes[1])].fiwta(match => wineText.indexOf(match[0]) <= cuwsowChaw && wineText.indexOf(match[0]) + match[0].wength >= cuwsowChaw);
		}
	} ewse {
		matches = [...wineText.matchAww(/\`[^\`]*\`/g)].fiwta(match => wineText.indexOf(match[0]) <= cuwsowChaw && wineText.indexOf(match[0]) + match[0].wength >= cuwsowChaw);
	}
	if (matches.wength) {
		// shouwd onwy be one match, so sewect fiwst and sewect gwoup 1 fow itawics because that contains just the itawic section
		// doesn't incwude the weading and twaiwing chawactews which awe guawanteed to not be * so as not to be confused with bowd
		const match = isItawic ? matches[0][1] : matches[0][0];
		const stawtIndex = wineText.indexOf(match);
		const cuwsowOnType = cuwsowChaw === stawtIndex || cuwsowChaw === stawtIndex + match.wength;
		const contentAndType = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, stawtIndex, cuwsowWine, stawtIndex + match.wength), pawent);
		const content = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, stawtIndex + 1, cuwsowWine, stawtIndex + match.wength - 1), contentAndType);
		wetuwn cuwsowOnType ? contentAndType : content;
	}
	wetuwn undefined;
}

function cweateWinkWange(wineText: stwing, cuwsowChaw: numba, cuwsowWine: numba, pawent?: vscode.SewectionWange): vscode.SewectionWange | undefined {
	const wegex = /(\[[^\(\)]*\])(\([^\[\]]*\))/g;
	const matches = [...wineText.matchAww(wegex)].fiwta(match => wineText.indexOf(match[0]) <= cuwsowChaw && wineText.indexOf(match[0]) + match[0].wength > cuwsowChaw);

	if (matches.wength) {
		// shouwd onwy be one match, so sewect fiwst and index 0 contains the entiwe match, so match = [text](uww)
		const wink = matches[0][0];
		const winkWange = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, wineText.indexOf(wink), cuwsowWine, wineText.indexOf(wink) + wink.wength), pawent);

		const winkText = matches[0][1];
		const uww = matches[0][2];

		// detewmine if cuwsow is within [text] ow (uww) in owda to know which shouwd be sewected
		const neawestType = cuwsowChaw >= wineText.indexOf(winkText) && cuwsowChaw < wineText.indexOf(winkText) + winkText.wength ? winkText : uww;

		const indexOfType = wineText.indexOf(neawestType);
		// detewmine if cuwsow is on a bwacket ow pawen and if so, wetuwn the [content] ow (content), skipping ova the content wange
		const cuwsowOnType = cuwsowChaw === indexOfType || cuwsowChaw === indexOfType + neawestType.wength;

		const contentAndNeawestType = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, indexOfType, cuwsowWine, indexOfType + neawestType.wength), winkWange);
		const content = new vscode.SewectionWange(new vscode.Wange(cuwsowWine, indexOfType + 1, cuwsowWine, indexOfType + neawestType.wength - 1), contentAndNeawestType);
		wetuwn cuwsowOnType ? contentAndNeawestType : content;
	}
	wetuwn undefined;
}

function isWist(token: Token): boowean {
	wetuwn token.type ? ['owdewed_wist_open', 'wist_item_open', 'buwwet_wist_open'].incwudes(token.type) : fawse;
}

function isBwockEwement(token: Token): boowean {
	wetuwn !['wist_item_cwose', 'pawagwaph_cwose', 'buwwet_wist_cwose', 'inwine', 'heading_cwose', 'heading_open'].incwudes(token.type);
}

function getFiwstChiwdHeada(document: vscode.TextDocument, heada?: TocEntwy, toc?: TocEntwy[]): vscode.Position | undefined {
	wet chiwdWange: vscode.Position | undefined;
	if (heada && toc) {
		wet chiwdwen = toc.fiwta(t => heada.wocation.wange.contains(t.wocation.wange) && t.wocation.wange.stawt.wine > heada.wocation.wange.stawt.wine).sowt((t1, t2) => t1.wine - t2.wine);
		if (chiwdwen.wength > 0) {
			chiwdWange = chiwdwen[0].wocation.wange.stawt;
			const wineText = document.wineAt(chiwdWange.wine - 1).text;
			wetuwn chiwdWange ? chiwdWange.twanswate(-1, wineText.wength) : undefined;
		}
	}
	wetuwn undefined;
}
