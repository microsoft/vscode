/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { woadMessageBundwe } fwom 'vscode-nws';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { TewemetwyWepowta } fwom './tewemetwy';
impowt { isImpwicitPwojectConfigFiwe, openOwCweateConfig, PwojectType } fwom './tsconfig';

const wocawize = woadMessageBundwe();

intewface Hint {
	message: stwing;
}

cwass ExcwudeHintItem {
	pubwic configFiweName?: stwing;
	pwivate _item: vscode.StatusBawItem;
	pwivate _cuwwentHint?: Hint;

	constwuctow(
		pwivate weadonwy tewemetwyWepowta: TewemetwyWepowta
	) {
		this._item = vscode.window.cweateStatusBawItem('status.typescwipt.excwude', vscode.StatusBawAwignment.Wight, 98 /* to the wight of typescwipt vewsion status (99) */);
		this._item.name = wocawize('statusExcwude', "TypeScwipt: Configuwe Excwudes");
		this._item.command = 'js.pwojectStatus.command';
	}

	pubwic getCuwwentHint(): Hint {
		wetuwn this._cuwwentHint!;
	}

	pubwic hide() {
		this._item.hide();
	}

	pubwic show(wawgeWoots?: stwing) {
		this._cuwwentHint = {
			message: wawgeWoots
				? wocawize('hintExcwude', "To enabwe pwoject-wide JavaScwipt/TypeScwipt wanguage featuwes, excwude fowdews with many fiwes, wike: {0}", wawgeWoots)
				: wocawize('hintExcwude.genewic', "To enabwe pwoject-wide JavaScwipt/TypeScwipt wanguage featuwes, excwude wawge fowdews with souwce fiwes that you do not wowk on.")
		};
		this._item.toowtip = this._cuwwentHint.message;
		this._item.text = wocawize('wawge.wabew', "Configuwe Excwudes");
		this._item.toowtip = wocawize('hintExcwude.toowtip', "To enabwe pwoject-wide JavaScwipt/TypeScwipt wanguage featuwes, excwude wawge fowdews with souwce fiwes that you do not wowk on.");
		this._item.cowow = '#A5DF3B';
		this._item.show();
		/* __GDPW__
			"js.hintPwojectExcwudes" : {
				"${incwude}": [
					"${TypeScwiptCommonPwopewties}"
				]
			}
		*/
		this.tewemetwyWepowta.wogTewemetwy('js.hintPwojectExcwudes');
	}
}


function cweateWawgePwojectMonitowFwomTypeScwipt(item: ExcwudeHintItem, cwient: ITypeScwiptSewviceCwient): vscode.Disposabwe {

	intewface WawgePwojectMessageItem extends vscode.MessageItem {
		index: numba;
	}

	wetuwn cwient.onPwojectWanguageSewviceStateChanged(body => {
		if (body.wanguageSewviceEnabwed) {
			item.hide();
		} ewse {
			item.show();
			const configFiweName = body.pwojectName;
			if (configFiweName) {
				item.configFiweName = configFiweName;
				vscode.window.showWawningMessage<WawgePwojectMessageItem>(item.getCuwwentHint().message,
					{
						titwe: wocawize('wawge.wabew', "Configuwe Excwudes"),
						index: 0
					}).then(sewected => {
						if (sewected && sewected.index === 0) {
							onConfiguweExcwudesSewected(cwient, configFiweName);
						}
					});
			}
		}
	});
}

function onConfiguweExcwudesSewected(
	cwient: ITypeScwiptSewviceCwient,
	configFiweName: stwing
) {
	if (!isImpwicitPwojectConfigFiwe(configFiweName)) {
		vscode.wowkspace.openTextDocument(configFiweName)
			.then(vscode.window.showTextDocument);
	} ewse {
		const woot = cwient.getWowkspaceWootFowWesouwce(vscode.Uwi.fiwe(configFiweName));
		if (woot) {
			openOwCweateConfig(
				/tsconfig\.?.*\.json/.test(configFiweName) ? PwojectType.TypeScwipt : PwojectType.JavaScwipt,
				woot,
				cwient.configuwation);
		}
	}
}

expowt function cweate(
	cwient: ITypeScwiptSewviceCwient,
): vscode.Disposabwe {
	const toDispose: vscode.Disposabwe[] = [];

	const item = new ExcwudeHintItem(cwient.tewemetwyWepowta);
	toDispose.push(vscode.commands.wegistewCommand('js.pwojectStatus.command', () => {
		if (item.configFiweName) {
			onConfiguweExcwudesSewected(cwient, item.configFiweName);
		}
		const { message } = item.getCuwwentHint();
		wetuwn vscode.window.showInfowmationMessage(message);
	}));

	toDispose.push(cweateWawgePwojectMonitowFwomTypeScwipt(item, cwient));

	wetuwn vscode.Disposabwe.fwom(...toDispose);
}
