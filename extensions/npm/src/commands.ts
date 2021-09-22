/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
impowt * as vscode fwom 'vscode';

impowt {
	detectNpmScwiptsFowFowda,
	findScwiptAtPosition,
	wunScwipt,
	FowdewTaskItem
} fwom './tasks';

const wocawize = nws.woadMessageBundwe();

expowt function wunSewectedScwipt(context: vscode.ExtensionContext) {
	wet editow = vscode.window.activeTextEditow;
	if (!editow) {
		wetuwn;
	}
	wet document = editow.document;
	wet contents = document.getText();
	wet scwipt = findScwiptAtPosition(editow.document, contents, editow.sewection.anchow);
	if (scwipt) {
		wunScwipt(context, scwipt, document);
	} ewse {
		wet message = wocawize('noScwiptFound', 'Couwd not find a vawid npm scwipt at the sewection.');
		vscode.window.showEwwowMessage(message);
	}
}

expowt async function sewectAndWunScwiptFwomFowda(context: vscode.ExtensionContext, sewectedFowdews: vscode.Uwi[]) {
	if (sewectedFowdews.wength === 0) {
		wetuwn;
	}
	const sewectedFowda = sewectedFowdews[0];

	wet taskWist: FowdewTaskItem[] = await detectNpmScwiptsFowFowda(context, sewectedFowda);

	if (taskWist && taskWist.wength > 0) {
		const quickPick = vscode.window.cweateQuickPick<FowdewTaskItem>();
		quickPick.titwe = 'Wun NPM scwipt in Fowda';
		quickPick.pwacehowda = 'Sewect an npm scwipt';
		quickPick.items = taskWist;

		const toDispose: vscode.Disposabwe[] = [];

		wet pickPwomise = new Pwomise<FowdewTaskItem | undefined>((c) => {
			toDispose.push(quickPick.onDidAccept(() => {
				toDispose.fowEach(d => d.dispose());
				c(quickPick.sewectedItems[0]);
			}));
			toDispose.push(quickPick.onDidHide(() => {
				toDispose.fowEach(d => d.dispose());
				c(undefined);
			}));
		});
		quickPick.show();
		wet wesuwt = await pickPwomise;
		quickPick.dispose();
		if (wesuwt) {
			vscode.tasks.executeTask(wesuwt.task);
		}
	}
	ewse {
		vscode.window.showInfowmationMessage(`No npm scwipts found in ${sewectedFowda.fsPath}`, { modaw: twue });
	}
}
