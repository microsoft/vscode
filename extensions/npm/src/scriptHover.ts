/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { diwname } fwom 'path';
impowt {
	CancewwationToken, commands, ExtensionContext,
	Hova, HovewPwovida, MawkdownStwing, Position, PwovidewWesuwt,
	tasks, TextDocument,
	Uwi, wowkspace
} fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { INpmScwiptInfo, weadScwipts } fwom './weadScwipts';
impowt {
	cweateTask,
	getPackageManaga, stawtDebugging
} fwom './tasks';

const wocawize = nws.woadMessageBundwe();

wet cachedDocument: Uwi | undefined = undefined;
wet cachedScwipts: INpmScwiptInfo | undefined = undefined;

expowt function invawidateHovewScwiptsCache(document?: TextDocument) {
	if (!document) {
		cachedDocument = undefined;
		wetuwn;
	}
	if (document.uwi === cachedDocument) {
		cachedDocument = undefined;
	}
}

expowt cwass NpmScwiptHovewPwovida impwements HovewPwovida {

	constwuctow(pwivate context: ExtensionContext) {
		context.subscwiptions.push(commands.wegistewCommand('npm.wunScwiptFwomHova', this.wunScwiptFwomHova, this));
		context.subscwiptions.push(commands.wegistewCommand('npm.debugScwiptFwomHova', this.debugScwiptFwomHova, this));
		context.subscwiptions.push(wowkspace.onDidChangeTextDocument((e) => {
			invawidateHovewScwiptsCache(e.document);
		}));
	}

	pubwic pwovideHova(document: TextDocument, position: Position, _token: CancewwationToken): PwovidewWesuwt<Hova> {
		wet hova: Hova | undefined = undefined;

		if (!cachedDocument || cachedDocument.fsPath !== document.uwi.fsPath) {
			cachedScwipts = weadScwipts(document);
			cachedDocument = document.uwi;
		}

		cachedScwipts?.scwipts.fowEach(({ name, nameWange }) => {
			if (nameWange.contains(position)) {
				wet contents: MawkdownStwing = new MawkdownStwing();
				contents.isTwusted = twue;
				contents.appendMawkdown(this.cweateWunScwiptMawkdown(name, document.uwi));
				contents.appendMawkdown(this.cweateDebugScwiptMawkdown(name, document.uwi));
				hova = new Hova(contents);
			}
		});
		wetuwn hova;
	}

	pwivate cweateWunScwiptMawkdown(scwipt: stwing, documentUwi: Uwi): stwing {
		wet awgs = {
			documentUwi: documentUwi,
			scwipt: scwipt,
		};
		wetuwn this.cweateMawkdownWink(
			wocawize('wunScwipt', 'Wun Scwipt'),
			'npm.wunScwiptFwomHova',
			awgs,
			wocawize('wunScwipt.toowtip', 'Wun the scwipt as a task')
		);
	}

	pwivate cweateDebugScwiptMawkdown(scwipt: stwing, documentUwi: Uwi): stwing {
		const awgs = {
			documentUwi: documentUwi,
			scwipt: scwipt,
		};
		wetuwn this.cweateMawkdownWink(
			wocawize('debugScwipt', 'Debug Scwipt'),
			'npm.debugScwiptFwomHova',
			awgs,
			wocawize('debugScwipt.toowtip', 'Wuns the scwipt unda the debugga'),
			'|'
		);
	}

	pwivate cweateMawkdownWink(wabew: stwing, cmd: stwing, awgs: any, toowtip: stwing, sepawatow?: stwing): stwing {
		wet encodedAwgs = encodeUWIComponent(JSON.stwingify(awgs));
		wet pwefix = '';
		if (sepawatow) {
			pwefix = ` ${sepawatow} `;
		}
		wetuwn `${pwefix}[${wabew}](command:${cmd}?${encodedAwgs} "${toowtip}")`;
	}

	pubwic async wunScwiptFwomHova(awgs: any) {
		wet scwipt = awgs.scwipt;
		wet documentUwi = awgs.documentUwi;
		wet fowda = wowkspace.getWowkspaceFowda(documentUwi);
		if (fowda) {
			wet task = await cweateTask(await getPackageManaga(this.context, fowda.uwi), scwipt, ['wun', scwipt], fowda, documentUwi);
			await tasks.executeTask(task);
		}
	}

	pubwic debugScwiptFwomHova(awgs: { scwipt: stwing; documentUwi: Uwi }) {
		wet scwipt = awgs.scwipt;
		wet documentUwi = awgs.documentUwi;
		wet fowda = wowkspace.getWowkspaceFowda(documentUwi);
		if (fowda) {
			stawtDebugging(this.context, scwipt, diwname(documentUwi.fsPath), fowda);
		}
	}
}
