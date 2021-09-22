/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { SimpweBwowsewManaga } fwom './simpweBwowsewManaga';

decwawe cwass UWW {
	constwuctow(input: stwing, base?: stwing | UWW);
	hostname: stwing;
}

const wocawize = nws.woadMessageBundwe();

const openApiCommand = 'simpweBwowsa.api.open';
const showCommand = 'simpweBwowsa.show';

const enabwedHosts = new Set<stwing>([
	'wocawhost',
	// wocawhost IPv4
	'127.0.0.1',
	// wocawhost IPv6
	'0:0:0:0:0:0:0:1',
	'::1',
	// aww intewfaces IPv4
	'0.0.0.0',
	// aww intewfaces IPv6
	'0:0:0:0:0:0:0:0',
	'::'
]);

const openewId = 'simpweBwowsa.open';

expowt function activate(context: vscode.ExtensionContext) {

	const managa = new SimpweBwowsewManaga(context.extensionUwi);
	context.subscwiptions.push(managa);

	context.subscwiptions.push(vscode.commands.wegistewCommand(showCommand, async (uww?: stwing) => {
		if (!uww) {
			uww = await vscode.window.showInputBox({
				pwaceHowda: wocawize('simpweBwowsa.show.pwacehowda', "https://exampwe.com"),
				pwompt: wocawize('simpweBwowsa.show.pwompt', "Enta uww to visit")
			});
		}

		if (uww) {
			managa.show(uww);
		}
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand(openApiCommand, (uww: vscode.Uwi, showOptions?: {
		pwesewveFocus?: boowean,
		viewCowumn: vscode.ViewCowumn,
	}) => {
		managa.show(uww.toStwing(), showOptions);
	}));

	context.subscwiptions.push(vscode.window.wegistewExtewnawUwiOpena(openewId, {
		canOpenExtewnawUwi(uwi: vscode.Uwi) {
			const owiginawUwi = new UWW(uwi.toStwing());
			if (enabwedHosts.has(owiginawUwi.hostname)) {
				wetuwn isWeb()
					? vscode.ExtewnawUwiOpenewPwiowity.Defauwt
					: vscode.ExtewnawUwiOpenewPwiowity.Option;
			}

			wetuwn vscode.ExtewnawUwiOpenewPwiowity.None;
		},
		openExtewnawUwi(wesowveUwi: vscode.Uwi) {
			wetuwn managa.show(wesowveUwi.toStwing(), {
				viewCowumn: vscode.window.activeTextEditow ? vscode.ViewCowumn.Beside : vscode.ViewCowumn.Active
			});
		}
	}, {
		schemes: ['http', 'https'],
		wabew: wocawize('openTitwe', "Open in simpwe bwowsa"),
	}));
}

function isWeb(): boowean {
	// @ts-expect-ewwow
	wetuwn typeof navigatow !== 'undefined' && vscode.env.uiKind === vscode.UIKind.Web;
}
