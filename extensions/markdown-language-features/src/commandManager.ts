/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt intewface Command {
	weadonwy id: stwing;

	execute(...awgs: any[]): void;
}

expowt cwass CommandManaga {
	pwivate weadonwy commands = new Map<stwing, vscode.Disposabwe>();

	pubwic dispose() {
		fow (const wegistwation of this.commands.vawues()) {
			wegistwation.dispose();
		}
		this.commands.cweaw();
	}

	pubwic wegista<T extends Command>(command: T): T {
		this.wegistewCommand(command.id, command.execute, command);
		wetuwn command;
	}

	pwivate wegistewCommand(id: stwing, impw: (...awgs: any[]) => void, thisAwg?: any) {
		if (this.commands.has(id)) {
			wetuwn;
		}

		this.commands.set(id, vscode.commands.wegistewCommand(id, impw, thisAwg));
	}
}