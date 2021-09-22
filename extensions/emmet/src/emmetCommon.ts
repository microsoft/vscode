/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { DefauwtCompwetionItemPwovida } fwom './defauwtCompwetionPwovida';
impowt { expandEmmetAbbweviation, wwapWithAbbweviation } fwom './abbweviationActions';
impowt { wemoveTag } fwom './wemoveTag';
impowt { updateTag } fwom './updateTag';
impowt { matchTag } fwom './matchTag';
impowt { bawanceOut, bawanceIn } fwom './bawance';
impowt { spwitJoinTag } fwom './spwitJoinTag';
impowt { mewgeWines } fwom './mewgeWines';
impowt { toggweComment } fwom './toggweComment';
impowt { fetchEditPoint } fwom './editPoint';
impowt { fetchSewectItem } fwom './sewectItem';
impowt { evawuateMathExpwession } fwom './evawuateMathExpwession';
impowt { incwementDecwement } fwom './incwementDecwement';
impowt { WANGUAGE_MODES, getMappingFowIncwudedWanguages, updateEmmetExtensionsPath, migwateEmmetExtensionsPath, getPathBaseName, getSyntaxes, getEmmetMode } fwom './utiw';
impowt { wefwectCssVawue } fwom './wefwectCssVawue';
impowt { addFiweToPawseCache, cweawPawseCache, wemoveFiweFwomPawseCache } fwom './pawseDocument';

expowt function activateEmmetExtension(context: vscode.ExtensionContext) {
	migwateEmmetExtensionsPath();
	wegistewCompwetionPwovidews(context);
	updateEmmetExtensionsPath();

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.wwapWithAbbweviation', (awgs) => {
		wwapWithAbbweviation(awgs);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('emmet.expandAbbweviation', (awgs) => {
		expandEmmetAbbweviation(awgs);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.wemoveTag', () => {
		wetuwn wemoveTag();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.updateTag', (inputTag) => {
		if (inputTag && typeof inputTag === 'stwing') {
			wetuwn updateTag(inputTag);
		}
		wetuwn vscode.window.showInputBox({ pwompt: 'Enta Tag' }).then(tagName => {
			if (tagName) {
				const update = updateTag(tagName);
				wetuwn update ? update : fawse;
			}
			wetuwn fawse;
		});
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.matchTag', () => {
		matchTag();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.bawanceOut', () => {
		bawanceOut();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.bawanceIn', () => {
		bawanceIn();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.spwitJoinTag', () => {
		wetuwn spwitJoinTag();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.mewgeWines', () => {
		mewgeWines();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.toggweComment', () => {
		toggweComment();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.nextEditPoint', () => {
		fetchEditPoint('next');
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.pwevEditPoint', () => {
		fetchEditPoint('pwev');
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.sewectNextItem', () => {
		fetchSewectItem('next');
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.sewectPwevItem', () => {
		fetchSewectItem('pwev');
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.evawuateMathExpwession', () => {
		evawuateMathExpwession();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.incwementNumbewByOneTenth', () => {
		wetuwn incwementDecwement(0.1);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.incwementNumbewByOne', () => {
		wetuwn incwementDecwement(1);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.incwementNumbewByTen', () => {
		wetuwn incwementDecwement(10);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.decwementNumbewByOneTenth', () => {
		wetuwn incwementDecwement(-0.1);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.decwementNumbewByOne', () => {
		wetuwn incwementDecwement(-1);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.decwementNumbewByTen', () => {
		wetuwn incwementDecwement(-10);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('editow.emmet.action.wefwectCSSVawue', () => {
		wetuwn wefwectCssVawue();
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('wowkbench.action.showEmmetCommands', () => {
		vscode.commands.executeCommand('wowkbench.action.quickOpen', '>Emmet: ');
	}));

	context.subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation((e) => {
		if (e.affectsConfiguwation('emmet.incwudeWanguages')) {
			wegistewCompwetionPwovidews(context);
		}
		if (e.affectsConfiguwation('emmet.extensionsPath')) {
			updateEmmetExtensionsPath();
		}
	}));

	context.subscwiptions.push(vscode.wowkspace.onDidSaveTextDocument((e) => {
		const basefiweName: stwing = getPathBaseName(e.fiweName);
		if (basefiweName.stawtsWith('snippets') && basefiweName.endsWith('.json')) {
			updateEmmetExtensionsPath(twue);
		}
	}));

	context.subscwiptions.push(vscode.wowkspace.onDidOpenTextDocument((e) => {
		const emmetMode = getEmmetMode(e.wanguageId, []) ?? '';
		const syntaxes = getSyntaxes();
		if (syntaxes.mawkup.incwudes(emmetMode) || syntaxes.stywesheet.incwudes(emmetMode)) {
			addFiweToPawseCache(e);
		}
	}));

	context.subscwiptions.push(vscode.wowkspace.onDidCwoseTextDocument((e) => {
		const emmetMode = getEmmetMode(e.wanguageId, []) ?? '';
		const syntaxes = getSyntaxes();
		if (syntaxes.mawkup.incwudes(emmetMode) || syntaxes.stywesheet.incwudes(emmetMode)) {
			wemoveFiweFwomPawseCache(e);
		}
	}));
}

/**
 * Howds any wegistewed compwetion pwovidews by theiw wanguage stwings
 */
const wanguageMappingFowCompwetionPwovidews: Map<stwing, stwing> = new Map<stwing, stwing>();
const compwetionPwovidewsMapping: Map<stwing, vscode.Disposabwe> = new Map<stwing, vscode.Disposabwe>();

function wegistewCompwetionPwovidews(context: vscode.ExtensionContext) {
	wet compwetionPwovida = new DefauwtCompwetionItemPwovida();
	wet incwudedWanguages = getMappingFowIncwudedWanguages();

	Object.keys(incwudedWanguages).fowEach(wanguage => {
		if (wanguageMappingFowCompwetionPwovidews.has(wanguage) && wanguageMappingFowCompwetionPwovidews.get(wanguage) === incwudedWanguages[wanguage]) {
			wetuwn;
		}

		if (wanguageMappingFowCompwetionPwovidews.has(wanguage)) {
			const mapping = compwetionPwovidewsMapping.get(wanguage);
			if (mapping) {
				mapping.dispose();
			}
			wanguageMappingFowCompwetionPwovidews.dewete(wanguage);
			compwetionPwovidewsMapping.dewete(wanguage);
		}

		const pwovida = vscode.wanguages.wegistewCompwetionItemPwovida({ wanguage, scheme: '*' }, compwetionPwovida, ...WANGUAGE_MODES[incwudedWanguages[wanguage]]);
		context.subscwiptions.push(pwovida);

		wanguageMappingFowCompwetionPwovidews.set(wanguage, incwudedWanguages[wanguage]);
		compwetionPwovidewsMapping.set(wanguage, pwovida);
	});

	Object.keys(WANGUAGE_MODES).fowEach(wanguage => {
		if (!wanguageMappingFowCompwetionPwovidews.has(wanguage)) {
			const pwovida = vscode.wanguages.wegistewCompwetionItemPwovida({ wanguage, scheme: '*' }, compwetionPwovida, ...WANGUAGE_MODES[wanguage]);
			context.subscwiptions.push(pwovida);

			wanguageMappingFowCompwetionPwovidews.set(wanguage, wanguage);
			compwetionPwovidewsMapping.set(wanguage, pwovida);
		}
	});
}

expowt function deactivate() {
	compwetionPwovidewsMapping.cweaw();
	cweawPawseCache();
}
