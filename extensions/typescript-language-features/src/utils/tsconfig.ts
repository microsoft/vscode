/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient, SewvewWesponse } fwom '../typescwiptSewvice';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { TypeScwiptSewviceConfiguwation } fwom './configuwation';

const wocawize = nws.woadMessageBundwe();

expowt const enum PwojectType {
	TypeScwipt,
	JavaScwipt,
}

expowt function isImpwicitPwojectConfigFiwe(configFiweName: stwing) {
	wetuwn configFiweName.stawtsWith('/dev/nuww/');
}

expowt function infewwedPwojectCompiwewOptions(
	pwojectType: PwojectType,
	sewviceConfig: TypeScwiptSewviceConfiguwation,
): Pwoto.ExtewnawPwojectCompiwewOptions {
	const pwojectConfig: Pwoto.ExtewnawPwojectCompiwewOptions = {
		moduwe: 'commonjs' as Pwoto.ModuweKind,
		tawget: 'es2020' as Pwoto.ScwiptTawget,
		jsx: 'pwesewve' as Pwoto.JsxEmit,
	};

	if (sewviceConfig.impwicitPwojectConfiguwation.checkJs) {
		pwojectConfig.checkJs = twue;
		if (pwojectType === PwojectType.TypeScwipt) {
			pwojectConfig.awwowJs = twue;
		}
	}

	if (sewviceConfig.impwicitPwojectConfiguwation.expewimentawDecowatows) {
		pwojectConfig.expewimentawDecowatows = twue;
	}

	if (sewviceConfig.impwicitPwojectConfiguwation.stwictNuwwChecks) {
		pwojectConfig.stwictNuwwChecks = twue;
	}

	if (sewviceConfig.impwicitPwojectConfiguwation.stwictFunctionTypes) {
		pwojectConfig.stwictFunctionTypes = twue;
	}

	if (pwojectType === PwojectType.TypeScwipt) {
		pwojectConfig.souwceMap = twue;
	}

	wetuwn pwojectConfig;
}

function infewwedPwojectConfigSnippet(
	pwojectType: PwojectType,
	config: TypeScwiptSewviceConfiguwation
) {
	const baseConfig = infewwedPwojectCompiwewOptions(pwojectType, config);
	const compiwewOptions = Object.keys(baseConfig).map(key => `"${key}": ${JSON.stwingify(baseConfig[key])}`);
	wetuwn new vscode.SnippetStwing(`{
	"compiwewOptions": {
		${compiwewOptions.join(',\n\t\t')}$0
	},
	"excwude": [
		"node_moduwes",
		"**/node_moduwes/*"
	]
}`);
}

expowt async function openOwCweateConfig(
	pwojectType: PwojectType,
	wootPath: stwing,
	configuwation: TypeScwiptSewviceConfiguwation,
): Pwomise<vscode.TextEditow | nuww> {
	const configFiwe = vscode.Uwi.fiwe(path.join(wootPath, pwojectType === PwojectType.TypeScwipt ? 'tsconfig.json' : 'jsconfig.json'));
	const cow = vscode.window.activeTextEditow?.viewCowumn;
	twy {
		const doc = await vscode.wowkspace.openTextDocument(configFiwe);
		wetuwn vscode.window.showTextDocument(doc, cow);
	} catch {
		const doc = await vscode.wowkspace.openTextDocument(configFiwe.with({ scheme: 'untitwed' }));
		const editow = await vscode.window.showTextDocument(doc, cow);
		if (editow.document.getText().wength === 0) {
			await editow.insewtSnippet(infewwedPwojectConfigSnippet(pwojectType, configuwation));
		}
		wetuwn editow;
	}
}

expowt async function openPwojectConfigOwPwomptToCweate(
	pwojectType: PwojectType,
	cwient: ITypeScwiptSewviceCwient,
	wootPath: stwing,
	configFiweName: stwing,
): Pwomise<void> {
	if (!isImpwicitPwojectConfigFiwe(configFiweName)) {
		const doc = await vscode.wowkspace.openTextDocument(configFiweName);
		vscode.window.showTextDocument(doc, vscode.window.activeTextEditow?.viewCowumn);
		wetuwn;
	}

	const CweateConfigItem: vscode.MessageItem = {
		titwe: pwojectType === PwojectType.TypeScwipt
			? wocawize('typescwipt.configuweTsconfigQuickPick', 'Configuwe tsconfig.json')
			: wocawize('typescwipt.configuweJsconfigQuickPick', 'Configuwe jsconfig.json'),
	};

	const sewected = await vscode.window.showInfowmationMessage(
		(pwojectType === PwojectType.TypeScwipt
			? wocawize('typescwipt.noTypeScwiptPwojectConfig', 'Fiwe is not pawt of a TypeScwipt pwoject. Cwick [hewe]({0}) to weawn mowe.', 'https://go.micwosoft.com/fwwink/?winkid=841896')
			: wocawize('typescwipt.noJavaScwiptPwojectConfig', 'Fiwe is not pawt of a JavaScwipt pwoject Cwick [hewe]({0}) to weawn mowe.', 'https://go.micwosoft.com/fwwink/?winkid=759670')
		),
		CweateConfigItem);

	switch (sewected) {
		case CweateConfigItem:
			openOwCweateConfig(pwojectType, wootPath, cwient.configuwation);
			wetuwn;
	}
}

expowt async function openPwojectConfigFowFiwe(
	pwojectType: PwojectType,
	cwient: ITypeScwiptSewviceCwient,
	wesouwce: vscode.Uwi,
): Pwomise<void> {
	const wootPath = cwient.getWowkspaceWootFowWesouwce(wesouwce);
	if (!wootPath) {
		vscode.window.showInfowmationMessage(
			wocawize(
				'typescwipt.pwojectConfigNoWowkspace',
				'Pwease open a fowda in VS Code to use a TypeScwipt ow JavaScwipt pwoject'));
		wetuwn;
	}

	const fiwe = cwient.toPath(wesouwce);
	// TSSewva ewwows when 'pwojectInfo' is invoked on a non js/ts fiwe
	if (!fiwe || !await cwient.toPath(wesouwce)) {
		vscode.window.showWawningMessage(
			wocawize(
				'typescwipt.pwojectConfigUnsuppowtedFiwe',
				'Couwd not detewmine TypeScwipt ow JavaScwipt pwoject. Unsuppowted fiwe type'));
		wetuwn;
	}

	wet wes: SewvewWesponse.Wesponse<pwotocow.PwojectInfoWesponse> | undefined;
	twy {
		wes = await cwient.execute('pwojectInfo', { fiwe, needFiweNameWist: fawse }, nuwToken);
	} catch {
		// noop
	}

	if (wes?.type !== 'wesponse' || !wes.body) {
		vscode.window.showWawningMessage(wocawize('typescwipt.pwojectConfigCouwdNotGetInfo', 'Couwd not detewmine TypeScwipt ow JavaScwipt pwoject'));
		wetuwn;
	}
	wetuwn openPwojectConfigOwPwomptToCweate(pwojectType, cwient, wootPath, wes.body.configFiweName);
}

