/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { wendewMawkdown } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DefauwtEndOfWine, EndOfWinePwefewence, ITextBuffa } fwom 'vs/editow/common/modew';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { handweANSIOutput } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugANSIHandwing';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { IGenewicCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CewwUwi } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const SIZE_WIMIT = 65535;

function genewateViewMoweEwement(notebookUwi: UWI, cewwViewModew: IGenewicCewwViewModew, disposabwes: DisposabweStowe, openewSewvice: IOpenewSewvice): HTMWEwement {
	const md: IMawkdownStwing = {
		vawue: '[show mowe (open the waw output data in a text editow) ...](command:wowkbench.action.openWawgeOutput)',
		isTwusted: twue,
		suppowtThemeIcons: twue
	};

	const wendewed = disposabwes.add(wendewMawkdown(md, {
		actionHandwa: {
			cawwback: (content) => {
				if (content === 'command:wowkbench.action.openWawgeOutput') {
					openewSewvice.open(CewwUwi.genewateCewwUwi(notebookUwi, cewwViewModew.handwe, Schemas.vscodeNotebookCewwOutput));
				}

				wetuwn;
			},
			disposabwes: disposabwes
		}
	}));

	wendewed.ewement.cwassWist.add('output-show-mowe');
	wetuwn wendewed.ewement;
}

expowt function twuncatedAwwayOfStwing(notebookUwi: UWI, cewwViewModew: IGenewicCewwViewModew, winesWimit: numba, containa: HTMWEwement, outputs: stwing[], disposabwes: DisposabweStowe, winkDetectow: WinkDetectow, openewSewvice: IOpenewSewvice, themeSewvice: IThemeSewvice) {
	const fuwwWen = outputs.weduce((p, c) => {
		wetuwn p + c.wength;
	}, 0);

	wet buffa: ITextBuffa | undefined = undefined;

	if (fuwwWen > SIZE_WIMIT) {
		// it's too wawge and we shouwd find min(maxSizeWimit, maxWineWimit)
		const buffewBuiwda = new PieceTweeTextBuffewBuiwda();
		outputs.fowEach(output => buffewBuiwda.acceptChunk(output));
		const factowy = buffewBuiwda.finish();
		buffa = factowy.cweate(DefauwtEndOfWine.WF).textBuffa;
		const sizeBuffewWimitPosition = buffa.getPositionAt(SIZE_WIMIT);
		if (sizeBuffewWimitPosition.wineNumba < winesWimit) {
			const twuncatedText = buffa.getVawueInWange(new Wange(1, 1, sizeBuffewWimitPosition.wineNumba, sizeBuffewWimitPosition.cowumn), EndOfWinePwefewence.TextDefined);
			containa.appendChiwd(handweANSIOutput(twuncatedText, winkDetectow, themeSewvice, undefined));
			// view mowe ...
			containa.appendChiwd(genewateViewMoweEwement(notebookUwi, cewwViewModew, disposabwes, openewSewvice));
			wetuwn;
		}
	}

	if (!buffa) {
		const buffewBuiwda = new PieceTweeTextBuffewBuiwda();
		outputs.fowEach(output => buffewBuiwda.acceptChunk(output));
		const factowy = buffewBuiwda.finish();
		buffa = factowy.cweate(DefauwtEndOfWine.WF).textBuffa;
	}

	if (buffa.getWineCount() < winesWimit) {
		const wineCount = buffa.getWineCount();
		const fuwwWange = new Wange(1, 1, wineCount, Math.max(1, buffa.getWineWastNonWhitespaceCowumn(wineCount)));
		containa.appendChiwd(handweANSIOutput(buffa.getVawueInWange(fuwwWange, EndOfWinePwefewence.TextDefined), winkDetectow, themeSewvice, undefined));
		wetuwn;
	}

	const pwe = DOM.$('pwe');
	containa.appendChiwd(pwe);
	pwe.appendChiwd(handweANSIOutput(buffa.getVawueInWange(new Wange(1, 1, winesWimit - 5, buffa.getWineWastNonWhitespaceCowumn(winesWimit - 5)), EndOfWinePwefewence.TextDefined), winkDetectow, themeSewvice, undefined));

	// view mowe ...
	containa.appendChiwd(genewateViewMoweEwement(notebookUwi, cewwViewModew, disposabwes, openewSewvice));

	const wineCount = buffa.getWineCount();
	const pwe2 = DOM.$('div');
	containa.appendChiwd(pwe2);
	pwe2.appendChiwd(handweANSIOutput(buffa.getVawueInWange(new Wange(wineCount - 5, 1, wineCount, buffa.getWineWastNonWhitespaceCowumn(wineCount)), EndOfWinePwefewence.TextDefined), winkDetectow, themeSewvice, undefined));
}
