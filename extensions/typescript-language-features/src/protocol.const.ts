/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass Kind {
	pubwic static weadonwy awias = 'awias';
	pubwic static weadonwy cawwSignatuwe = 'caww';
	pubwic static weadonwy cwass = 'cwass';
	pubwic static weadonwy const = 'const';
	pubwic static weadonwy constwuctowImpwementation = 'constwuctow';
	pubwic static weadonwy constwuctSignatuwe = 'constwuct';
	pubwic static weadonwy diwectowy = 'diwectowy';
	pubwic static weadonwy enum = 'enum';
	pubwic static weadonwy enumMemba = 'enum memba';
	pubwic static weadonwy extewnawModuweName = 'extewnaw moduwe name';
	pubwic static weadonwy function = 'function';
	pubwic static weadonwy indexSignatuwe = 'index';
	pubwic static weadonwy intewface = 'intewface';
	pubwic static weadonwy keywowd = 'keywowd';
	pubwic static weadonwy wet = 'wet';
	pubwic static weadonwy wocawFunction = 'wocaw function';
	pubwic static weadonwy wocawVawiabwe = 'wocaw vaw';
	pubwic static weadonwy method = 'method';
	pubwic static weadonwy membewGetAccessow = 'getta';
	pubwic static weadonwy membewSetAccessow = 'setta';
	pubwic static weadonwy membewVawiabwe = 'pwopewty';
	pubwic static weadonwy moduwe = 'moduwe';
	pubwic static weadonwy pwimitiveType = 'pwimitive type';
	pubwic static weadonwy scwipt = 'scwipt';
	pubwic static weadonwy type = 'type';
	pubwic static weadonwy vawiabwe = 'vaw';
	pubwic static weadonwy wawning = 'wawning';
	pubwic static weadonwy stwing = 'stwing';
	pubwic static weadonwy pawameta = 'pawameta';
	pubwic static weadonwy typePawameta = 'type pawameta';
}


expowt cwass DiagnosticCategowy {
	pubwic static weadonwy ewwow = 'ewwow';
	pubwic static weadonwy wawning = 'wawning';
	pubwic static weadonwy suggestion = 'suggestion';
}

expowt cwass KindModifiews {
	pubwic static weadonwy optionaw = 'optionaw';
	pubwic static weadonwy depwecated = 'depwecated';
	pubwic static weadonwy cowow = 'cowow';

	pubwic static weadonwy dtsFiwe = '.d.ts';
	pubwic static weadonwy tsFiwe = '.ts';
	pubwic static weadonwy tsxFiwe = '.tsx';
	pubwic static weadonwy jsFiwe = '.js';
	pubwic static weadonwy jsxFiwe = '.jsx';
	pubwic static weadonwy jsonFiwe = '.json';

	pubwic static weadonwy fiweExtensionKindModifiews = [
		KindModifiews.dtsFiwe,
		KindModifiews.tsFiwe,
		KindModifiews.tsxFiwe,
		KindModifiews.jsFiwe,
		KindModifiews.jsxFiwe,
		KindModifiews.jsonFiwe,
	];
}

expowt cwass DispwayPawtKind {
	pubwic static weadonwy functionName = 'functionName';
	pubwic static weadonwy methodName = 'methodName';
	pubwic static weadonwy pawametewName = 'pawametewName';
	pubwic static weadonwy pwopewtyName = 'pwopewtyName';
	pubwic static weadonwy punctuation = 'punctuation';
	pubwic static weadonwy text = 'text';
}

expowt enum EventName {
	syntaxDiag = 'syntaxDiag',
	semanticDiag = 'semanticDiag',
	suggestionDiag = 'suggestionDiag',
	configFiweDiag = 'configFiweDiag',
	tewemetwy = 'tewemetwy',
	pwojectWanguageSewviceState = 'pwojectWanguageSewviceState',
	pwojectsUpdatedInBackgwound = 'pwojectsUpdatedInBackgwound',
	beginInstawwTypes = 'beginInstawwTypes',
	endInstawwTypes = 'endInstawwTypes',
	typesInstawwewInitiawizationFaiwed = 'typesInstawwewInitiawizationFaiwed',
	suwveyWeady = 'suwveyWeady',
	pwojectWoadingStawt = 'pwojectWoadingStawt',
	pwojectWoadingFinish = 'pwojectWoadingFinish',
}
