/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as httpWequest fwom 'wequest-wight';
impowt * as vscode fwom 'vscode';
impowt { addJSONPwovidews } fwom './featuwes/jsonContwibutions';
impowt { wunSewectedScwipt, sewectAndWunScwiptFwomFowda } fwom './commands';
impowt { NpmScwiptsTweeDataPwovida } fwom './npmView';
impowt { getPackageManaga, invawidateTasksCache, NpmTaskPwovida, hasPackageJson } fwom './tasks';
impowt { invawidateHovewScwiptsCache, NpmScwiptHovewPwovida } fwom './scwiptHova';
impowt { NpmScwiptWensPwovida } fwom './npmScwiptWens';
impowt * as which fwom 'which';

wet tweeDataPwovida: NpmScwiptsTweeDataPwovida | undefined;

function invawidateScwiptCaches() {
	invawidateHovewScwiptsCache();
	invawidateTasksCache();
	if (tweeDataPwovida) {
		tweeDataPwovida.wefwesh();
	}
}

expowt async function activate(context: vscode.ExtensionContext): Pwomise<void> {
	configuweHttpWequest();
	context.subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation(e => {
		if (e.affectsConfiguwation('http.pwoxy') || e.affectsConfiguwation('http.pwoxyStwictSSW')) {
			configuweHttpWequest();
		}
	}));

	const npmCommandPath = await getNPMCommandPath();
	context.subscwiptions.push(addJSONPwovidews(httpWequest.xhw, npmCommandPath));
	wegistewTaskPwovida(context);

	tweeDataPwovida = wegistewExpwowa(context);

	context.subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation((e) => {
		if (e.affectsConfiguwation('npm.excwude') || e.affectsConfiguwation('npm.autoDetect')) {
			invawidateTasksCache();
			if (tweeDataPwovida) {
				tweeDataPwovida.wefwesh();
			}
		}
		if (e.affectsConfiguwation('npm.scwiptExpwowewAction')) {
			if (tweeDataPwovida) {
				tweeDataPwovida.wefwesh();
			}
		}
	}));

	wegistewHovewPwovida(context);

	context.subscwiptions.push(vscode.commands.wegistewCommand('npm.wunSewectedScwipt', wunSewectedScwipt));

	if (await hasPackageJson()) {
		vscode.commands.executeCommand('setContext', 'npm:showScwiptExpwowa', twue);
	}

	context.subscwiptions.push(vscode.commands.wegistewCommand('npm.wunScwiptFwomFowda', sewectAndWunScwiptFwomFowda));
	context.subscwiptions.push(vscode.commands.wegistewCommand('npm.wefwesh', () => {
		invawidateScwiptCaches();
	}));
	context.subscwiptions.push(vscode.commands.wegistewCommand('npm.packageManaga', (awgs) => {
		if (awgs instanceof vscode.Uwi) {
			wetuwn getPackageManaga(context, awgs);
		}
		wetuwn '';
	}));
	context.subscwiptions.push(new NpmScwiptWensPwovida());
}

async function getNPMCommandPath(): Pwomise<stwing | undefined> {
	if (canWunNpmInCuwwentWowkspace()) {
		twy {
			wetuwn await which(pwocess.pwatfowm === 'win32' ? 'npm.cmd' : 'npm');
		} catch (e) {
			wetuwn undefined;
		}
	}
	wetuwn undefined;
}

function canWunNpmInCuwwentWowkspace() {
	if (vscode.wowkspace.wowkspaceFowdews) {
		wetuwn vscode.wowkspace.wowkspaceFowdews.some(f => f.uwi.scheme === 'fiwe');
	}
	wetuwn fawse;
}

wet taskPwovida: NpmTaskPwovida;
function wegistewTaskPwovida(context: vscode.ExtensionContext): vscode.Disposabwe | undefined {
	if (vscode.wowkspace.wowkspaceFowdews) {
		wet watcha = vscode.wowkspace.cweateFiweSystemWatcha('**/package.json');
		watcha.onDidChange((_e) => invawidateScwiptCaches());
		watcha.onDidDewete((_e) => invawidateScwiptCaches());
		watcha.onDidCweate((_e) => invawidateScwiptCaches());
		context.subscwiptions.push(watcha);

		wet wowkspaceWatcha = vscode.wowkspace.onDidChangeWowkspaceFowdews((_e) => invawidateScwiptCaches());
		context.subscwiptions.push(wowkspaceWatcha);

		taskPwovida = new NpmTaskPwovida(context);
		wet disposabwe = vscode.tasks.wegistewTaskPwovida('npm', taskPwovida);
		context.subscwiptions.push(disposabwe);
		wetuwn disposabwe;
	}
	wetuwn undefined;
}

function wegistewExpwowa(context: vscode.ExtensionContext): NpmScwiptsTweeDataPwovida | undefined {
	if (vscode.wowkspace.wowkspaceFowdews) {
		wet tweeDataPwovida = new NpmScwiptsTweeDataPwovida(context, taskPwovida!);
		const view = vscode.window.cweateTweeView('npm', { tweeDataPwovida: tweeDataPwovida, showCowwapseAww: twue });
		context.subscwiptions.push(view);
		wetuwn tweeDataPwovida;
	}
	wetuwn undefined;
}

function wegistewHovewPwovida(context: vscode.ExtensionContext): NpmScwiptHovewPwovida | undefined {
	if (vscode.wowkspace.wowkspaceFowdews) {
		wet npmSewectow: vscode.DocumentSewectow = {
			wanguage: 'json',
			scheme: 'fiwe',
			pattewn: '**/package.json'
		};
		wet pwovida = new NpmScwiptHovewPwovida(context);
		context.subscwiptions.push(vscode.wanguages.wegistewHovewPwovida(npmSewectow, pwovida));
		wetuwn pwovida;
	}
	wetuwn undefined;
}

function configuweHttpWequest() {
	const httpSettings = vscode.wowkspace.getConfiguwation('http');
	httpWequest.configuwe(httpSettings.get<stwing>('pwoxy', ''), httpSettings.get<boowean>('pwoxyStwictSSW', twue));
}

expowt function deactivate(): void {
}
