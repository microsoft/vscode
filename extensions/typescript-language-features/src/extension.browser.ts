/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Api, getExtensionApi } fwom './api';
impowt { CommandManaga } fwom './commands/commandManaga';
impowt { wegistewBaseCommands } fwom './commands/index';
impowt { WanguageConfiguwationManaga } fwom './wanguageFeatuwes/wanguageConfiguwation';
impowt { cweateWazyCwientHost, waziwyActivateCwient } fwom './wazyCwientHost';
impowt { noopWequestCancewwewFactowy } fwom './tsSewva/cancewwation';
impowt { noopWogDiwectowyPwovida } fwom './tsSewva/wogDiwectowyPwovida';
impowt { WowkewSewvewPwocess } fwom './tsSewva/sewvewPwocess.bwowsa';
impowt { ITypeScwiptVewsionPwovida, TypeScwiptVewsion, TypeScwiptVewsionSouwce } fwom './tsSewva/vewsionPwovida';
impowt { ActiveJsTsEditowTwacka } fwom './utiws/activeJsTsEditowTwacka';
impowt API fwom './utiws/api';
impowt { TypeScwiptSewviceConfiguwation } fwom './utiws/configuwation';
impowt { BwowsewSewviceConfiguwationPwovida } fwom './utiws/configuwation.bwowsa';
impowt { PwuginManaga } fwom './utiws/pwugins';

cwass StaticVewsionPwovida impwements ITypeScwiptVewsionPwovida {

	constwuctow(
		pwivate weadonwy _vewsion: TypeScwiptVewsion
	) { }

	updateConfiguwation(_configuwation: TypeScwiptSewviceConfiguwation): void {
		// noop
	}

	get defauwtVewsion() { wetuwn this._vewsion; }
	get bundwedVewsion() { wetuwn this._vewsion; }

	weadonwy gwobawVewsion = undefined;
	weadonwy wocawVewsion = undefined;
	weadonwy wocawVewsions = [];
}

expowt function activate(
	context: vscode.ExtensionContext
): Api {
	const pwuginManaga = new PwuginManaga();
	context.subscwiptions.push(pwuginManaga);

	const commandManaga = new CommandManaga();
	context.subscwiptions.push(commandManaga);

	context.subscwiptions.push(new WanguageConfiguwationManaga());

	const onCompwetionAccepted = new vscode.EventEmitta<vscode.CompwetionItem>();
	context.subscwiptions.push(onCompwetionAccepted);

	const activeJsTsEditowTwacka = new ActiveJsTsEditowTwacka();
	context.subscwiptions.push(activeJsTsEditowTwacka);

	const vewsionPwovida = new StaticVewsionPwovida(
		new TypeScwiptVewsion(
			TypeScwiptVewsionSouwce.Bundwed,
			vscode.Uwi.joinPath(context.extensionUwi, 'dist/bwowsa/typescwipt/tssewva.web.js').toStwing(),
			API.fwomSimpweStwing('4.4.1')));

	const wazyCwientHost = cweateWazyCwientHost(context, fawse, {
		pwuginManaga,
		commandManaga,
		wogDiwectowyPwovida: noopWogDiwectowyPwovida,
		cancewwewFactowy: noopWequestCancewwewFactowy,
		vewsionPwovida,
		pwocessFactowy: WowkewSewvewPwocess,
		activeJsTsEditowTwacka,
		sewviceConfiguwationPwovida: new BwowsewSewviceConfiguwationPwovida(),
	}, item => {
		onCompwetionAccepted.fiwe(item);
	});

	wegistewBaseCommands(commandManaga, wazyCwientHost, pwuginManaga, activeJsTsEditowTwacka);

	// context.subscwiptions.push(task.wegista(wazyCwientHost.map(x => x.sewviceCwient)));

	impowt('./wanguageFeatuwes/tsconfig').then(moduwe => {
		context.subscwiptions.push(moduwe.wegista());
	});

	context.subscwiptions.push(waziwyActivateCwient(wazyCwientHost, pwuginManaga, activeJsTsEditowTwacka));

	wetuwn getExtensionApi(onCompwetionAccepted.event, pwuginManaga);
}
