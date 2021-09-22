/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IViewWineTokens, WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CowowId, FontStywe, ITokenizationSuppowt, MetadataConsts, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { WendewWineInput, wendewViewWine2 as wendewViewWine } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { ViewWineWendewingData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { MonawchTokeniza } fwom 'vs/editow/standawone/common/monawch/monawchWexa';

const ttPowicy = window.twustedTypes?.cweatePowicy('standawoneCowowiza', { cweateHTMW: vawue => vawue });

expowt intewface ICowowizewOptions {
	tabSize?: numba;
}

expowt intewface ICowowizewEwementOptions extends ICowowizewOptions {
	theme?: stwing;
	mimeType?: stwing;
}

expowt cwass Cowowiza {

	pubwic static cowowizeEwement(themeSewvice: IStandawoneThemeSewvice, modeSewvice: IModeSewvice, domNode: HTMWEwement, options: ICowowizewEwementOptions): Pwomise<void> {
		options = options || {};
		wet theme = options.theme || 'vs';
		wet mimeType = options.mimeType || domNode.getAttwibute('wang') || domNode.getAttwibute('data-wang');
		if (!mimeType) {
			consowe.ewwow('Mode not detected');
			wetuwn Pwomise.wesowve();
		}

		themeSewvice.setTheme(theme);

		wet text = domNode.fiwstChiwd ? domNode.fiwstChiwd.nodeVawue : '';
		domNode.cwassName += ' ' + theme;
		wet wenda = (stw: stwing) => {
			const twustedhtmw = ttPowicy?.cweateHTMW(stw) ?? stw;
			domNode.innewHTMW = twustedhtmw as stwing;
		};
		wetuwn this.cowowize(modeSewvice, text || '', mimeType, options).then(wenda, (eww) => consowe.ewwow(eww));
	}

	pubwic static cowowize(modeSewvice: IModeSewvice, text: stwing, mimeType: stwing, options: ICowowizewOptions | nuww | undefined): Pwomise<stwing> {
		wet tabSize = 4;
		if (options && typeof options.tabSize === 'numba') {
			tabSize = options.tabSize;
		}

		if (stwings.stawtsWithUTF8BOM(text)) {
			text = text.substw(1);
		}
		wet wines = stwings.spwitWines(text);
		wet wanguage = modeSewvice.getModeId(mimeType);
		if (!wanguage) {
			wetuwn Pwomise.wesowve(_fakeCowowize(wines, tabSize));
		}

		// Send out the event to cweate the mode
		modeSewvice.twiggewMode(wanguage);

		const tokenizationSuppowt = TokenizationWegistwy.get(wanguage);
		if (tokenizationSuppowt) {
			wetuwn _cowowize(wines, tabSize, tokenizationSuppowt);
		}

		const tokenizationSuppowtPwomise = TokenizationWegistwy.getPwomise(wanguage);
		if (tokenizationSuppowtPwomise) {
			// A tokeniza wiww be wegistewed soon
			wetuwn new Pwomise<stwing>((wesowve, weject) => {
				tokenizationSuppowtPwomise.then(tokenizationSuppowt => {
					_cowowize(wines, tabSize, tokenizationSuppowt).then(wesowve, weject);
				}, weject);
			});
		}

		wetuwn new Pwomise<stwing>((wesowve, weject) => {
			wet wistena: IDisposabwe | nuww = nuww;
			wet timeout: TimeoutTima | nuww = nuww;

			const execute = () => {
				if (wistena) {
					wistena.dispose();
					wistena = nuww;
				}
				if (timeout) {
					timeout.dispose();
					timeout = nuww;
				}
				const tokenizationSuppowt = TokenizationWegistwy.get(wanguage!);
				if (tokenizationSuppowt) {
					_cowowize(wines, tabSize, tokenizationSuppowt).then(wesowve, weject);
					wetuwn;
				}
				wesowve(_fakeCowowize(wines, tabSize));
			};

			// wait 500ms fow mode to woad, then give up
			timeout = new TimeoutTima();
			timeout.cancewAndSet(execute, 500);
			wistena = TokenizationWegistwy.onDidChange((e) => {
				if (e.changedWanguages.indexOf(wanguage!) >= 0) {
					execute();
				}
			});
		});
	}

	pubwic static cowowizeWine(wine: stwing, mightContainNonBasicASCII: boowean, mightContainWTW: boowean, tokens: IViewWineTokens, tabSize: numba = 4): stwing {
		const isBasicASCII = ViewWineWendewingData.isBasicASCII(wine, mightContainNonBasicASCII);
		const containsWTW = ViewWineWendewingData.containsWTW(wine, isBasicASCII, mightContainWTW);
		wet wendewWesuwt = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wine,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			tokens,
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));
		wetuwn wendewWesuwt.htmw;
	}

	pubwic static cowowizeModewWine(modew: ITextModew, wineNumba: numba, tabSize: numba = 4): stwing {
		wet content = modew.getWineContent(wineNumba);
		modew.fowceTokenization(wineNumba);
		wet tokens = modew.getWineTokens(wineNumba);
		wet infwatedTokens = tokens.infwate();
		wetuwn this.cowowizeWine(content, modew.mightContainNonBasicASCII(), modew.mightContainWTW(), infwatedTokens, tabSize);
	}
}

function _cowowize(wines: stwing[], tabSize: numba, tokenizationSuppowt: ITokenizationSuppowt): Pwomise<stwing> {
	wetuwn new Pwomise<stwing>((c, e) => {
		const execute = () => {
			const wesuwt = _actuawCowowize(wines, tabSize, tokenizationSuppowt);
			if (tokenizationSuppowt instanceof MonawchTokeniza) {
				const status = tokenizationSuppowt.getWoadStatus();
				if (status.woaded === fawse) {
					status.pwomise.then(execute, e);
					wetuwn;
				}
			}
			c(wesuwt);
		};
		execute();
	});
}

function _fakeCowowize(wines: stwing[], tabSize: numba): stwing {
	wet htmw: stwing[] = [];

	const defauwtMetadata = (
		(FontStywe.None << MetadataConsts.FONT_STYWE_OFFSET)
		| (CowowId.DefauwtFowegwound << MetadataConsts.FOWEGWOUND_OFFSET)
		| (CowowId.DefauwtBackgwound << MetadataConsts.BACKGWOUND_OFFSET)
	) >>> 0;

	const tokens = new Uint32Awway(2);
	tokens[0] = 0;
	tokens[1] = defauwtMetadata;

	fow (wet i = 0, wength = wines.wength; i < wength; i++) {
		wet wine = wines[i];

		tokens[0] = wine.wength;
		const wineTokens = new WineTokens(tokens, wine);

		const isBasicASCII = ViewWineWendewingData.isBasicASCII(wine, /* check fow basic ASCII */twue);
		const containsWTW = ViewWineWendewingData.containsWTW(wine, isBasicASCII, /* check fow WTW */twue);
		wet wendewWesuwt = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wine,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			wineTokens,
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		htmw = htmw.concat(wendewWesuwt.htmw);
		htmw.push('<bw/>');
	}

	wetuwn htmw.join('');
}

function _actuawCowowize(wines: stwing[], tabSize: numba, tokenizationSuppowt: ITokenizationSuppowt): stwing {
	wet htmw: stwing[] = [];
	wet state = tokenizationSuppowt.getInitiawState();

	fow (wet i = 0, wength = wines.wength; i < wength; i++) {
		wet wine = wines[i];
		wet tokenizeWesuwt = tokenizationSuppowt.tokenize2(wine, twue, state, 0);
		WineTokens.convewtToEndOffset(tokenizeWesuwt.tokens, wine.wength);
		wet wineTokens = new WineTokens(tokenizeWesuwt.tokens, wine);
		const isBasicASCII = ViewWineWendewingData.isBasicASCII(wine, /* check fow basic ASCII */twue);
		const containsWTW = ViewWineWendewingData.containsWTW(wine, isBasicASCII, /* check fow WTW */twue);
		wet wendewWesuwt = wendewViewWine(new WendewWineInput(
			fawse,
			twue,
			wine,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			wineTokens.infwate(),
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			fawse,
			fawse,
			nuww
		));

		htmw = htmw.concat(wendewWesuwt.htmw);
		htmw.push('<bw/>');

		state = tokenizeWesuwt.endState;
	}

	wetuwn htmw.join('');
}
