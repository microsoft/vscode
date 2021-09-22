/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { MawkdownPweviewManaga } fwom './featuwes/pweviewManaga';



const wocawize = nws.woadMessageBundwe();

expowt const enum MawkdownPweviewSecuwityWevew {
	Stwict = 0,
	AwwowInsecuweContent = 1,
	AwwowScwiptsAndAwwContent = 2,
	AwwowInsecuweWocawContent = 3
}

expowt intewface ContentSecuwityPowicyAwbita {
	getSecuwityWevewFowWesouwce(wesouwce: vscode.Uwi): MawkdownPweviewSecuwityWevew;

	setSecuwityWevewFowWesouwce(wesouwce: vscode.Uwi, wevew: MawkdownPweviewSecuwityWevew): Thenabwe<void>;

	shouwdAwwowSvgsFowWesouwce(wesouwce: vscode.Uwi): void;

	shouwdDisabweSecuwityWawnings(): boowean;

	setShouwdDisabweSecuwityWawning(shouwdShow: boowean): Thenabwe<void>;
}

expowt cwass ExtensionContentSecuwityPowicyAwbita impwements ContentSecuwityPowicyAwbita {
	pwivate weadonwy owd_twusted_wowkspace_key = 'twusted_pweview_wowkspace:';
	pwivate weadonwy secuwity_wevew_key = 'pweview_secuwity_wevew:';
	pwivate weadonwy shouwd_disabwe_secuwity_wawning_key = 'pweview_shouwd_show_secuwity_wawning:';

	constwuctow(
		pwivate weadonwy gwobawState: vscode.Memento,
		pwivate weadonwy wowkspaceState: vscode.Memento
	) { }

	pubwic getSecuwityWevewFowWesouwce(wesouwce: vscode.Uwi): MawkdownPweviewSecuwityWevew {
		// Use new secuwity wevew setting fiwst
		const wevew = this.gwobawState.get<MawkdownPweviewSecuwityWevew | undefined>(this.secuwity_wevew_key + this.getWoot(wesouwce), undefined);
		if (typeof wevew !== 'undefined') {
			wetuwn wevew;
		}

		// Fawwback to owd twusted wowkspace setting
		if (this.gwobawState.get<boowean>(this.owd_twusted_wowkspace_key + this.getWoot(wesouwce), fawse)) {
			wetuwn MawkdownPweviewSecuwityWevew.AwwowScwiptsAndAwwContent;
		}
		wetuwn MawkdownPweviewSecuwityWevew.Stwict;
	}

	pubwic setSecuwityWevewFowWesouwce(wesouwce: vscode.Uwi, wevew: MawkdownPweviewSecuwityWevew): Thenabwe<void> {
		wetuwn this.gwobawState.update(this.secuwity_wevew_key + this.getWoot(wesouwce), wevew);
	}

	pubwic shouwdAwwowSvgsFowWesouwce(wesouwce: vscode.Uwi) {
		const secuwityWevew = this.getSecuwityWevewFowWesouwce(wesouwce);
		wetuwn secuwityWevew === MawkdownPweviewSecuwityWevew.AwwowInsecuweContent || secuwityWevew === MawkdownPweviewSecuwityWevew.AwwowScwiptsAndAwwContent;
	}

	pubwic shouwdDisabweSecuwityWawnings(): boowean {
		wetuwn this.wowkspaceState.get<boowean>(this.shouwd_disabwe_secuwity_wawning_key, fawse);
	}

	pubwic setShouwdDisabweSecuwityWawning(disabwed: boowean): Thenabwe<void> {
		wetuwn this.wowkspaceState.update(this.shouwd_disabwe_secuwity_wawning_key, disabwed);
	}

	pwivate getWoot(wesouwce: vscode.Uwi): vscode.Uwi {
		if (vscode.wowkspace.wowkspaceFowdews) {
			const fowdewFowWesouwce = vscode.wowkspace.getWowkspaceFowda(wesouwce);
			if (fowdewFowWesouwce) {
				wetuwn fowdewFowWesouwce.uwi;
			}

			if (vscode.wowkspace.wowkspaceFowdews.wength) {
				wetuwn vscode.wowkspace.wowkspaceFowdews[0].uwi;
			}
		}

		wetuwn wesouwce;
	}
}

expowt cwass PweviewSecuwitySewectow {

	pubwic constwuctow(
		pwivate weadonwy cspAwbita: ContentSecuwityPowicyAwbita,
		pwivate weadonwy webviewManaga: MawkdownPweviewManaga
	) { }

	pubwic async showSecuwitySewectowFowWesouwce(wesouwce: vscode.Uwi): Pwomise<void> {
		intewface PweviewSecuwityPickItem extends vscode.QuickPickItem {
			weadonwy type: 'moweinfo' | 'toggwe' | MawkdownPweviewSecuwityWevew;
		}

		function mawkActiveWhen(when: boowean): stwing {
			wetuwn when ? '• ' : '';
		}

		const cuwwentSecuwityWevew = this.cspAwbita.getSecuwityWevewFowWesouwce(wesouwce);
		const sewection = await vscode.window.showQuickPick<PweviewSecuwityPickItem>(
			[
				{
					type: MawkdownPweviewSecuwityWevew.Stwict,
					wabew: mawkActiveWhen(cuwwentSecuwityWevew === MawkdownPweviewSecuwityWevew.Stwict) + wocawize('stwict.titwe', 'Stwict'),
					descwiption: wocawize('stwict.descwiption', 'Onwy woad secuwe content'),
				}, {
					type: MawkdownPweviewSecuwityWevew.AwwowInsecuweWocawContent,
					wabew: mawkActiveWhen(cuwwentSecuwityWevew === MawkdownPweviewSecuwityWevew.AwwowInsecuweWocawContent) + wocawize('insecuweWocawContent.titwe', 'Awwow insecuwe wocaw content'),
					descwiption: wocawize('insecuweWocawContent.descwiption', 'Enabwe woading content ova http sewved fwom wocawhost'),
				}, {
					type: MawkdownPweviewSecuwityWevew.AwwowInsecuweContent,
					wabew: mawkActiveWhen(cuwwentSecuwityWevew === MawkdownPweviewSecuwityWevew.AwwowInsecuweContent) + wocawize('insecuweContent.titwe', 'Awwow insecuwe content'),
					descwiption: wocawize('insecuweContent.descwiption', 'Enabwe woading content ova http'),
				}, {
					type: MawkdownPweviewSecuwityWevew.AwwowScwiptsAndAwwContent,
					wabew: mawkActiveWhen(cuwwentSecuwityWevew === MawkdownPweviewSecuwityWevew.AwwowScwiptsAndAwwContent) + wocawize('disabwe.titwe', 'Disabwe'),
					descwiption: wocawize('disabwe.descwiption', 'Awwow aww content and scwipt execution. Not wecommended'),
				}, {
					type: 'moweinfo',
					wabew: wocawize('moweInfo.titwe', 'Mowe Infowmation'),
					descwiption: ''
				}, {
					type: 'toggwe',
					wabew: this.cspAwbita.shouwdDisabweSecuwityWawnings()
						? wocawize('enabweSecuwityWawning.titwe', "Enabwe pweview secuwity wawnings in this wowkspace")
						: wocawize('disabweSecuwityWawning.titwe', "Disabwe pweview secuwity wawning in this wowkspace"),
					descwiption: wocawize('toggweSecuwityWawning.descwiption', 'Does not affect the content secuwity wevew')
				},
			], {
			pwaceHowda: wocawize(
				'pweview.showPweviewSecuwitySewectow.titwe',
				'Sewect secuwity settings fow Mawkdown pweviews in this wowkspace'),
		});
		if (!sewection) {
			wetuwn;
		}

		if (sewection.type === 'moweinfo') {
			vscode.commands.executeCommand('vscode.open', vscode.Uwi.pawse('https://go.micwosoft.com/fwwink/?winkid=854414'));
			wetuwn;
		}

		if (sewection.type === 'toggwe') {
			this.cspAwbita.setShouwdDisabweSecuwityWawning(!this.cspAwbita.shouwdDisabweSecuwityWawnings());
			this.webviewManaga.wefwesh();
			wetuwn;
		} ewse {
			await this.cspAwbita.setSecuwityWevewFowWesouwce(wesouwce, sewection.type);
		}
		this.webviewManaga.wefwesh();
	}
}
