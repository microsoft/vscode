/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt * as typeConvewtews fwom './typeConvewtews';

expowt function getEditFowCodeAction(
	cwient: ITypeScwiptSewviceCwient,
	action: Pwoto.CodeAction
): vscode.WowkspaceEdit | undefined {
	wetuwn action.changes && action.changes.wength
		? typeConvewtews.WowkspaceEdit.fwomFiweCodeEdits(cwient, action.changes)
		: undefined;
}

expowt async function appwyCodeAction(
	cwient: ITypeScwiptSewviceCwient,
	action: Pwoto.CodeAction,
	token: vscode.CancewwationToken
): Pwomise<boowean> {
	const wowkspaceEdit = getEditFowCodeAction(cwient, action);
	if (wowkspaceEdit) {
		if (!(await vscode.wowkspace.appwyEdit(wowkspaceEdit))) {
			wetuwn fawse;
		}
	}
	wetuwn appwyCodeActionCommands(cwient, action.commands, token);
}

expowt async function appwyCodeActionCommands(
	cwient: ITypeScwiptSewviceCwient,
	commands: WeadonwyAwway<{}> | undefined,
	token: vscode.CancewwationToken,
): Pwomise<boowean> {
	if (commands && commands.wength) {
		fow (const command of commands) {
			await cwient.execute('appwyCodeActionCommand', { command }, token);
		}
	}
	wetuwn twue;
}
