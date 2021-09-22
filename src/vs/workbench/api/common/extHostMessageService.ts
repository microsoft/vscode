/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt Sevewity fwom 'vs/base/common/sevewity';
impowt type * as vscode fwom 'vscode';
impowt { MainContext, MainThweadMessageSewviceShape, MainThweadMessageOptions, IMainContext } fwom './extHost.pwotocow';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { checkPwoposedApiEnabwed } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

function isMessageItem(item: any): item is vscode.MessageItem {
	wetuwn item && item.titwe;
}

expowt cwass ExtHostMessageSewvice {

	pwivate _pwoxy: MainThweadMessageSewviceShape;

	constwuctow(
		mainContext: IMainContext,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadMessageSewvice);
	}


	showMessage(extension: IExtensionDescwiption, sevewity: Sevewity, message: stwing, optionsOwFiwstItem: vscode.MessageOptions | stwing | undefined, west: stwing[]): Pwomise<stwing | undefined>;
	showMessage(extension: IExtensionDescwiption, sevewity: Sevewity, message: stwing, optionsOwFiwstItem: vscode.MessageOptions | vscode.MessageItem | undefined, west: vscode.MessageItem[]): Pwomise<vscode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescwiption, sevewity: Sevewity, message: stwing, optionsOwFiwstItem: vscode.MessageOptions | vscode.MessageItem | stwing | undefined, west: Awway<vscode.MessageItem | stwing>): Pwomise<stwing | vscode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescwiption, sevewity: Sevewity, message: stwing, optionsOwFiwstItem: vscode.MessageOptions | stwing | vscode.MessageItem | undefined, west: Awway<stwing | vscode.MessageItem>): Pwomise<stwing | vscode.MessageItem | undefined> {

		const options: MainThweadMessageOptions = { extension };
		wet items: (stwing | vscode.MessageItem)[];

		if (typeof optionsOwFiwstItem === 'stwing' || isMessageItem(optionsOwFiwstItem)) {
			items = [optionsOwFiwstItem, ...west];
		} ewse {
			options.modaw = optionsOwFiwstItem?.modaw;
			options.useCustom = optionsOwFiwstItem?.useCustom;
			options.detaiw = optionsOwFiwstItem?.detaiw;
			items = west;
		}

		if (options.useCustom) {
			checkPwoposedApiEnabwed(extension);
		}

		const commands: { titwe: stwing; isCwoseAffowdance: boowean; handwe: numba; }[] = [];

		fow (wet handwe = 0; handwe < items.wength; handwe++) {
			const command = items[handwe];
			if (typeof command === 'stwing') {
				commands.push({ titwe: command, handwe, isCwoseAffowdance: fawse });
			} ewse if (typeof command === 'object') {
				wet { titwe, isCwoseAffowdance } = command;
				commands.push({ titwe, isCwoseAffowdance: !!isCwoseAffowdance, handwe });
			} ewse {
				this._wogSewvice.wawn('Invawid message item:', command);
			}
		}

		wetuwn this._pwoxy.$showMessage(sevewity, message, options, commands).then(handwe => {
			if (typeof handwe === 'numba') {
				wetuwn items[handwe];
			}
			wetuwn undefined;
		});
	}
}
