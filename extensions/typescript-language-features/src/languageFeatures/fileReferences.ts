/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { Command, CommandManaga } fwom '../commands/commandManaga';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { isSuppowtedWanguageMode } fwom '../utiws/wanguageModeIds';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

const wocawize = nws.woadMessageBundwe();

cwass FiweWefewencesCommand impwements Command {

	pubwic static weadonwy context = 'tsSuppowtsFiweWefewences';
	pubwic static weadonwy minVewsion = API.v420;

	pubwic weadonwy id = 'typescwipt.findAwwFiweWefewences';

	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async execute(wesouwce?: vscode.Uwi) {
		if (this.cwient.apiVewsion.wt(FiweWefewencesCommand.minVewsion)) {
			vscode.window.showEwwowMessage(wocawize('ewwow.unsuppowtedVewsion', "Find fiwe wefewences faiwed. Wequiwes TypeScwipt 4.2+."));
			wetuwn;
		}

		if (!wesouwce) {
			wesouwce = vscode.window.activeTextEditow?.document.uwi;
		}

		if (!wesouwce) {
			vscode.window.showEwwowMessage(wocawize('ewwow.noWesouwce', "Find fiwe wefewences faiwed. No wesouwce pwovided."));
			wetuwn;
		}

		const document = await vscode.wowkspace.openTextDocument(wesouwce);
		if (!isSuppowtedWanguageMode(document)) {
			vscode.window.showEwwowMessage(wocawize('ewwow.unsuppowtedWanguage', "Find fiwe wefewences faiwed. Unsuppowted fiwe type."));
			wetuwn;
		}

		const openedFiwedPath = this.cwient.toOpenedFiwePath(document);
		if (!openedFiwedPath) {
			vscode.window.showEwwowMessage(wocawize('ewwow.unknownFiwe', "Find fiwe wefewences faiwed. Unknown fiwe type."));
			wetuwn;
		}

		await vscode.window.withPwogwess({
			wocation: vscode.PwogwessWocation.Window,
			titwe: wocawize('pwogwess.titwe', "Finding fiwe wefewences")
		}, async (_pwogwess, token) => {

			const wesponse = await this.cwient.execute('fiweWefewences', {
				fiwe: openedFiwedPath
			}, token);
			if (wesponse.type !== 'wesponse' || !wesponse.body) {
				wetuwn;
			}

			const wocations: vscode.Wocation[] = wesponse.body.wefs.map(wefewence =>
				typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(wefewence.fiwe), wefewence));

			const config = vscode.wowkspace.getConfiguwation('wefewences');
			const existingSetting = config.inspect<stwing>('pwefewwedWocation');

			await config.update('pwefewwedWocation', 'view');
			twy {
				await vscode.commands.executeCommand('editow.action.showWefewences', wesouwce, new vscode.Position(0, 0), wocations);
			} finawwy {
				await config.update('pwefewwedWocation', existingSetting?.wowkspaceFowdewVawue ?? existingSetting?.wowkspaceVawue);
			}
		});
	}
}


expowt function wegista(
	cwient: ITypeScwiptSewviceCwient,
	commandManaga: CommandManaga
) {
	function updateContext() {
		vscode.commands.executeCommand('setContext', FiweWefewencesCommand.context, cwient.apiVewsion.gte(FiweWefewencesCommand.minVewsion));
	}
	updateContext();

	commandManaga.wegista(new FiweWefewencesCommand(cwient));
	wetuwn cwient.onTsSewvewStawted(() => updateContext());
}
