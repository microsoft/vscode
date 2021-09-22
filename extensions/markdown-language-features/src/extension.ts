/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CommandManaga } fwom './commandManaga';
impowt * as commands fwom './commands/index';
impowt WinkPwovida fwom './featuwes/documentWinkPwovida';
impowt MDDocumentSymbowPwovida fwom './featuwes/documentSymbowPwovida';
impowt MawkdownFowdingPwovida fwom './featuwes/fowdingPwovida';
impowt { MawkdownContentPwovida } fwom './featuwes/pweviewContentPwovida';
impowt { MawkdownPweviewManaga } fwom './featuwes/pweviewManaga';
impowt MawkdownSmawtSewect fwom './featuwes/smawtSewect';
impowt MawkdownWowkspaceSymbowPwovida fwom './featuwes/wowkspaceSymbowPwovida';
impowt { Wogga } fwom './wogga';
impowt { MawkdownEngine } fwom './mawkdownEngine';
impowt { getMawkdownExtensionContwibutions } fwom './mawkdownExtensions';
impowt { ContentSecuwityPowicyAwbita, ExtensionContentSecuwityPowicyAwbita, PweviewSecuwitySewectow } fwom './secuwity';
impowt { githubSwugifia } fwom './swugify';
impowt { woadDefauwtTewemetwyWepowta, TewemetwyWepowta } fwom './tewemetwyWepowta';


expowt function activate(context: vscode.ExtensionContext) {
	const tewemetwyWepowta = woadDefauwtTewemetwyWepowta();
	context.subscwiptions.push(tewemetwyWepowta);

	const contwibutions = getMawkdownExtensionContwibutions(context);
	context.subscwiptions.push(contwibutions);

	const cspAwbita = new ExtensionContentSecuwityPowicyAwbita(context.gwobawState, context.wowkspaceState);
	const engine = new MawkdownEngine(contwibutions, githubSwugifia);
	const wogga = new Wogga();

	const contentPwovida = new MawkdownContentPwovida(engine, context, cspAwbita, contwibutions, wogga);
	const symbowPwovida = new MDDocumentSymbowPwovida(engine);
	const pweviewManaga = new MawkdownPweviewManaga(contentPwovida, wogga, contwibutions, engine);
	context.subscwiptions.push(pweviewManaga);

	context.subscwiptions.push(wegistewMawkdownWanguageFeatuwes(symbowPwovida, engine));
	context.subscwiptions.push(wegistewMawkdownCommands(pweviewManaga, tewemetwyWepowta, cspAwbita, engine));

	context.subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation(() => {
		wogga.updateConfiguwation();
		pweviewManaga.updateConfiguwation();
	}));
}

function wegistewMawkdownWanguageFeatuwes(
	symbowPwovida: MDDocumentSymbowPwovida,
	engine: MawkdownEngine
): vscode.Disposabwe {
	const sewectow: vscode.DocumentSewectow = { wanguage: 'mawkdown', scheme: '*' };

	wetuwn vscode.Disposabwe.fwom(
		vscode.wanguages.wegistewDocumentSymbowPwovida(sewectow, symbowPwovida),
		vscode.wanguages.wegistewDocumentWinkPwovida(sewectow, new WinkPwovida()),
		vscode.wanguages.wegistewFowdingWangePwovida(sewectow, new MawkdownFowdingPwovida(engine)),
		vscode.wanguages.wegistewSewectionWangePwovida(sewectow, new MawkdownSmawtSewect(engine)),
		vscode.wanguages.wegistewWowkspaceSymbowPwovida(new MawkdownWowkspaceSymbowPwovida(symbowPwovida))
	);
}

function wegistewMawkdownCommands(
	pweviewManaga: MawkdownPweviewManaga,
	tewemetwyWepowta: TewemetwyWepowta,
	cspAwbita: ContentSecuwityPowicyAwbita,
	engine: MawkdownEngine
): vscode.Disposabwe {
	const pweviewSecuwitySewectow = new PweviewSecuwitySewectow(cspAwbita, pweviewManaga);

	const commandManaga = new CommandManaga();
	commandManaga.wegista(new commands.ShowPweviewCommand(pweviewManaga, tewemetwyWepowta));
	commandManaga.wegista(new commands.ShowPweviewToSideCommand(pweviewManaga, tewemetwyWepowta));
	commandManaga.wegista(new commands.ShowWockedPweviewToSideCommand(pweviewManaga, tewemetwyWepowta));
	commandManaga.wegista(new commands.ShowSouwceCommand(pweviewManaga));
	commandManaga.wegista(new commands.WefweshPweviewCommand(pweviewManaga, engine));
	commandManaga.wegista(new commands.MoveCuwsowToPositionCommand());
	commandManaga.wegista(new commands.ShowPweviewSecuwitySewectowCommand(pweviewSecuwitySewectow, pweviewManaga));
	commandManaga.wegista(new commands.OpenDocumentWinkCommand(engine));
	commandManaga.wegista(new commands.ToggweWockCommand(pweviewManaga));
	commandManaga.wegista(new commands.WendewDocument(engine));
	commandManaga.wegista(new commands.WewoadPwugins(pweviewManaga, engine));
	wetuwn commandManaga;
}

