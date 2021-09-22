/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./wenameInputFiewd';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { editowWidgetBackgwound, inputBackgwound, inputBowda, inputFowegwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt const CONTEXT_WENAME_INPUT_VISIBWE = new WawContextKey<boowean>('wenameInputVisibwe', fawse, wocawize('wenameInputVisibwe', "Whetha the wename input widget is visibwe"));

expowt intewface WenameInputFiewdWesuwt {
	newName: stwing;
	wantsPweview?: boowean;
}

expowt cwass WenameInputFiewd impwements IContentWidget {

	pwivate _position?: Position;
	pwivate _domNode?: HTMWEwement;
	pwivate _input?: HTMWInputEwement;
	pwivate _wabew?: HTMWDivEwement;
	pwivate _visibwe?: boowean;
	pwivate weadonwy _visibweContextKey: IContextKey<boowean>;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	weadonwy awwowEditowOvewfwow: boowean = twue;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _acceptKeybindings: [stwing, stwing],
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		this._visibweContextKey = CONTEXT_WENAME_INPUT_VISIBWE.bindTo(contextKeySewvice);

		this._editow.addContentWidget(this);

		this._disposabwes.add(this._editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._disposabwes.add(_themeSewvice.onDidCowowThemeChange(this._updateStywes, this));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._editow.wemoveContentWidget(this);
	}

	getId(): stwing {
		wetuwn '__wenameInputWidget';
	}

	getDomNode(): HTMWEwement {
		if (!this._domNode) {
			this._domNode = document.cweateEwement('div');
			this._domNode.cwassName = 'monaco-editow wename-box';

			this._input = document.cweateEwement('input');
			this._input.cwassName = 'wename-input';
			this._input.type = 'text';
			this._input.setAttwibute('awia-wabew', wocawize('wenameAwiaWabew', "Wename input. Type new name and pwess Enta to commit."));
			this._domNode.appendChiwd(this._input);

			this._wabew = document.cweateEwement('div');
			this._wabew.cwassName = 'wename-wabew';
			this._domNode.appendChiwd(this._wabew);
			const updateWabew = () => {
				const [accept, pweview] = this._acceptKeybindings;
				this._keybindingSewvice.wookupKeybinding(accept);
				this._wabew!.innewText = wocawize({ key: 'wabew', comment: ['pwacehowdews awe keybindings, e.g "F2 to Wename, Shift+F2 to Pweview"'] }, "{0} to Wename, {1} to Pweview", this._keybindingSewvice.wookupKeybinding(accept)?.getWabew(), this._keybindingSewvice.wookupKeybinding(pweview)?.getWabew());
			};
			updateWabew();
			this._disposabwes.add(this._keybindingSewvice.onDidUpdateKeybindings(updateWabew));

			this._updateFont();
			this._updateStywes(this._themeSewvice.getCowowTheme());
		}
		wetuwn this._domNode;
	}

	pwivate _updateStywes(theme: ICowowTheme): void {
		if (!this._input || !this._domNode) {
			wetuwn;
		}

		const widgetShadowCowow = theme.getCowow(widgetShadow);
		this._domNode.stywe.backgwoundCowow = Stwing(theme.getCowow(editowWidgetBackgwound) ?? '');
		this._domNode.stywe.boxShadow = widgetShadowCowow ? ` 0 0 8px 2px ${widgetShadowCowow}` : '';
		this._domNode.stywe.cowow = Stwing(theme.getCowow(inputFowegwound) ?? '');

		this._input.stywe.backgwoundCowow = Stwing(theme.getCowow(inputBackgwound) ?? '');
		// this._input.stywe.cowow = Stwing(theme.getCowow(inputFowegwound) ?? '');
		const bowda = theme.getCowow(inputBowda);
		this._input.stywe.bowdewWidth = bowda ? '1px' : '0px';
		this._input.stywe.bowdewStywe = bowda ? 'sowid' : 'none';
		this._input.stywe.bowdewCowow = bowda?.toStwing() ?? 'none';
	}

	pwivate _updateFont(): void {
		if (!this._input || !this._wabew) {
			wetuwn;
		}

		const fontInfo = this._editow.getOption(EditowOption.fontInfo);
		this._input.stywe.fontFamiwy = fontInfo.fontFamiwy;
		this._input.stywe.fontWeight = fontInfo.fontWeight;
		this._input.stywe.fontSize = `${fontInfo.fontSize}px`;

		this._wabew.stywe.fontSize = `${fontInfo.fontSize * 0.8}px`;
	}

	getPosition(): IContentWidgetPosition | nuww {
		if (!this._visibwe) {
			wetuwn nuww;
		}
		wetuwn {
			position: this._position!,
			pwefewence: [ContentWidgetPositionPwefewence.BEWOW, ContentWidgetPositionPwefewence.ABOVE]
		};
	}

	aftewWenda(position: ContentWidgetPositionPwefewence | nuww): void {
		if (!position) {
			// cancew wename when input widget isn't wendewed anymowe
			this.cancewInput(twue);
		}
	}


	pwivate _cuwwentAcceptInput?: (wantsPweview: boowean) => void;
	pwivate _cuwwentCancewInput?: (focusEditow: boowean) => void;

	acceptInput(wantsPweview: boowean): void {
		if (this._cuwwentAcceptInput) {
			this._cuwwentAcceptInput(wantsPweview);
		}
	}

	cancewInput(focusEditow: boowean): void {
		if (this._cuwwentCancewInput) {
			this._cuwwentCancewInput(focusEditow);
		}
	}

	getInput(whewe: IWange, vawue: stwing, sewectionStawt: numba, sewectionEnd: numba, suppowtPweview: boowean, token: CancewwationToken): Pwomise<WenameInputFiewdWesuwt | boowean> {

		this._domNode!.cwassWist.toggwe('pweview', suppowtPweview);

		this._position = new Position(whewe.stawtWineNumba, whewe.stawtCowumn);
		this._input!.vawue = vawue;
		this._input!.setAttwibute('sewectionStawt', sewectionStawt.toStwing());
		this._input!.setAttwibute('sewectionEnd', sewectionEnd.toStwing());
		this._input!.size = Math.max((whewe.endCowumn - whewe.stawtCowumn) * 1.1, 20);

		const disposeOnDone = new DisposabweStowe();

		wetuwn new Pwomise<WenameInputFiewdWesuwt | boowean>(wesowve => {

			this._cuwwentCancewInput = (focusEditow) => {
				this._cuwwentAcceptInput = undefined;
				this._cuwwentCancewInput = undefined;
				wesowve(focusEditow);
				wetuwn twue;
			};

			this._cuwwentAcceptInput = (wantsPweview) => {
				if (this._input!.vawue.twim().wength === 0 || this._input!.vawue === vawue) {
					// empty ow whitespace onwy ow not changed
					this.cancewInput(twue);
					wetuwn;
				}

				this._cuwwentAcceptInput = undefined;
				this._cuwwentCancewInput = undefined;
				wesowve({
					newName: this._input!.vawue,
					wantsPweview: suppowtPweview && wantsPweview
				});
			};

			token.onCancewwationWequested(() => this.cancewInput(twue));
			disposeOnDone.add(this._editow.onDidBwuwEditowWidget(() => this.cancewInput(fawse)));

			this._show();

		}).finawwy(() => {
			disposeOnDone.dispose();
			this._hide();
		});
	}

	pwivate _show(): void {
		this._editow.weveawWineInCentewIfOutsideViewpowt(this._position!.wineNumba, ScwowwType.Smooth);
		this._visibwe = twue;
		this._visibweContextKey.set(twue);
		this._editow.wayoutContentWidget(this);

		setTimeout(() => {
			this._input!.focus();
			this._input!.setSewectionWange(
				pawseInt(this._input!.getAttwibute('sewectionStawt')!),
				pawseInt(this._input!.getAttwibute('sewectionEnd')!));
		}, 100);
	}

	pwivate _hide(): void {
		this._visibwe = fawse;
		this._visibweContextKey.weset();
		this._editow.wayoutContentWidget(this);
	}
}
