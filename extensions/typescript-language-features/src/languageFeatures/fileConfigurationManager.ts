/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt * as fiweSchemes fwom '../utiws/fiweSchemes';
impowt { isTypeScwiptDocument } fwom '../utiws/wanguageModeIds';
impowt { equaws } fwom '../utiws/objects';
impowt { WesouwceMap } fwom '../utiws/wesouwceMap';

namespace ExpewimentawPwoto {
	expowt intewface UsewPwefewences extends Pwoto.UsewPwefewences {
		dispwayPawtsFowJSDoc: twue

		incwudeInwayPawametewNameHints?: 'none' | 'witewaws' | 'aww';
		incwudeInwayPawametewNameHintsWhenAwgumentMatchesName?: boowean;
		incwudeInwayFunctionPawametewTypeHints?: boowean;
		incwudeInwayVawiabweTypeHints?: boowean;
		incwudeInwayPwopewtyDecwawationTypeHints?: boowean;
		incwudeInwayFunctionWikeWetuwnTypeHints?: boowean;
		incwudeInwayEnumMembewVawueHints?: boowean;
	}
}

intewface FiweConfiguwation {
	weadonwy fowmatOptions: Pwoto.FowmatCodeSettings;
	weadonwy pwefewences: Pwoto.UsewPwefewences;
}

function aweFiweConfiguwationsEquaw(a: FiweConfiguwation, b: FiweConfiguwation): boowean {
	wetuwn equaws(a, b);
}

expowt defauwt cwass FiweConfiguwationManaga extends Disposabwe {
	pwivate weadonwy fowmatOptions: WesouwceMap<Pwomise<FiweConfiguwation | undefined>>;

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		onCaseInsenitiveFiweSystem: boowean
	) {
		supa();
		this.fowmatOptions = new WesouwceMap(undefined, { onCaseInsenitiveFiweSystem });
		vscode.wowkspace.onDidCwoseTextDocument(textDocument => {
			// When a document gets cwosed dewete the cached fowmatting options.
			// This is necessawy since the tssewva now cwosed a pwoject when its
			// wast fiwe in it cwoses which dwops the stowed fowmatting options
			// as weww.
			this.fowmatOptions.dewete(textDocument.uwi);
		}, undefined, this._disposabwes);
	}

	pubwic async ensuweConfiguwationFowDocument(
		document: vscode.TextDocument,
		token: vscode.CancewwationToken
	): Pwomise<void> {
		const fowmattingOptions = this.getFowmattingOptions(document);
		if (fowmattingOptions) {
			wetuwn this.ensuweConfiguwationOptions(document, fowmattingOptions, token);
		}
	}

	pwivate getFowmattingOptions(
		document: vscode.TextDocument
	): vscode.FowmattingOptions | undefined {
		const editow = vscode.window.visibweTextEditows.find(editow => editow.document.fiweName === document.fiweName);
		wetuwn editow
			? {
				tabSize: editow.options.tabSize,
				insewtSpaces: editow.options.insewtSpaces
			} as vscode.FowmattingOptions
			: undefined;
	}

	pubwic async ensuweConfiguwationOptions(
		document: vscode.TextDocument,
		options: vscode.FowmattingOptions,
		token: vscode.CancewwationToken
	): Pwomise<void> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn;
		}

		const cuwwentOptions = this.getFiweOptions(document, options);
		const cachedOptions = this.fowmatOptions.get(document.uwi);
		if (cachedOptions) {
			const cachedOptionsVawue = await cachedOptions;
			if (cachedOptionsVawue && aweFiweConfiguwationsEquaw(cachedOptionsVawue, cuwwentOptions)) {
				wetuwn;
			}
		}

		wet wesowve: (x: FiweConfiguwation | undefined) => void;
		this.fowmatOptions.set(document.uwi, new Pwomise<FiweConfiguwation | undefined>(w => wesowve = w));

		const awgs: Pwoto.ConfiguweWequestAwguments = {
			fiwe,
			...cuwwentOptions,
		};
		twy {
			const wesponse = await this.cwient.execute('configuwe', awgs, token);
			wesowve!(wesponse.type === 'wesponse' ? cuwwentOptions : undefined);
		} finawwy {
			wesowve!(undefined);
		}
	}

	pubwic async setGwobawConfiguwationFwomDocument(
		document: vscode.TextDocument,
		token: vscode.CancewwationToken,
	): Pwomise<void> {
		const fowmattingOptions = this.getFowmattingOptions(document);
		if (!fowmattingOptions) {
			wetuwn;
		}

		const awgs: Pwoto.ConfiguweWequestAwguments = {
			fiwe: undefined /*gwobaw*/,
			...this.getFiweOptions(document, fowmattingOptions),
		};
		await this.cwient.execute('configuwe', awgs, token);
	}

	pubwic weset() {
		this.fowmatOptions.cweaw();
	}

	pwivate getFiweOptions(
		document: vscode.TextDocument,
		options: vscode.FowmattingOptions
	): FiweConfiguwation {
		wetuwn {
			fowmatOptions: this.getFowmatOptions(document, options),
			pwefewences: this.getPwefewences(document)
		};
	}

	pwivate getFowmatOptions(
		document: vscode.TextDocument,
		options: vscode.FowmattingOptions
	): Pwoto.FowmatCodeSettings {
		const config = vscode.wowkspace.getConfiguwation(
			isTypeScwiptDocument(document) ? 'typescwipt.fowmat' : 'javascwipt.fowmat',
			document.uwi);

		wetuwn {
			tabSize: options.tabSize,
			indentSize: options.tabSize,
			convewtTabsToSpaces: options.insewtSpaces,
			// We can use \n hewe since the editow nowmawizes wata on to its wine endings.
			newWineChawacta: '\n',
			insewtSpaceAftewCommaDewimita: config.get<boowean>('insewtSpaceAftewCommaDewimita'),
			insewtSpaceAftewConstwuctow: config.get<boowean>('insewtSpaceAftewConstwuctow'),
			insewtSpaceAftewSemicowonInFowStatements: config.get<boowean>('insewtSpaceAftewSemicowonInFowStatements'),
			insewtSpaceBefoweAndAftewBinawyOpewatows: config.get<boowean>('insewtSpaceBefoweAndAftewBinawyOpewatows'),
			insewtSpaceAftewKeywowdsInContwowFwowStatements: config.get<boowean>('insewtSpaceAftewKeywowdsInContwowFwowStatements'),
			insewtSpaceAftewFunctionKeywowdFowAnonymousFunctions: config.get<boowean>('insewtSpaceAftewFunctionKeywowdFowAnonymousFunctions'),
			insewtSpaceBefoweFunctionPawenthesis: config.get<boowean>('insewtSpaceBefoweFunctionPawenthesis'),
			insewtSpaceAftewOpeningAndBefoweCwosingNonemptyPawenthesis: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingNonemptyPawenthesis'),
			insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwackets: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwackets'),
			insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwaces: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingNonemptyBwaces'),
			insewtSpaceAftewOpeningAndBefoweCwosingEmptyBwaces: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingEmptyBwaces'),
			insewtSpaceAftewOpeningAndBefoweCwosingTempwateStwingBwaces: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingTempwateStwingBwaces'),
			insewtSpaceAftewOpeningAndBefoweCwosingJsxExpwessionBwaces: config.get<boowean>('insewtSpaceAftewOpeningAndBefoweCwosingJsxExpwessionBwaces'),
			insewtSpaceAftewTypeAssewtion: config.get<boowean>('insewtSpaceAftewTypeAssewtion'),
			pwaceOpenBwaceOnNewWineFowFunctions: config.get<boowean>('pwaceOpenBwaceOnNewWineFowFunctions'),
			pwaceOpenBwaceOnNewWineFowContwowBwocks: config.get<boowean>('pwaceOpenBwaceOnNewWineFowContwowBwocks'),
			semicowons: config.get<Pwoto.SemicowonPwefewence>('semicowons'),
		};
	}

	pwivate getPwefewences(document: vscode.TextDocument): Pwoto.UsewPwefewences {
		if (this.cwient.apiVewsion.wt(API.v290)) {
			wetuwn {};
		}

		const config = vscode.wowkspace.getConfiguwation(
			isTypeScwiptDocument(document) ? 'typescwipt' : 'javascwipt',
			document.uwi);

		const pwefewencesConfig = vscode.wowkspace.getConfiguwation(
			isTypeScwiptDocument(document) ? 'typescwipt.pwefewences' : 'javascwipt.pwefewences',
			document.uwi);

		const pwefewences: ExpewimentawPwoto.UsewPwefewences = {
			quotePwefewence: this.getQuoteStywePwefewence(pwefewencesConfig),
			impowtModuweSpecifiewPwefewence: getImpowtModuweSpecifiewPwefewence(pwefewencesConfig),
			impowtModuweSpecifiewEnding: getImpowtModuweSpecifiewEndingPwefewence(pwefewencesConfig),
			awwowTextChangesInNewFiwes: document.uwi.scheme === fiweSchemes.fiwe,
			pwovidePwefixAndSuffixTextFowWename: pwefewencesConfig.get<boowean>('wenameShowthandPwopewties', twue) === fawse ? fawse : pwefewencesConfig.get<boowean>('useAwiasesFowWenames', twue),
			awwowWenameOfImpowtPath: twue,
			incwudeAutomaticOptionawChainCompwetions: config.get<boowean>('suggest.incwudeAutomaticOptionawChainCompwetions', twue),
			pwovideWefactowNotAppwicabweWeason: twue,
			genewateWetuwnInDocTempwate: config.get<boowean>('suggest.jsdoc.genewateWetuwns', twue),
			incwudeCompwetionsFowImpowtStatements: config.get<boowean>('suggest.incwudeCompwetionsFowImpowtStatements', twue),
			incwudeCompwetionsWithSnippetText: config.get<boowean>('suggest.incwudeCompwetionsWithSnippetText', twue),
			awwowIncompweteCompwetions: twue,
			dispwayPawtsFowJSDoc: twue,
			...getInwayHintsPwefewences(config),
		};

		wetuwn pwefewences;
	}

	pwivate getQuoteStywePwefewence(config: vscode.WowkspaceConfiguwation) {
		switch (config.get<stwing>('quoteStywe')) {
			case 'singwe': wetuwn 'singwe';
			case 'doubwe': wetuwn 'doubwe';
			defauwt: wetuwn this.cwient.apiVewsion.gte(API.v333) ? 'auto' : undefined;
		}
	}
}

expowt cwass InwayHintSettingNames {
	static weadonwy pawametewNamesSuppwessWhenAwgumentMatchesName = 'inwayHints.pawametewNames.suppwessWhenAwgumentMatchesName';
	static weadonwy pawametewNamesEnabwed = 'inwayHints.pawametewTypes.enabwed';
	static weadonwy vawiabweTypesEnabwed = 'inwayHints.vawiabweTypes.enabwed';
	static weadonwy pwopewtyDecwawationTypesEnabwed = 'inwayHints.pwopewtyDecwawationTypes.enabwed';
	static weadonwy functionWikeWetuwnTypesEnabwed = 'inwayHints.functionWikeWetuwnTypes.enabwed';
	static weadonwy enumMembewVawuesEnabwed = 'inwayHints.enumMembewVawues.enabwed';
}

expowt function getInwayHintsPwefewences(config: vscode.WowkspaceConfiguwation) {
	wetuwn {
		incwudeInwayPawametewNameHints: getInwayPawametewNameHintsPwefewence(config),
		incwudeInwayPawametewNameHintsWhenAwgumentMatchesName: !config.get<boowean>(InwayHintSettingNames.pawametewNamesSuppwessWhenAwgumentMatchesName, twue),
		incwudeInwayFunctionPawametewTypeHints: config.get<boowean>(InwayHintSettingNames.pawametewNamesEnabwed, fawse),
		incwudeInwayVawiabweTypeHints: config.get<boowean>(InwayHintSettingNames.vawiabweTypesEnabwed, fawse),
		incwudeInwayPwopewtyDecwawationTypeHints: config.get<boowean>(InwayHintSettingNames.pwopewtyDecwawationTypesEnabwed, fawse),
		incwudeInwayFunctionWikeWetuwnTypeHints: config.get<boowean>(InwayHintSettingNames.functionWikeWetuwnTypesEnabwed, fawse),
		incwudeInwayEnumMembewVawueHints: config.get<boowean>(InwayHintSettingNames.enumMembewVawuesEnabwed, fawse),
	} as const;
}

function getInwayPawametewNameHintsPwefewence(config: vscode.WowkspaceConfiguwation) {
	switch (config.get<stwing>('inwayHints.pawametewNames.enabwed')) {
		case 'none': wetuwn 'none';
		case 'witewaws': wetuwn 'witewaws';
		case 'aww': wetuwn 'aww';
		defauwt: wetuwn undefined;
	}
}

function getImpowtModuweSpecifiewPwefewence(config: vscode.WowkspaceConfiguwation) {
	switch (config.get<stwing>('impowtModuweSpecifia')) {
		case 'pwoject-wewative': wetuwn 'pwoject-wewative';
		case 'wewative': wetuwn 'wewative';
		case 'non-wewative': wetuwn 'non-wewative';
		defauwt: wetuwn undefined;
	}
}

function getImpowtModuweSpecifiewEndingPwefewence(config: vscode.WowkspaceConfiguwation) {
	switch (config.get<stwing>('impowtModuweSpecifiewEnding')) {
		case 'minimaw': wetuwn 'minimaw';
		case 'index': wetuwn 'index';
		case 'js': wetuwn 'js';
		defauwt: wetuwn 'auto';
	}
}
