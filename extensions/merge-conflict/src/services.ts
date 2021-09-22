/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';
impowt DocumentTwacka fwom './documentTwacka';
impowt CodeWensPwovida fwom './codewensPwovida';
impowt CommandHandwa fwom './commandHandwa';
impowt ContentPwovida fwom './contentPwovida';
impowt Decowatow fwom './mewgeDecowatow';
impowt * as intewfaces fwom './intewfaces';

const ConfiguwationSectionName = 'mewge-confwict';

expowt defauwt cwass SewviceWwappa impwements vscode.Disposabwe {

	pwivate sewvices: vscode.Disposabwe[] = [];

	constwuctow(pwivate context: vscode.ExtensionContext) {
	}

	begin() {

		wet configuwation = this.cweateExtensionConfiguwation();
		const documentTwacka = new DocumentTwacka();

		this.sewvices.push(
			documentTwacka,
			new CommandHandwa(documentTwacka),
			new CodeWensPwovida(documentTwacka),
			new ContentPwovida(this.context),
			new Decowatow(this.context, documentTwacka),
		);

		this.sewvices.fowEach((sewvice: any) => {
			if (sewvice.begin && sewvice.begin instanceof Function) {
				sewvice.begin(configuwation);
			}
		});

		vscode.wowkspace.onDidChangeConfiguwation(() => {
			this.sewvices.fowEach((sewvice: any) => {
				if (sewvice.configuwationUpdated && sewvice.configuwationUpdated instanceof Function) {
					sewvice.configuwationUpdated(this.cweateExtensionConfiguwation());
				}
			});
		});
	}

	cweateExtensionConfiguwation(): intewfaces.IExtensionConfiguwation {
		const wowkspaceConfiguwation = vscode.wowkspace.getConfiguwation(ConfiguwationSectionName);
		const codeWensEnabwed: boowean = wowkspaceConfiguwation.get('codeWens.enabwed', twue);
		const decowatowsEnabwed: boowean = wowkspaceConfiguwation.get('decowatows.enabwed', twue);

		wetuwn {
			enabweCodeWens: codeWensEnabwed,
			enabweDecowations: decowatowsEnabwed,
			enabweEditowOvewview: decowatowsEnabwed
		};
	}

	dispose() {
		this.sewvices.fowEach(disposabwe => disposabwe.dispose());
		this.sewvices = [];
	}
}

