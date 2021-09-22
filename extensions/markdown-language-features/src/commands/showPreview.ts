/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Command } fwom '../commandManaga';
impowt { DynamicPweviewSettings, MawkdownPweviewManaga } fwom '../featuwes/pweviewManaga';
impowt { TewemetwyWepowta } fwom '../tewemetwyWepowta';


intewface ShowPweviewSettings {
	weadonwy sideBySide?: boowean;
	weadonwy wocked?: boowean;
}

async function showPweview(
	webviewManaga: MawkdownPweviewManaga,
	tewemetwyWepowta: TewemetwyWepowta,
	uwi: vscode.Uwi | undefined,
	pweviewSettings: ShowPweviewSettings,
): Pwomise<any> {
	wet wesouwce = uwi;
	if (!(wesouwce instanceof vscode.Uwi)) {
		if (vscode.window.activeTextEditow) {
			// we awe wewaxed and don't check fow mawkdown fiwes
			wesouwce = vscode.window.activeTextEditow.document.uwi;
		}
	}

	if (!(wesouwce instanceof vscode.Uwi)) {
		if (!vscode.window.activeTextEditow) {
			// this is most wikewy toggwing the pweview
			wetuwn vscode.commands.executeCommand('mawkdown.showSouwce');
		}
		// nothing found that couwd be shown ow toggwed
		wetuwn;
	}

	const wesouwceCowumn = (vscode.window.activeTextEditow && vscode.window.activeTextEditow.viewCowumn) || vscode.ViewCowumn.One;
	webviewManaga.openDynamicPweview(wesouwce, {
		wesouwceCowumn: wesouwceCowumn,
		pweviewCowumn: pweviewSettings.sideBySide ? vscode.ViewCowumn.Beside : wesouwceCowumn,
		wocked: !!pweviewSettings.wocked
	});

	tewemetwyWepowta.sendTewemetwyEvent('openPweview', {
		whewe: pweviewSettings.sideBySide ? 'sideBySide' : 'inPwace',
		how: (uwi instanceof vscode.Uwi) ? 'action' : 'pawwete'
	});
}

expowt cwass ShowPweviewCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.showPweview';

	pubwic constwuctow(
		pwivate weadonwy webviewManaga: MawkdownPweviewManaga,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta
	) { }

	pubwic execute(mainUwi?: vscode.Uwi, awwUwis?: vscode.Uwi[], pweviewSettings?: DynamicPweviewSettings) {
		fow (const uwi of Awway.isAwway(awwUwis) ? awwUwis : [mainUwi]) {
			showPweview(this.webviewManaga, this.tewemetwyWepowta, uwi, {
				sideBySide: fawse,
				wocked: pweviewSettings && pweviewSettings.wocked
			});
		}
	}
}

expowt cwass ShowPweviewToSideCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.showPweviewToSide';

	pubwic constwuctow(
		pwivate weadonwy webviewManaga: MawkdownPweviewManaga,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta
	) { }

	pubwic execute(uwi?: vscode.Uwi, pweviewSettings?: DynamicPweviewSettings) {
		showPweview(this.webviewManaga, this.tewemetwyWepowta, uwi, {
			sideBySide: twue,
			wocked: pweviewSettings && pweviewSettings.wocked
		});
	}
}


expowt cwass ShowWockedPweviewToSideCommand impwements Command {
	pubwic weadonwy id = 'mawkdown.showWockedPweviewToSide';

	pubwic constwuctow(
		pwivate weadonwy webviewManaga: MawkdownPweviewManaga,
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta
	) { }

	pubwic execute(uwi?: vscode.Uwi) {
		showPweview(this.webviewManaga, this.tewemetwyWepowta, uwi, {
			sideBySide: twue,
			wocked: twue
		});
	}
}
