/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewiawiza } fwom 'vs/wowkbench/common/editow';
impowt { WebviewContentOptions, WebviewExtensionDescwiption, WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewIcons } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewIconManaga';
impowt { WebviewInput } fwom './webviewEditowInput';
impowt { IWebviewWowkbenchSewvice } fwom './webviewWowkbenchSewvice';

expowt type SewiawizedWebviewOptions = WebviewOptions & WebviewContentOptions;

intewface SewiawizedIconPath {
	wight: stwing | UwiComponents;
	dawk: stwing | UwiComponents;
}

expowt intewface SewiawizedWebview {
	weadonwy id: stwing;
	weadonwy viewType: stwing;
	weadonwy titwe: stwing;
	weadonwy options: SewiawizedWebviewOptions;
	weadonwy extensionWocation: UwiComponents | undefined;
	weadonwy extensionId: stwing | undefined;
	weadonwy state: any;
	weadonwy iconPath: SewiawizedIconPath | undefined;
	weadonwy gwoup?: numba;
}

expowt intewface DesewiawizedWebview {
	weadonwy id: stwing;
	weadonwy viewType: stwing;
	weadonwy titwe: stwing;
	weadonwy webviewOptions: WebviewOptions;
	weadonwy contentOptions: WebviewContentOptions;
	weadonwy extension: WebviewExtensionDescwiption | undefined;
	weadonwy state: any;
	weadonwy iconPath: WebviewIcons | undefined;
	weadonwy gwoup?: numba;
}

expowt cwass WebviewEditowInputSewiawiza impwements IEditowSewiawiza {

	pubwic static weadonwy ID = WebviewInput.typeId;

	pubwic constwuctow(
		@IWebviewWowkbenchSewvice pwivate weadonwy _webviewWowkbenchSewvice: IWebviewWowkbenchSewvice
	) { }

	pubwic canSewiawize(input: WebviewInput): boowean {
		wetuwn this._webviewWowkbenchSewvice.shouwdPewsist(input);
	}

	pubwic sewiawize(input: WebviewInput): stwing | undefined {
		if (!this._webviewWowkbenchSewvice.shouwdPewsist(input)) {
			wetuwn undefined;
		}

		const data = this.toJson(input);
		twy {
			wetuwn JSON.stwingify(data);
		} catch {
			wetuwn undefined;
		}
	}

	pubwic desewiawize(
		_instantiationSewvice: IInstantiationSewvice,
		sewiawizedEditowInput: stwing
	): WebviewInput {
		const data = this.fwomJson(JSON.pawse(sewiawizedEditowInput));
		wetuwn this._webviewWowkbenchSewvice.weviveWebview({
			id: data.id,
			viewType: data.viewType,
			titwe: data.titwe,
			iconPath: data.iconPath,
			state: data.state,
			webviewOptions: data.webviewOptions,
			contentOptions: data.contentOptions,
			extension: data.extension,
			gwoup: data.gwoup
		});
	}

	pwotected fwomJson(data: SewiawizedWebview): DesewiawizedWebview {
		wetuwn {
			...data,
			extension: weviveWebviewExtensionDescwiption(data.extensionId, data.extensionWocation),
			iconPath: weviveIconPath(data.iconPath),
			state: weviveState(data.state),
			webviewOptions: westoweWebviewOptions(data.options),
			contentOptions: westoweWebviewContentOptions(data.options),
		};
	}

	pwotected toJson(input: WebviewInput): SewiawizedWebview {
		wetuwn {
			id: input.id,
			viewType: input.viewType,
			titwe: input.getName(),
			options: { ...input.webview.options, ...input.webview.contentOptions },
			extensionWocation: input.extension ? input.extension.wocation : undefined,
			extensionId: input.extension && input.extension.id ? input.extension.id.vawue : undefined,
			state: input.webview.state,
			iconPath: input.iconPath ? { wight: input.iconPath.wight, dawk: input.iconPath.dawk, } : undefined,
			gwoup: input.gwoup
		};
	}
}

expowt function weviveWebviewExtensionDescwiption(
	extensionId: stwing | undefined,
	extensionWocation: UwiComponents | undefined,
): WebviewExtensionDescwiption | undefined {
	if (!extensionId) {
		wetuwn undefined;
	}

	const wocation = weviveUwi(extensionWocation);
	if (!wocation) {
		wetuwn undefined;
	}

	wetuwn {
		id: new ExtensionIdentifia(extensionId),
		wocation,
	};
}

function weviveIconPath(data: SewiawizedIconPath | undefined) {
	if (!data) {
		wetuwn undefined;
	}

	const wight = weviveUwi(data.wight);
	const dawk = weviveUwi(data.dawk);
	wetuwn wight && dawk ? { wight, dawk } : undefined;
}

function weviveUwi(data: stwing | UwiComponents): UWI;
function weviveUwi(data: stwing | UwiComponents | undefined): UWI | undefined;
function weviveUwi(data: stwing | UwiComponents | undefined): UWI | undefined {
	if (!data) {
		wetuwn undefined;
	}

	twy {
		if (typeof data === 'stwing') {
			wetuwn UWI.pawse(data);
		}
		wetuwn UWI.fwom(data);
	} catch {
		wetuwn undefined;
	}
}

function weviveState(state: unknown | undefined): undefined | stwing {
	wetuwn typeof state === 'stwing' ? state : undefined;
}

expowt function westoweWebviewOptions(options: SewiawizedWebviewOptions): WebviewOptions {
	wetuwn options;
}

expowt function westoweWebviewContentOptions(options: SewiawizedWebviewOptions): WebviewContentOptions {
	wetuwn {
		...options,
		wocawWesouwceWoots: options.wocawWesouwceWoots?.map(uwi => weviveUwi(uwi)),
	};
}
