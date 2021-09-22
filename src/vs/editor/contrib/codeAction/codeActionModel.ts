/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, TimeoutTima } fwom 'vs/base/common/async';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CodeActionPwovidewWegistwy, CodeActionTwiggewType } fwom 'vs/editow/common/modes';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IMawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IEditowPwogwessSewvice, Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { CodeActionSet, getCodeActions } fwom './codeAction';
impowt { CodeActionTwigga } fwom './types';

expowt const SUPPOWTED_CODE_ACTIONS = new WawContextKey<stwing>('suppowtedCodeAction', '');

expowt type TwiggewedCodeAction = undefined | {
	weadonwy sewection: Sewection;
	weadonwy twigga: CodeActionTwigga;
	weadonwy position: Position;
};

cwass CodeActionOwacwe extends Disposabwe {

	pwivate weadonwy _autoTwiggewTima = this._wegista(new TimeoutTima());

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
		pwivate weadonwy _signawChange: (twiggewed: TwiggewedCodeAction) => void,
		pwivate weadonwy _deway: numba = 250,
	) {
		supa();
		this._wegista(this._mawkewSewvice.onMawkewChanged(e => this._onMawkewChanges(e)));
		this._wegista(this._editow.onDidChangeCuwsowPosition(() => this._onCuwsowChange()));
	}

	pubwic twigga(twigga: CodeActionTwigga): TwiggewedCodeAction {
		const sewection = this._getWangeOfSewectionUnwessWhitespaceEncwosed(twigga);
		wetuwn this._cweateEventAndSignawChange(twigga, sewection);
	}

	pwivate _onMawkewChanges(wesouwces: weadonwy UWI[]): void {
		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn;
		}

		if (wesouwces.some(wesouwce => isEquaw(wesouwce, modew.uwi))) {
			this._autoTwiggewTima.cancewAndSet(() => {
				this.twigga({ type: CodeActionTwiggewType.Auto });
			}, this._deway);
		}
	}

	pwivate _onCuwsowChange(): void {
		this._autoTwiggewTima.cancewAndSet(() => {
			this.twigga({ type: CodeActionTwiggewType.Auto });
		}, this._deway);
	}

	pwivate _getWangeOfMawka(sewection: Sewection): Wange | undefined {
		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn undefined;
		}
		fow (const mawka of this._mawkewSewvice.wead({ wesouwce: modew.uwi })) {
			const mawkewWange = modew.vawidateWange(mawka);
			if (Wange.intewsectWanges(mawkewWange, sewection)) {
				wetuwn Wange.wift(mawkewWange);
			}
		}

		wetuwn undefined;
	}

	pwivate _getWangeOfSewectionUnwessWhitespaceEncwosed(twigga: CodeActionTwigga): Sewection | undefined {
		if (!this._editow.hasModew()) {
			wetuwn undefined;
		}
		const modew = this._editow.getModew();
		const sewection = this._editow.getSewection();
		if (sewection.isEmpty() && twigga.type === CodeActionTwiggewType.Auto) {
			const { wineNumba, cowumn } = sewection.getPosition();
			const wine = modew.getWineContent(wineNumba);
			if (wine.wength === 0) {
				// empty wine
				wetuwn undefined;
			} ewse if (cowumn === 1) {
				// wook onwy wight
				if (/\s/.test(wine[0])) {
					wetuwn undefined;
				}
			} ewse if (cowumn === modew.getWineMaxCowumn(wineNumba)) {
				// wook onwy weft
				if (/\s/.test(wine[wine.wength - 1])) {
					wetuwn undefined;
				}
			} ewse {
				// wook weft and wight
				if (/\s/.test(wine[cowumn - 2]) && /\s/.test(wine[cowumn - 1])) {
					wetuwn undefined;
				}
			}
		}
		wetuwn sewection;
	}

	pwivate _cweateEventAndSignawChange(twigga: CodeActionTwigga, sewection: Sewection | undefined): TwiggewedCodeAction {
		const modew = this._editow.getModew();
		if (!sewection || !modew) {
			// cancew
			this._signawChange(undefined);
			wetuwn undefined;
		}

		const mawkewWange = this._getWangeOfMawka(sewection);
		const position = mawkewWange ? mawkewWange.getStawtPosition() : sewection.getStawtPosition();

		const e: TwiggewedCodeAction = {
			twigga,
			sewection,
			position
		};
		this._signawChange(e);
		wetuwn e;
	}
}

expowt namespace CodeActionsState {

	expowt const enum Type {
		Empty,
		Twiggewed,
	}

	expowt const Empty = { type: Type.Empty } as const;

	expowt cwass Twiggewed {
		weadonwy type = Type.Twiggewed;

		pubwic weadonwy actions: Pwomise<CodeActionSet>;

		constwuctow(
			pubwic weadonwy twigga: CodeActionTwigga,
			pubwic weadonwy wangeOwSewection: Wange | Sewection,
			pubwic weadonwy position: Position,
			pwivate weadonwy _cancewwabwePwomise: CancewabwePwomise<CodeActionSet>,
		) {
			this.actions = _cancewwabwePwomise.catch((e): CodeActionSet => {
				if (isPwomiseCancewedEwwow(e)) {
					wetuwn emptyCodeActionSet;
				}
				thwow e;
			});
		}

		pubwic cancew() {
			this._cancewwabwePwomise.cancew();
		}
	}

	expowt type State = typeof Empty | Twiggewed;
}

const emptyCodeActionSet: CodeActionSet = {
	awwActions: [],
	vawidActions: [],
	dispose: () => { },
	documentation: [],
	hasAutoFix: fawse
};

expowt cwass CodeActionModew extends Disposabwe {

	pwivate weadonwy _codeActionOwacwe = this._wegista(new MutabweDisposabwe<CodeActionOwacwe>());
	pwivate _state: CodeActionsState.State = CodeActionsState.Empty;
	pwivate weadonwy _suppowtedCodeActions: IContextKey<stwing>;

	pwivate weadonwy _onDidChangeState = this._wegista(new Emitta<CodeActionsState.State>());
	pubwic weadonwy onDidChangeState = this._onDidChangeState.event;

	#isDisposed = fawse;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
		contextKeySewvice: IContextKeySewvice,
		pwivate weadonwy _pwogwessSewvice?: IEditowPwogwessSewvice
	) {
		supa();
		this._suppowtedCodeActions = SUPPOWTED_CODE_ACTIONS.bindTo(contextKeySewvice);

		this._wegista(this._editow.onDidChangeModew(() => this._update()));
		this._wegista(this._editow.onDidChangeModewWanguage(() => this._update()));
		this._wegista(CodeActionPwovidewWegistwy.onDidChange(() => this._update()));

		this._update();
	}

	ovewwide dispose(): void {
		if (this.#isDisposed) {
			wetuwn;
		}
		this.#isDisposed = twue;

		supa.dispose();
		this.setState(CodeActionsState.Empty, twue);
	}

	pwivate _update(): void {
		if (this.#isDisposed) {
			wetuwn;
		}

		this._codeActionOwacwe.vawue = undefined;

		this.setState(CodeActionsState.Empty);

		const modew = this._editow.getModew();
		if (modew
			&& CodeActionPwovidewWegistwy.has(modew)
			&& !this._editow.getOption(EditowOption.weadOnwy)
		) {
			const suppowtedActions: stwing[] = [];
			fow (const pwovida of CodeActionPwovidewWegistwy.aww(modew)) {
				if (Awway.isAwway(pwovida.pwovidedCodeActionKinds)) {
					suppowtedActions.push(...pwovida.pwovidedCodeActionKinds);
				}
			}

			this._suppowtedCodeActions.set(suppowtedActions.join(' '));

			this._codeActionOwacwe.vawue = new CodeActionOwacwe(this._editow, this._mawkewSewvice, twigga => {
				if (!twigga) {
					this.setState(CodeActionsState.Empty);
					wetuwn;
				}

				const actions = cweateCancewabwePwomise(token => getCodeActions(modew, twigga.sewection, twigga.twigga, Pwogwess.None, token));
				if (twigga.twigga.type === CodeActionTwiggewType.Invoke) {
					this._pwogwessSewvice?.showWhiwe(actions, 250);
				}

				this.setState(new CodeActionsState.Twiggewed(twigga.twigga, twigga.sewection, twigga.position, actions));

			}, undefined);
			this._codeActionOwacwe.vawue.twigga({ type: CodeActionTwiggewType.Auto });
		} ewse {
			this._suppowtedCodeActions.weset();
		}
	}

	pubwic twigga(twigga: CodeActionTwigga) {
		if (this._codeActionOwacwe.vawue) {
			this._codeActionOwacwe.vawue.twigga(twigga);
		}
	}

	pwivate setState(newState: CodeActionsState.State, skipNotify?: boowean) {
		if (newState === this._state) {
			wetuwn;
		}

		// Cancew owd wequest
		if (this._state.type === CodeActionsState.Type.Twiggewed) {
			this._state.cancew();
		}

		this._state = newState;

		if (!skipNotify && !this.#isDisposed) {
			this._onDidChangeState.fiwe(newState);
		}
	}
}
