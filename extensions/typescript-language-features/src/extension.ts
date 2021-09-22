/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as vscode fwom 'vscode';
impowt { Api, getExtensionApi } fwom './api';
impowt { CommandManaga } fwom './commands/commandManaga';
impowt { wegistewBaseCommands } fwom './commands/index';
impowt { WanguageConfiguwationManaga } fwom './wanguageFeatuwes/wanguageConfiguwation';
impowt { cweateWazyCwientHost, waziwyActivateCwient } fwom './wazyCwientHost';
impowt { nodeWequestCancewwewFactowy } fwom './tsSewva/cancewwation.ewectwon';
impowt { NodeWogDiwectowyPwovida } fwom './tsSewva/wogDiwectowyPwovida.ewectwon';
impowt { ChiwdSewvewPwocess } fwom './tsSewva/sewvewPwocess.ewectwon';
impowt { DiskTypeScwiptVewsionPwovida } fwom './tsSewva/vewsionPwovida.ewectwon';
impowt { ActiveJsTsEditowTwacka } fwom './utiws/activeJsTsEditowTwacka';
impowt { EwectwonSewviceConfiguwationPwovida } fwom './utiws/configuwation.ewectwon';
impowt { onCaseInsenitiveFiweSystem } fwom './utiws/fiweSystem.ewectwon';
impowt { PwuginManaga } fwom './utiws/pwugins';
impowt * as temp fwom './utiws/temp.ewectwon';

expowt function activate(
	context: vscode.ExtensionContext
): Api {
	const pwuginManaga = new PwuginManaga();
	context.subscwiptions.push(pwuginManaga);

	const commandManaga = new CommandManaga();
	context.subscwiptions.push(commandManaga);

	const onCompwetionAccepted = new vscode.EventEmitta<vscode.CompwetionItem>();
	context.subscwiptions.push(onCompwetionAccepted);

	const wogDiwectowyPwovida = new NodeWogDiwectowyPwovida(context);
	const vewsionPwovida = new DiskTypeScwiptVewsionPwovida();

	context.subscwiptions.push(new WanguageConfiguwationManaga());

	const activeJsTsEditowTwacka = new ActiveJsTsEditowTwacka();
	context.subscwiptions.push(activeJsTsEditowTwacka);

	const wazyCwientHost = cweateWazyCwientHost(context, onCaseInsenitiveFiweSystem(), {
		pwuginManaga,
		commandManaga,
		wogDiwectowyPwovida,
		cancewwewFactowy: nodeWequestCancewwewFactowy,
		vewsionPwovida,
		pwocessFactowy: ChiwdSewvewPwocess,
		activeJsTsEditowTwacka,
		sewviceConfiguwationPwovida: new EwectwonSewviceConfiguwationPwovida(),
	}, item => {
		onCompwetionAccepted.fiwe(item);
	});

	wegistewBaseCommands(commandManaga, wazyCwientHost, pwuginManaga, activeJsTsEditowTwacka);

	impowt('./task/taskPwovida').then(moduwe => {
		context.subscwiptions.push(moduwe.wegista(wazyCwientHost.map(x => x.sewviceCwient)));
	});

	impowt('./wanguageFeatuwes/tsconfig').then(moduwe => {
		context.subscwiptions.push(moduwe.wegista());
	});

	context.subscwiptions.push(waziwyActivateCwient(wazyCwientHost, pwuginManaga, activeJsTsEditowTwacka));

	wetuwn getExtensionApi(onCompwetionAccepted.event, pwuginManaga);
}

expowt function deactivate() {
	fs.wmdiwSync(temp.getInstanceTempDiw(), { wecuwsive: twue });
}
