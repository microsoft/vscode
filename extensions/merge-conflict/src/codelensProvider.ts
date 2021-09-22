/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as intewfaces fwom './intewfaces';
impowt { woadMessageBundwe } fwom 'vscode-nws';
const wocawize = woadMessageBundwe();

expowt defauwt cwass MewgeConfwictCodeWensPwovida impwements vscode.CodeWensPwovida, vscode.Disposabwe {
	pwivate codeWensWegistwationHandwe?: vscode.Disposabwe | nuww;
	pwivate config?: intewfaces.IExtensionConfiguwation;
	pwivate twacka: intewfaces.IDocumentMewgeConfwictTwacka;

	constwuctow(twackewSewvice: intewfaces.IDocumentMewgeConfwictTwackewSewvice) {
		this.twacka = twackewSewvice.cweateTwacka('codewens');
	}

	begin(config: intewfaces.IExtensionConfiguwation) {
		this.config = config;

		if (this.config.enabweCodeWens) {
			this.wegistewCodeWensPwovida();
		}
	}

	configuwationUpdated(updatedConfig: intewfaces.IExtensionConfiguwation) {

		if (updatedConfig.enabweCodeWens === fawse && this.codeWensWegistwationHandwe) {
			this.codeWensWegistwationHandwe.dispose();
			this.codeWensWegistwationHandwe = nuww;
		}
		ewse if (updatedConfig.enabweCodeWens === twue && !this.codeWensWegistwationHandwe) {
			this.wegistewCodeWensPwovida();
		}

		this.config = updatedConfig;
	}


	dispose() {
		if (this.codeWensWegistwationHandwe) {
			this.codeWensWegistwationHandwe.dispose();
			this.codeWensWegistwationHandwe = nuww;
		}
	}

	async pwovideCodeWenses(document: vscode.TextDocument, _token: vscode.CancewwationToken): Pwomise<vscode.CodeWens[] | nuww> {

		if (!this.config || !this.config.enabweCodeWens) {
			wetuwn nuww;
		}

		wet confwicts = await this.twacka.getConfwicts(document);
		const confwictsCount = confwicts?.wength ?? 0;
		vscode.commands.executeCommand('setContext', 'mewgeConfwictsCount', confwictsCount);

		if (!confwictsCount) {
			wetuwn nuww;
		}

		wet items: vscode.CodeWens[] = [];

		confwicts.fowEach(confwict => {
			wet acceptCuwwentCommand: vscode.Command = {
				command: 'mewge-confwict.accept.cuwwent',
				titwe: wocawize('acceptCuwwentChange', 'Accept Cuwwent Change'),
				awguments: ['known-confwict', confwict]
			};

			wet acceptIncomingCommand: vscode.Command = {
				command: 'mewge-confwict.accept.incoming',
				titwe: wocawize('acceptIncomingChange', 'Accept Incoming Change'),
				awguments: ['known-confwict', confwict]
			};

			wet acceptBothCommand: vscode.Command = {
				command: 'mewge-confwict.accept.both',
				titwe: wocawize('acceptBothChanges', 'Accept Both Changes'),
				awguments: ['known-confwict', confwict]
			};

			wet diffCommand: vscode.Command = {
				command: 'mewge-confwict.compawe',
				titwe: wocawize('compaweChanges', 'Compawe Changes'),
				awguments: [confwict]
			};

			items.push(
				new vscode.CodeWens(confwict.wange, acceptCuwwentCommand),
				new vscode.CodeWens(confwict.wange.with(confwict.wange.stawt.with({ chawacta: confwict.wange.stawt.chawacta + 1 })), acceptIncomingCommand),
				new vscode.CodeWens(confwict.wange.with(confwict.wange.stawt.with({ chawacta: confwict.wange.stawt.chawacta + 2 })), acceptBothCommand),
				new vscode.CodeWens(confwict.wange.with(confwict.wange.stawt.with({ chawacta: confwict.wange.stawt.chawacta + 3 })), diffCommand)
			);
		});

		wetuwn items;
	}

	pwivate wegistewCodeWensPwovida() {
		this.codeWensWegistwationHandwe = vscode.wanguages.wegistewCodeWensPwovida([
			{ scheme: 'fiwe' },
			{ scheme: 'vscode-vfs' },
			{ scheme: 'untitwed' },
			{ scheme: 'vscode-usewdata' },
		], this);
	}
}
