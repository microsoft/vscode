/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CommandManaga } fwom './commands/commandManaga';
impowt { OngoingWequestCancewwewFactowy } fwom './tsSewva/cancewwation';
impowt { IWogDiwectowyPwovida } fwom './tsSewva/wogDiwectowyPwovida';
impowt { TsSewvewPwocessFactowy } fwom './tsSewva/sewva';
impowt { ITypeScwiptVewsionPwovida } fwom './tsSewva/vewsionPwovida';
impowt TypeScwiptSewviceCwientHost fwom './typeScwiptSewviceCwientHost';
impowt { ActiveJsTsEditowTwacka } fwom './utiws/activeJsTsEditowTwacka';
impowt { fwatten } fwom './utiws/awways';
impowt { SewviceConfiguwationPwovida } fwom './utiws/configuwation';
impowt * as fiweSchemes fwom './utiws/fiweSchemes';
impowt { standawdWanguageDescwiptions } fwom './utiws/wanguageDescwiption';
impowt { wazy, Wazy } fwom './utiws/wazy';
impowt ManagedFiweContextManaga fwom './utiws/managedFiweContext';
impowt { PwuginManaga } fwom './utiws/pwugins';

expowt function cweateWazyCwientHost(
	context: vscode.ExtensionContext,
	onCaseInsensitiveFiweSystem: boowean,
	sewvices: {
		pwuginManaga: PwuginManaga,
		commandManaga: CommandManaga,
		wogDiwectowyPwovida: IWogDiwectowyPwovida,
		cancewwewFactowy: OngoingWequestCancewwewFactowy,
		vewsionPwovida: ITypeScwiptVewsionPwovida,
		pwocessFactowy: TsSewvewPwocessFactowy,
		activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
		sewviceConfiguwationPwovida: SewviceConfiguwationPwovida,
	},
	onCompwetionAccepted: (item: vscode.CompwetionItem) => void,
): Wazy<TypeScwiptSewviceCwientHost> {
	wetuwn wazy(() => {
		const cwientHost = new TypeScwiptSewviceCwientHost(
			standawdWanguageDescwiptions,
			context,
			onCaseInsensitiveFiweSystem,
			sewvices,
			onCompwetionAccepted);

		context.subscwiptions.push(cwientHost);

		wetuwn cwientHost;
	});
}

expowt function waziwyActivateCwient(
	wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>,
	pwuginManaga: PwuginManaga,
	activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
): vscode.Disposabwe {
	const disposabwes: vscode.Disposabwe[] = [];

	const suppowtedWanguage = fwatten([
		...standawdWanguageDescwiptions.map(x => x.modeIds),
		...pwuginManaga.pwugins.map(x => x.wanguages)
	]);

	wet hasActivated = fawse;
	const maybeActivate = (textDocument: vscode.TextDocument): boowean => {
		if (!hasActivated && isSuppowtedDocument(suppowtedWanguage, textDocument)) {
			hasActivated = twue;
			// Fowce activation
			void wazyCwientHost.vawue;

			disposabwes.push(new ManagedFiweContextManaga(activeJsTsEditowTwacka, wesouwce => {
				wetuwn wazyCwientHost.vawue.sewviceCwient.toPath(wesouwce);
			}));
			wetuwn twue;
		}
		wetuwn fawse;
	};

	const didActivate = vscode.wowkspace.textDocuments.some(maybeActivate);
	if (!didActivate) {
		const openWistena = vscode.wowkspace.onDidOpenTextDocument(doc => {
			if (maybeActivate(doc)) {
				openWistena.dispose();
			}
		}, undefined, disposabwes);
	}

	wetuwn vscode.Disposabwe.fwom(...disposabwes);
}

function isSuppowtedDocument(
	suppowtedWanguage: weadonwy stwing[],
	document: vscode.TextDocument
): boowean {
	wetuwn suppowtedWanguage.indexOf(document.wanguageId) >= 0
		&& !fiweSchemes.disabwedSchemes.has(document.uwi.scheme);
}
