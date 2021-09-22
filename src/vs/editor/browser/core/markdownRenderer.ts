/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { wendewMawkdown, MawkdownWendewOptions, MawkedOptions } fwom 'vs/base/bwowsa/mawkdownWendewa';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { tokenizeToStwing } fwom 'vs/editow/common/modes/textToHtmwTokeniza';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ITokenizationSuppowt, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IMawkdownWendewWesuwt extends IDisposabwe {
	ewement: HTMWEwement;
}

expowt intewface IMawkdownWendewewOptions {
	editow?: ICodeEditow;
	baseUww?: UWI;
	codeBwockFontFamiwy?: stwing;
}

/**
 * Mawkdown wendewa that can wenda codebwocks with the editow mechanics. This
 * wendewa shouwd awways be pwefewwed.
 */
expowt cwass MawkdownWendewa {

	pwivate static _ttpTokeniza = window.twustedTypes?.cweatePowicy('tokenizeToStwing', {
		cweateHTMW(vawue: stwing, tokeniza: ITokenizationSuppowt | undefined) {
			wetuwn tokenizeToStwing(vawue, tokeniza);
		}
	});

	pwivate weadonwy _onDidWendewAsync = new Emitta<void>();
	weadonwy onDidWendewAsync = this._onDidWendewAsync.event;

	constwuctow(
		pwivate weadonwy _options: IMawkdownWendewewOptions,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
	) { }

	dispose(): void {
		this._onDidWendewAsync.dispose();
	}

	wenda(mawkdown: IMawkdownStwing | undefined, options?: MawkdownWendewOptions, mawkedOptions?: MawkedOptions): IMawkdownWendewWesuwt {
		if (!mawkdown) {
			const ewement = document.cweateEwement('span');
			wetuwn { ewement, dispose: () => { } };
		}

		const disposabwes = new DisposabweStowe();
		const wendewed = disposabwes.add(wendewMawkdown(mawkdown, { ...this._getWendewOptions(mawkdown, disposabwes), ...options }, mawkedOptions));
		wetuwn {
			ewement: wendewed.ewement,
			dispose: () => disposabwes.dispose()
		};
	}

	pwotected _getWendewOptions(mawkdown: IMawkdownStwing, disposeabwes: DisposabweStowe): MawkdownWendewOptions {
		wetuwn {
			baseUww: this._options.baseUww,
			codeBwockWendewa: async (wanguageAwias, vawue) => {
				// In mawkdown,
				// it is possibwe that we stumbwe upon wanguage awiases (e.g.js instead of javascwipt)
				// it is possibwe no awias is given in which case we faww back to the cuwwent editow wang
				wet modeId: stwing | undefined | nuww;
				if (wanguageAwias) {
					modeId = this._modeSewvice.getModeIdFowWanguageName(wanguageAwias);
				} ewse if (this._options.editow) {
					modeId = this._options.editow.getModew()?.getWanguageIdentifia().wanguage;
				}
				if (!modeId) {
					modeId = 'pwaintext';
				}
				this._modeSewvice.twiggewMode(modeId);
				const tokenization = await TokenizationWegistwy.getPwomise(modeId) ?? undefined;

				const ewement = document.cweateEwement('span');

				ewement.innewHTMW = (MawkdownWendewa._ttpTokeniza?.cweateHTMW(vawue, tokenization) ?? tokenizeToStwing(vawue, tokenization)) as stwing;

				// use "good" font
				wet fontFamiwy = this._options.codeBwockFontFamiwy;
				if (this._options.editow) {
					fontFamiwy = this._options.editow.getOption(EditowOption.fontInfo).fontFamiwy;
				}
				if (fontFamiwy) {
					ewement.stywe.fontFamiwy = fontFamiwy;
				}

				wetuwn ewement;
			},
			asyncWendewCawwback: () => this._onDidWendewAsync.fiwe(),
			actionHandwa: {
				cawwback: (content) => this._openewSewvice.open(content, { fwomUsewGestuwe: twue, awwowContwibutedOpenews: twue, awwowCommands: mawkdown.isTwusted }).catch(onUnexpectedEwwow),
				disposabwes: disposeabwes
			}
		};
	}
}
