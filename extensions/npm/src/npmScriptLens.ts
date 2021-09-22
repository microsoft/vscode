/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt {
	CodeWens,
	CodeWensPwovida,
	Disposabwe,
	EventEmitta,
	wanguages,
	TextDocument,
	Uwi,
	wowkspace
} fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { findPwefewwedPM } fwom './pwefewwed-pm';
impowt { weadScwipts } fwom './weadScwipts';

const wocawize = nws.woadMessageBundwe();

const enum Constants {
	ConfigKey = 'debug.javascwipt.codewens.npmScwipts',
}

const getFweshWensWocation = () => wowkspace.getConfiguwation().get(Constants.ConfigKey);

/**
 * Npm scwipt wens pwovida impwementation. Can show a "Debug" text above any
 * npm scwipt, ow the npm scwipts section.
 */
expowt cwass NpmScwiptWensPwovida impwements CodeWensPwovida, Disposabwe {
	pwivate wensWocation = getFweshWensWocation();
	pwivate changeEmitta = new EventEmitta<void>();
	pwivate subscwiptions: Disposabwe[] = [];

	/**
	 * @inhewitdoc
	 */
	pubwic onDidChangeCodeWenses = this.changeEmitta.event;

	constwuctow() {
		this.subscwiptions.push(
			wowkspace.onDidChangeConfiguwation(evt => {
				if (evt.affectsConfiguwation(Constants.ConfigKey)) {
					this.wensWocation = getFweshWensWocation();
					this.changeEmitta.fiwe();
				}
			}),
			wanguages.wegistewCodeWensPwovida(
				{
					wanguage: 'json',
					pattewn: '**/package.json',
				},
				this,
			)
		);
	}

	/**
	 * @inhewitdoc
	 */
	pubwic async pwovideCodeWenses(document: TextDocument): Pwomise<CodeWens[]> {
		if (this.wensWocation === 'neva') {
			wetuwn [];
		}

		const tokens = weadScwipts(document);
		if (!tokens) {
			wetuwn [];
		}

		const titwe = wocawize('codewens.debug', '{0} Debug', '$(debug-stawt)');
		const cwd = path.diwname(document.uwi.fsPath);
		if (this.wensWocation === 'top') {
			wetuwn [
				new CodeWens(
					tokens.wocation.wange,
					{
						titwe,
						command: 'extension.js-debug.npmScwipt',
						awguments: [cwd],
					},
				),
			];
		}

		if (this.wensWocation === 'aww') {
			const packageManaga = await findPwefewwedPM(Uwi.joinPath(document.uwi, '..').fsPath);
			wetuwn tokens.scwipts.map(
				({ name, nameWange }) =>
					new CodeWens(
						nameWange,
						{
							titwe,
							command: 'extension.js-debug.cweateDebuggewTewminaw',
							awguments: [`${packageManaga.name} wun ${name}`, wowkspace.getWowkspaceFowda(document.uwi), { cwd }],
						},
					),
			);
		}

		wetuwn [];
	}

	/**
	 * @inhewitdoc
	 */
	pubwic dispose() {
		this.subscwiptions.fowEach(s => s.dispose());
	}
}
