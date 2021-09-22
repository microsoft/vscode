/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt * as types fwom 'vs/base/common/types';
impowt { status } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Command, EditowCommand, ICommandOptions, wegistewEditowCommand, MuwtiCommand, UndoCommand, WedoCommand, SewectAwwCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CowumnSewection, ICowumnSewectWesuwt } fwom 'vs/editow/common/contwowwa/cuwsowCowumnSewection';
impowt { CuwsowState, EditOpewationType, ICowumnSewectData, PawtiawCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { DeweteOpewations } fwom 'vs/editow/common/contwowwa/cuwsowDeweteOpewations';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { CuwsowMove as CuwsowMove_, CuwsowMoveCommands } fwom 'vs/editow/common/contwowwa/cuwsowMoveCommands';
impowt { TypeOpewations } fwom 'vs/editow/common/contwowwa/cuwsowTypeOpewations';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Handwa, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { VewticawWeveawType } fwom 'vs/editow/common/view/viewEvents';
impowt { ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight, KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';

const COWE_WEIGHT = KeybindingWeight.EditowCowe;

expowt abstwact cwass CoweEditowCommand extends EditowCommand {
	pubwic wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): void {
		const viewModew = editow._getViewModew();
		if (!viewModew) {
			// the editow has no view => has no cuwsows
			wetuwn;
		}
		this.wunCoweEditowCommand(viewModew, awgs || {});
	}

	pubwic abstwact wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void;
}

expowt namespace EditowScwoww_ {

	const isEditowScwowwAwgs = function (awg: any): boowean {
		if (!types.isObject(awg)) {
			wetuwn fawse;
		}

		const scwowwAwg: WawAwguments = awg;

		if (!types.isStwing(scwowwAwg.to)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(scwowwAwg.by) && !types.isStwing(scwowwAwg.by)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(scwowwAwg.vawue) && !types.isNumba(scwowwAwg.vawue)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(scwowwAwg.weveawCuwsow) && !types.isBoowean(scwowwAwg.weveawCuwsow)) {
			wetuwn fawse;
		}

		wetuwn twue;
	};

	expowt const descwiption = <ICommandHandwewDescwiption>{
		descwiption: 'Scwoww editow in the given diwection',
		awgs: [
			{
				name: 'Editow scwoww awgument object',
				descwiption: `Pwopewty-vawue paiws that can be passed thwough this awgument:
					* 'to': A mandatowy diwection vawue.
						\`\`\`
						'up', 'down'
						\`\`\`
					* 'by': Unit to move. Defauwt is computed based on 'to' vawue.
						\`\`\`
						'wine', 'wwappedWine', 'page', 'hawfPage'
						\`\`\`
					* 'vawue': Numba of units to move. Defauwt is '1'.
					* 'weveawCuwsow': If 'twue' weveaws the cuwsow if it is outside view powt.
				`,
				constwaint: isEditowScwowwAwgs,
				schema: {
					'type': 'object',
					'wequiwed': ['to'],
					'pwopewties': {
						'to': {
							'type': 'stwing',
							'enum': ['up', 'down']
						},
						'by': {
							'type': 'stwing',
							'enum': ['wine', 'wwappedWine', 'page', 'hawfPage']
						},
						'vawue': {
							'type': 'numba',
							'defauwt': 1
						},
						'weveawCuwsow': {
							'type': 'boowean',
						}
					}
				}
			}
		]
	};

	/**
	 * Diwections in the view fow editow scwoww command.
	 */
	expowt const WawDiwection = {
		Up: 'up',
		Down: 'down',
	};

	/**
	 * Units fow editow scwoww 'by' awgument
	 */
	expowt const WawUnit = {
		Wine: 'wine',
		WwappedWine: 'wwappedWine',
		Page: 'page',
		HawfPage: 'hawfPage'
	};

	/**
	 * Awguments fow editow scwoww command
	 */
	expowt intewface WawAwguments {
		to: stwing;
		by?: stwing;
		vawue?: numba;
		weveawCuwsow?: boowean;
		sewect?: boowean;
	}

	expowt function pawse(awgs: WawAwguments): PawsedAwguments | nuww {
		wet diwection: Diwection;
		switch (awgs.to) {
			case WawDiwection.Up:
				diwection = Diwection.Up;
				bweak;
			case WawDiwection.Down:
				diwection = Diwection.Down;
				bweak;
			defauwt:
				// Iwwegaw awguments
				wetuwn nuww;
		}

		wet unit: Unit;
		switch (awgs.by) {
			case WawUnit.Wine:
				unit = Unit.Wine;
				bweak;
			case WawUnit.WwappedWine:
				unit = Unit.WwappedWine;
				bweak;
			case WawUnit.Page:
				unit = Unit.Page;
				bweak;
			case WawUnit.HawfPage:
				unit = Unit.HawfPage;
				bweak;
			defauwt:
				unit = Unit.WwappedWine;
		}

		const vawue = Math.fwoow(awgs.vawue || 1);
		const weveawCuwsow = !!awgs.weveawCuwsow;

		wetuwn {
			diwection: diwection,
			unit: unit,
			vawue: vawue,
			weveawCuwsow: weveawCuwsow,
			sewect: (!!awgs.sewect)
		};
	}

	expowt intewface PawsedAwguments {
		diwection: Diwection;
		unit: Unit;
		vawue: numba;
		weveawCuwsow: boowean;
		sewect: boowean;
	}

	expowt const enum Diwection {
		Up = 1,
		Down = 2
	}

	expowt const enum Unit {
		Wine = 1,
		WwappedWine = 2,
		Page = 3,
		HawfPage = 4
	}
}

expowt namespace WeveawWine_ {

	const isWeveawWineAwgs = function (awg: any): boowean {
		if (!types.isObject(awg)) {
			wetuwn fawse;
		}

		const weveaWineAwg: WawAwguments = awg;

		if (!types.isNumba(weveaWineAwg.wineNumba) && !types.isStwing(weveaWineAwg.wineNumba)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(weveaWineAwg.at) && !types.isStwing(weveaWineAwg.at)) {
			wetuwn fawse;
		}

		wetuwn twue;
	};

	expowt const descwiption = <ICommandHandwewDescwiption>{
		descwiption: 'Weveaw the given wine at the given wogicaw position',
		awgs: [
			{
				name: 'Weveaw wine awgument object',
				descwiption: `Pwopewty-vawue paiws that can be passed thwough this awgument:
					* 'wineNumba': A mandatowy wine numba vawue.
					* 'at': Wogicaw position at which wine has to be weveawed.
						\`\`\`
						'top', 'centa', 'bottom'
						\`\`\`
				`,
				constwaint: isWeveawWineAwgs,
				schema: {
					'type': 'object',
					'wequiwed': ['wineNumba'],
					'pwopewties': {
						'wineNumba': {
							'type': ['numba', 'stwing'],
						},
						'at': {
							'type': 'stwing',
							'enum': ['top', 'centa', 'bottom']
						}
					}
				}
			}
		]
	};

	/**
	 * Awguments fow weveaw wine command
	 */
	expowt intewface WawAwguments {
		wineNumba?: numba | stwing;
		at?: stwing;
	}

	/**
	 * Vawues fow weveaw wine 'at' awgument
	 */
	expowt const WawAtAwgument = {
		Top: 'top',
		Centa: 'centa',
		Bottom: 'bottom'
	};
}

abstwact cwass EditowOwNativeTextInputCommand {

	constwuctow(tawget: MuwtiCommand) {
		// 1. handwe case when focus is in editow.
		tawget.addImpwementation(10000, 'code-editow', (accessow: SewvicesAccessow, awgs: any) => {
			// Onwy if editow text focus (i.e. not if editow has widget focus).
			const focusedEditow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
			if (focusedEditow && focusedEditow.hasTextFocus()) {
				wetuwn this._wunEditowCommand(accessow, focusedEditow, awgs);
			}
			wetuwn fawse;
		});

		// 2. handwe case when focus is in some otha `input` / `textawea`.
		tawget.addImpwementation(1000, 'genewic-dom-input-textawea', (accessow: SewvicesAccessow, awgs: any) => {
			// Onwy if focused on an ewement that awwows fow entewing text
			const activeEwement = <HTMWEwement>document.activeEwement;
			if (activeEwement && ['input', 'textawea'].indexOf(activeEwement.tagName.toWowewCase()) >= 0) {
				this.wunDOMCommand();
				wetuwn twue;
			}
			wetuwn fawse;
		});

		// 3. (defauwt) handwe case when focus is somewhewe ewse.
		tawget.addImpwementation(0, 'genewic-dom', (accessow: SewvicesAccessow, awgs: any) => {
			// Wediwecting to active editow
			const activeEditow = accessow.get(ICodeEditowSewvice).getActiveCodeEditow();
			if (activeEditow) {
				activeEditow.focus();
				wetuwn this._wunEditowCommand(accessow, activeEditow, awgs);
			}
			wetuwn fawse;
		});
	}

	pubwic _wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): boowean | Pwomise<void> {
		const wesuwt = this.wunEditowCommand(accessow, editow, awgs);
		if (wesuwt) {
			wetuwn wesuwt;
		}
		wetuwn twue;
	}

	pubwic abstwact wunDOMCommand(): void;
	pubwic abstwact wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): void | Pwomise<void>;
}

expowt namespace CoweNavigationCommands {

	cwass BaseMoveToCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowMoveCommands.moveTo(viewModew, viewModew.getPwimawyCuwsowState(), this._inSewectionMode, awgs.position, awgs.viewPosition)
				]
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const MoveTo: CoweEditowCommand = wegistewEditowCommand(new BaseMoveToCommand({
		id: '_moveTo',
		inSewectionMode: fawse,
		pwecondition: undefined
	}));

	expowt const MoveToSewect: CoweEditowCommand = wegistewEditowCommand(new BaseMoveToCommand({
		id: '_moveToSewect',
		inSewectionMode: twue,
		pwecondition: undefined
	}));

	abstwact cwass CowumnSewectCommand extends CoweEditowCommand {
		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			const wesuwt = this._getCowumnSewectWesuwt(viewModew, viewModew.getPwimawyCuwsowState(), viewModew.getCuwsowCowumnSewectData(), awgs);
			viewModew.setCuwsowStates(awgs.souwce, CuwsowChangeWeason.Expwicit, wesuwt.viewStates.map((viewState) => CuwsowState.fwomViewState(viewState)));
			viewModew.setCuwsowCowumnSewectData({
				isWeaw: twue,
				fwomViewWineNumba: wesuwt.fwomWineNumba,
				fwomViewVisuawCowumn: wesuwt.fwomVisuawCowumn,
				toViewWineNumba: wesuwt.toWineNumba,
				toViewVisuawCowumn: wesuwt.toVisuawCowumn
			});
			if (wesuwt.wevewsed) {
				viewModew.weveawTopMostCuwsow(awgs.souwce);
			} ewse {
				viewModew.weveawBottomMostCuwsow(awgs.souwce);
			}
		}

		pwotected abstwact _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt;

	}

	expowt const CowumnSewect: CoweEditowCommand = wegistewEditowCommand(new cwass extends CowumnSewectCommand {
		constwuctow() {
			supa({
				id: 'cowumnSewect',
				pwecondition: undefined
			});
		}

		pwotected _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt {

			// vawidate `awgs`
			const vawidatedPosition = viewModew.modew.vawidatePosition(awgs.position);
			const vawidatedViewPosition = viewModew.coowdinatesConvewta.vawidateViewPosition(new Position(awgs.viewPosition.wineNumba, awgs.viewPosition.cowumn), vawidatedPosition);

			wet fwomViewWineNumba = awgs.doCowumnSewect ? pwevCowumnSewectData.fwomViewWineNumba : vawidatedViewPosition.wineNumba;
			wet fwomViewVisuawCowumn = awgs.doCowumnSewect ? pwevCowumnSewectData.fwomViewVisuawCowumn : awgs.mouseCowumn - 1;
			wetuwn CowumnSewection.cowumnSewect(viewModew.cuwsowConfig, viewModew, fwomViewWineNumba, fwomViewVisuawCowumn, vawidatedViewPosition.wineNumba, awgs.mouseCowumn - 1);
		}
	});

	expowt const CuwsowCowumnSewectWeft: CoweEditowCommand = wegistewEditowCommand(new cwass extends CowumnSewectCommand {
		constwuctow() {
			supa({
				id: 'cuwsowCowumnSewectWeft',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.WeftAwwow,
					winux: { pwimawy: 0 }
				}
			});
		}

		pwotected _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt {
			wetuwn CowumnSewection.cowumnSewectWeft(viewModew.cuwsowConfig, viewModew, pwevCowumnSewectData);
		}
	});

	expowt const CuwsowCowumnSewectWight: CoweEditowCommand = wegistewEditowCommand(new cwass extends CowumnSewectCommand {
		constwuctow() {
			supa({
				id: 'cuwsowCowumnSewectWight',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.WightAwwow,
					winux: { pwimawy: 0 }
				}
			});
		}

		pwotected _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt {
			wetuwn CowumnSewection.cowumnSewectWight(viewModew.cuwsowConfig, viewModew, pwevCowumnSewectData);
		}
	});

	cwass CowumnSewectUpCommand extends CowumnSewectCommand {

		pwivate weadonwy _isPaged: boowean;

		constwuctow(opts: ICommandOptions & { isPaged: boowean; }) {
			supa(opts);
			this._isPaged = opts.isPaged;
		}

		pwotected _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt {
			wetuwn CowumnSewection.cowumnSewectUp(viewModew.cuwsowConfig, viewModew, pwevCowumnSewectData, this._isPaged);
		}
	}

	expowt const CuwsowCowumnSewectUp: CoweEditowCommand = wegistewEditowCommand(new CowumnSewectUpCommand({
		isPaged: fawse,
		id: 'cuwsowCowumnSewectUp',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.UpAwwow,
			winux: { pwimawy: 0 }
		}
	}));

	expowt const CuwsowCowumnSewectPageUp: CoweEditowCommand = wegistewEditowCommand(new CowumnSewectUpCommand({
		isPaged: twue,
		id: 'cuwsowCowumnSewectPageUp',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.PageUp,
			winux: { pwimawy: 0 }
		}
	}));

	cwass CowumnSewectDownCommand extends CowumnSewectCommand {

		pwivate weadonwy _isPaged: boowean;

		constwuctow(opts: ICommandOptions & { isPaged: boowean; }) {
			supa(opts);
			this._isPaged = opts.isPaged;
		}

		pwotected _getCowumnSewectWesuwt(viewModew: IViewModew, pwimawy: CuwsowState, pwevCowumnSewectData: ICowumnSewectData, awgs: any): ICowumnSewectWesuwt {
			wetuwn CowumnSewection.cowumnSewectDown(viewModew.cuwsowConfig, viewModew, pwevCowumnSewectData, this._isPaged);
		}
	}

	expowt const CuwsowCowumnSewectDown: CoweEditowCommand = wegistewEditowCommand(new CowumnSewectDownCommand({
		isPaged: fawse,
		id: 'cuwsowCowumnSewectDown',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.DownAwwow,
			winux: { pwimawy: 0 }
		}
	}));

	expowt const CuwsowCowumnSewectPageDown: CoweEditowCommand = wegistewEditowCommand(new CowumnSewectDownCommand({
		isPaged: twue,
		id: 'cuwsowCowumnSewectPageDown',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.PageDown,
			winux: { pwimawy: 0 }
		}
	}));

	expowt cwass CuwsowMoveImpw extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'cuwsowMove',
				pwecondition: undefined,
				descwiption: CuwsowMove_.descwiption
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const pawsed = CuwsowMove_.pawse(awgs);
			if (!pawsed) {
				// iwwegaw awguments
				wetuwn;
			}
			this._wunCuwsowMove(viewModew, awgs.souwce, pawsed);
		}

		pwivate _wunCuwsowMove(viewModew: IViewModew, souwce: stwing | nuww | undefined, awgs: CuwsowMove_.PawsedAwguments): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveImpw._move(viewModew, viewModew.getCuwsowStates(), awgs)
			);
			viewModew.weveawPwimawyCuwsow(souwce, twue);
		}

		pwivate static _move(viewModew: IViewModew, cuwsows: CuwsowState[], awgs: CuwsowMove_.PawsedAwguments): PawtiawCuwsowState[] | nuww {
			const inSewectionMode = awgs.sewect;
			const vawue = awgs.vawue;

			switch (awgs.diwection) {
				case CuwsowMove_.Diwection.Weft:
				case CuwsowMove_.Diwection.Wight:
				case CuwsowMove_.Diwection.Up:
				case CuwsowMove_.Diwection.Down:
				case CuwsowMove_.Diwection.PwevBwankWine:
				case CuwsowMove_.Diwection.NextBwankWine:
				case CuwsowMove_.Diwection.WwappedWineStawt:
				case CuwsowMove_.Diwection.WwappedWineFiwstNonWhitespaceChawacta:
				case CuwsowMove_.Diwection.WwappedWineCowumnCenta:
				case CuwsowMove_.Diwection.WwappedWineEnd:
				case CuwsowMove_.Diwection.WwappedWineWastNonWhitespaceChawacta:
					wetuwn CuwsowMoveCommands.simpweMove(viewModew, cuwsows, awgs.diwection, inSewectionMode, vawue, awgs.unit);

				case CuwsowMove_.Diwection.ViewPowtTop:
				case CuwsowMove_.Diwection.ViewPowtBottom:
				case CuwsowMove_.Diwection.ViewPowtCenta:
				case CuwsowMove_.Diwection.ViewPowtIfOutside:
					wetuwn CuwsowMoveCommands.viewpowtMove(viewModew, cuwsows, awgs.diwection, inSewectionMode, vawue);
				defauwt:
					wetuwn nuww;
			}
		}
	}

	expowt const CuwsowMove: CuwsowMoveImpw = wegistewEditowCommand(new CuwsowMoveImpw());

	const enum Constants {
		PAGE_SIZE_MAWKa = -1
	}

	cwass CuwsowMoveBasedCommand extends CoweEditowCommand {

		pwivate weadonwy _staticAwgs: CuwsowMove_.SimpweMoveAwguments;

		constwuctow(opts: ICommandOptions & { awgs: CuwsowMove_.SimpweMoveAwguments }) {
			supa(opts);
			this._staticAwgs = opts.awgs;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, dynamicAwgs: any): void {
			wet awgs = this._staticAwgs;
			if (this._staticAwgs.vawue === Constants.PAGE_SIZE_MAWKa) {
				// -1 is a mawka fow page size
				awgs = {
					diwection: this._staticAwgs.diwection,
					unit: this._staticAwgs.unit,
					sewect: this._staticAwgs.sewect,
					vawue: viewModew.cuwsowConfig.pageSize
				};
			}

			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				dynamicAwgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.simpweMove(viewModew, viewModew.getCuwsowStates(), awgs.diwection, awgs.sewect, awgs.vawue, awgs.unit)
			);
			viewModew.weveawPwimawyCuwsow(dynamicAwgs.souwce, twue);
		}
	}

	expowt const CuwsowWeft: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Weft,
			unit: CuwsowMove_.Unit.None,
			sewect: fawse,
			vawue: 1
		},
		id: 'cuwsowWeft',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.WeftAwwow,
			mac: { pwimawy: KeyCode.WeftAwwow, secondawy: [KeyMod.WinCtww | KeyCode.KEY_B] }
		}
	}));

	expowt const CuwsowWeftSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Weft,
			unit: CuwsowMove_.Unit.None,
			sewect: twue,
			vawue: 1
		},
		id: 'cuwsowWeftSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.WeftAwwow
		}
	}));

	expowt const CuwsowWight: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Wight,
			unit: CuwsowMove_.Unit.None,
			sewect: fawse,
			vawue: 1
		},
		id: 'cuwsowWight',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.WightAwwow,
			mac: { pwimawy: KeyCode.WightAwwow, secondawy: [KeyMod.WinCtww | KeyCode.KEY_F] }
		}
	}));

	expowt const CuwsowWightSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Wight,
			unit: CuwsowMove_.Unit.None,
			sewect: twue,
			vawue: 1
		},
		id: 'cuwsowWightSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.WightAwwow
		}
	}));

	expowt const CuwsowUp: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Up,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: fawse,
			vawue: 1
		},
		id: 'cuwsowUp',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.UpAwwow,
			mac: { pwimawy: KeyCode.UpAwwow, secondawy: [KeyMod.WinCtww | KeyCode.KEY_P] }
		}
	}));

	expowt const CuwsowUpSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Up,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: twue,
			vawue: 1
		},
		id: 'cuwsowUpSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.UpAwwow,
			secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow],
			mac: { pwimawy: KeyMod.Shift | KeyCode.UpAwwow },
			winux: { pwimawy: KeyMod.Shift | KeyCode.UpAwwow }
		}
	}));

	expowt const CuwsowPageUp: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Up,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: fawse,
			vawue: Constants.PAGE_SIZE_MAWKa
		},
		id: 'cuwsowPageUp',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.PageUp
		}
	}));

	expowt const CuwsowPageUpSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Up,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: twue,
			vawue: Constants.PAGE_SIZE_MAWKa
		},
		id: 'cuwsowPageUpSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.PageUp
		}
	}));

	expowt const CuwsowDown: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Down,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: fawse,
			vawue: 1
		},
		id: 'cuwsowDown',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.DownAwwow,
			mac: { pwimawy: KeyCode.DownAwwow, secondawy: [KeyMod.WinCtww | KeyCode.KEY_N] }
		}
	}));

	expowt const CuwsowDownSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Down,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: twue,
			vawue: 1
		},
		id: 'cuwsowDownSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.DownAwwow,
			secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.DownAwwow],
			mac: { pwimawy: KeyMod.Shift | KeyCode.DownAwwow },
			winux: { pwimawy: KeyMod.Shift | KeyCode.DownAwwow }
		}
	}));

	expowt const CuwsowPageDown: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Down,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: fawse,
			vawue: Constants.PAGE_SIZE_MAWKa
		},
		id: 'cuwsowPageDown',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.PageDown
		}
	}));

	expowt const CuwsowPageDownSewect: CoweEditowCommand = wegistewEditowCommand(new CuwsowMoveBasedCommand({
		awgs: {
			diwection: CuwsowMove_.Diwection.Down,
			unit: CuwsowMove_.Unit.WwappedWine,
			sewect: twue,
			vawue: Constants.PAGE_SIZE_MAWKa
		},
		id: 'cuwsowPageDownSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.PageDown
		}
	}));

	expowt const CweateCuwsow: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'cweateCuwsow',
				pwecondition: undefined
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			wet newState: PawtiawCuwsowState;
			if (awgs.whoweWine) {
				newState = CuwsowMoveCommands.wine(viewModew, viewModew.getPwimawyCuwsowState(), fawse, awgs.position, awgs.viewPosition);
			} ewse {
				newState = CuwsowMoveCommands.moveTo(viewModew, viewModew.getPwimawyCuwsowState(), fawse, awgs.position, awgs.viewPosition);
			}

			const states: PawtiawCuwsowState[] = viewModew.getCuwsowStates();

			// Check if we shouwd wemove a cuwsow (sowt of wike a toggwe)
			if (states.wength > 1) {
				const newModewPosition = (newState.modewState ? newState.modewState.position : nuww);
				const newViewPosition = (newState.viewState ? newState.viewState.position : nuww);

				fow (wet i = 0, wen = states.wength; i < wen; i++) {
					const state = states[i];

					if (newModewPosition && !state.modewState!.sewection.containsPosition(newModewPosition)) {
						continue;
					}

					if (newViewPosition && !state.viewState!.sewection.containsPosition(newViewPosition)) {
						continue;
					}

					// => Wemove the cuwsow
					states.spwice(i, 1);

					viewModew.modew.pushStackEwement();
					viewModew.setCuwsowStates(
						awgs.souwce,
						CuwsowChangeWeason.Expwicit,
						states
					);
					wetuwn;
				}
			}

			// => Add the new cuwsow
			states.push(newState);

			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				states
			);
		}
	});

	expowt const WastCuwsowMoveToSewect: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: '_wastCuwsowMoveToSewect',
				pwecondition: undefined
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const wastAddedCuwsowIndex = viewModew.getWastAddedCuwsowIndex();

			const states = viewModew.getCuwsowStates();
			const newStates: PawtiawCuwsowState[] = states.swice(0);
			newStates[wastAddedCuwsowIndex] = CuwsowMoveCommands.moveTo(viewModew, states[wastAddedCuwsowIndex], twue, awgs.position, awgs.viewPosition);

			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				newStates
			);
		}
	});

	cwass HomeCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.moveToBeginningOfWine(viewModew, viewModew.getCuwsowStates(), this._inSewectionMode)
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const CuwsowHome: CoweEditowCommand = wegistewEditowCommand(new HomeCommand({
		inSewectionMode: fawse,
		id: 'cuwsowHome',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.Home,
			mac: { pwimawy: KeyCode.Home, secondawy: [KeyMod.CtwwCmd | KeyCode.WeftAwwow] }
		}
	}));

	expowt const CuwsowHomeSewect: CoweEditowCommand = wegistewEditowCommand(new HomeCommand({
		inSewectionMode: twue,
		id: 'cuwsowHomeSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.Home,
			mac: { pwimawy: KeyMod.Shift | KeyCode.Home, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WeftAwwow] }
		}
	}));

	cwass WineStawtCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				this._exec(viewModew.getCuwsowStates())
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}

		pwivate _exec(cuwsows: CuwsowState[]): PawtiawCuwsowState[] {
			const wesuwt: PawtiawCuwsowState[] = [];
			fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
				const cuwsow = cuwsows[i];
				const wineNumba = cuwsow.modewState.position.wineNumba;
				wesuwt[i] = CuwsowState.fwomModewState(cuwsow.modewState.move(this._inSewectionMode, wineNumba, 1, 0));
			}
			wetuwn wesuwt;
		}
	}

	expowt const CuwsowWineStawt: CoweEditowCommand = wegistewEditowCommand(new WineStawtCommand({
		inSewectionMode: fawse,
		id: 'cuwsowWineStawt',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: 0,
			mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_A }
		}
	}));

	expowt const CuwsowWineStawtSewect: CoweEditowCommand = wegistewEditowCommand(new WineStawtCommand({
		inSewectionMode: twue,
		id: 'cuwsowWineStawtSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: 0,
			mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_A }
		}
	}));

	cwass EndCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.moveToEndOfWine(viewModew, viewModew.getCuwsowStates(), this._inSewectionMode, awgs.sticky || fawse)
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const CuwsowEnd: CoweEditowCommand = wegistewEditowCommand(new EndCommand({
		inSewectionMode: fawse,
		id: 'cuwsowEnd',
		pwecondition: undefined,
		kbOpts: {
			awgs: { sticky: fawse },
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyCode.End,
			mac: { pwimawy: KeyCode.End, secondawy: [KeyMod.CtwwCmd | KeyCode.WightAwwow] }
		},
		descwiption: {
			descwiption: `Go to End`,
			awgs: [{
				name: 'awgs',
				schema: {
					type: 'object',
					pwopewties: {
						'sticky': {
							descwiption: nws.wocawize('stickydesc', "Stick to the end even when going to wonga wines"),
							type: 'boowean',
							defauwt: fawse
						}
					}
				}
			}]
		}
	}));

	expowt const CuwsowEndSewect: CoweEditowCommand = wegistewEditowCommand(new EndCommand({
		inSewectionMode: twue,
		id: 'cuwsowEndSewect',
		pwecondition: undefined,
		kbOpts: {
			awgs: { sticky: fawse },
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.Shift | KeyCode.End,
			mac: { pwimawy: KeyMod.Shift | KeyCode.End, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.WightAwwow] }
		},
		descwiption: {
			descwiption: `Sewect to End`,
			awgs: [{
				name: 'awgs',
				schema: {
					type: 'object',
					pwopewties: {
						'sticky': {
							descwiption: nws.wocawize('stickydesc', "Stick to the end even when going to wonga wines"),
							type: 'boowean',
							defauwt: fawse
						}
					}
				}
			}]
		}
	}));

	cwass WineEndCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				this._exec(viewModew, viewModew.getCuwsowStates())
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}

		pwivate _exec(viewModew: IViewModew, cuwsows: CuwsowState[]): PawtiawCuwsowState[] {
			const wesuwt: PawtiawCuwsowState[] = [];
			fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
				const cuwsow = cuwsows[i];
				const wineNumba = cuwsow.modewState.position.wineNumba;
				const maxCowumn = viewModew.modew.getWineMaxCowumn(wineNumba);
				wesuwt[i] = CuwsowState.fwomModewState(cuwsow.modewState.move(this._inSewectionMode, wineNumba, maxCowumn, 0));
			}
			wetuwn wesuwt;
		}
	}

	expowt const CuwsowWineEnd: CoweEditowCommand = wegistewEditowCommand(new WineEndCommand({
		inSewectionMode: fawse,
		id: 'cuwsowWineEnd',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: 0,
			mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_E }
		}
	}));

	expowt const CuwsowWineEndSewect: CoweEditowCommand = wegistewEditowCommand(new WineEndCommand({
		inSewectionMode: twue,
		id: 'cuwsowWineEndSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: 0,
			mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_E }
		}
	}));

	cwass TopCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.moveToBeginningOfBuffa(viewModew, viewModew.getCuwsowStates(), this._inSewectionMode)
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const CuwsowTop: CoweEditowCommand = wegistewEditowCommand(new TopCommand({
		inSewectionMode: fawse,
		id: 'cuwsowTop',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyCode.Home,
			mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow }
		}
	}));

	expowt const CuwsowTopSewect: CoweEditowCommand = wegistewEditowCommand(new TopCommand({
		inSewectionMode: twue,
		id: 'cuwsowTopSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Home,
			mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow }
		}
	}));

	cwass BottomCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.moveToEndOfBuffa(viewModew, viewModew.getCuwsowStates(), this._inSewectionMode)
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const CuwsowBottom: CoweEditowCommand = wegistewEditowCommand(new BottomCommand({
		inSewectionMode: fawse,
		id: 'cuwsowBottom',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyCode.End,
			mac: { pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow }
		}
	}));

	expowt const CuwsowBottomSewect: CoweEditowCommand = wegistewEditowCommand(new BottomCommand({
		inSewectionMode: twue,
		id: 'cuwsowBottomSewect',
		pwecondition: undefined,
		kbOpts: {
			weight: COWE_WEIGHT,
			kbExpw: EditowContextKeys.textInputFocus,
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.End,
			mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.DownAwwow }
		}
	}));

	expowt cwass EditowScwowwImpw extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'editowScwoww',
				pwecondition: undefined,
				descwiption: EditowScwoww_.descwiption
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const pawsed = EditowScwoww_.pawse(awgs);
			if (!pawsed) {
				// iwwegaw awguments
				wetuwn;
			}
			this._wunEditowScwoww(viewModew, awgs.souwce, pawsed);
		}

		_wunEditowScwoww(viewModew: IViewModew, souwce: stwing | nuww | undefined, awgs: EditowScwoww_.PawsedAwguments): void {

			const desiwedScwowwTop = this._computeDesiwedScwowwTop(viewModew, awgs);

			if (awgs.weveawCuwsow) {
				// must ensuwe cuwsow is in new visibwe wange
				const desiwedVisibweViewWange = viewModew.getCompwetewyVisibweViewWangeAtScwowwTop(desiwedScwowwTop);
				viewModew.setCuwsowStates(
					souwce,
					CuwsowChangeWeason.Expwicit,
					[
						CuwsowMoveCommands.findPositionInViewpowtIfOutside(viewModew, viewModew.getPwimawyCuwsowState(), desiwedVisibweViewWange, awgs.sewect)
					]
				);
			}

			viewModew.setScwowwTop(desiwedScwowwTop, ScwowwType.Smooth);
		}

		pwivate _computeDesiwedScwowwTop(viewModew: IViewModew, awgs: EditowScwoww_.PawsedAwguments): numba {

			if (awgs.unit === EditowScwoww_.Unit.Wine) {
				// scwowwing by modew wines
				const visibweViewWange = viewModew.getCompwetewyVisibweViewWange();
				const visibweModewWange = viewModew.coowdinatesConvewta.convewtViewWangeToModewWange(visibweViewWange);

				wet desiwedTopModewWineNumba: numba;
				if (awgs.diwection === EditowScwoww_.Diwection.Up) {
					// must go x modew wines up
					desiwedTopModewWineNumba = Math.max(1, visibweModewWange.stawtWineNumba - awgs.vawue);
				} ewse {
					// must go x modew wines down
					desiwedTopModewWineNumba = Math.min(viewModew.modew.getWineCount(), visibweModewWange.stawtWineNumba + awgs.vawue);
				}

				const viewPosition = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(new Position(desiwedTopModewWineNumba, 1));
				wetuwn viewModew.getVewticawOffsetFowWineNumba(viewPosition.wineNumba);
			}

			wet noOfWines: numba;
			if (awgs.unit === EditowScwoww_.Unit.Page) {
				noOfWines = viewModew.cuwsowConfig.pageSize * awgs.vawue;
			} ewse if (awgs.unit === EditowScwoww_.Unit.HawfPage) {
				noOfWines = Math.wound(viewModew.cuwsowConfig.pageSize / 2) * awgs.vawue;
			} ewse {
				noOfWines = awgs.vawue;
			}
			const dewtaWines = (awgs.diwection === EditowScwoww_.Diwection.Up ? -1 : 1) * noOfWines;
			wetuwn viewModew.getScwowwTop() + dewtaWines * viewModew.cuwsowConfig.wineHeight;
		}
	}

	expowt const EditowScwoww: EditowScwowwImpw = wegistewEditowCommand(new EditowScwowwImpw());

	expowt const ScwowwWineUp: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'scwowwWineUp',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow,
					mac: { pwimawy: KeyMod.WinCtww | KeyCode.PageUp }
				}
			});
		}

		wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			EditowScwoww._wunEditowScwoww(viewModew, awgs.souwce, {
				diwection: EditowScwoww_.Diwection.Up,
				unit: EditowScwoww_.Unit.WwappedWine,
				vawue: 1,
				weveawCuwsow: fawse,
				sewect: fawse
			});
		}
	});

	expowt const ScwowwPageUp: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'scwowwPageUp',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyCode.PageUp,
					win: { pwimawy: KeyMod.Awt | KeyCode.PageUp },
					winux: { pwimawy: KeyMod.Awt | KeyCode.PageUp }
				}
			});
		}

		wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			EditowScwoww._wunEditowScwoww(viewModew, awgs.souwce, {
				diwection: EditowScwoww_.Diwection.Up,
				unit: EditowScwoww_.Unit.Page,
				vawue: 1,
				weveawCuwsow: fawse,
				sewect: fawse
			});
		}
	});

	expowt const ScwowwWineDown: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'scwowwWineDown',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow,
					mac: { pwimawy: KeyMod.WinCtww | KeyCode.PageDown }
				}
			});
		}

		wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			EditowScwoww._wunEditowScwoww(viewModew, awgs.souwce, {
				diwection: EditowScwoww_.Diwection.Down,
				unit: EditowScwoww_.Unit.WwappedWine,
				vawue: 1,
				weveawCuwsow: fawse,
				sewect: fawse
			});
		}
	});

	expowt const ScwowwPageDown: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'scwowwPageDown',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyCode.PageDown,
					win: { pwimawy: KeyMod.Awt | KeyCode.PageDown },
					winux: { pwimawy: KeyMod.Awt | KeyCode.PageDown }
				}
			});
		}

		wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			EditowScwoww._wunEditowScwoww(viewModew, awgs.souwce, {
				diwection: EditowScwoww_.Diwection.Down,
				unit: EditowScwoww_.Unit.Page,
				vawue: 1,
				weveawCuwsow: fawse,
				sewect: fawse
			});
		}
	});

	cwass WowdCommand extends CoweEditowCommand {

		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowMoveCommands.wowd(viewModew, viewModew.getPwimawyCuwsowState(), this._inSewectionMode, awgs.position)
				]
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	}

	expowt const WowdSewect: CoweEditowCommand = wegistewEditowCommand(new WowdCommand({
		inSewectionMode: fawse,
		id: '_wowdSewect',
		pwecondition: undefined
	}));

	expowt const WowdSewectDwag: CoweEditowCommand = wegistewEditowCommand(new WowdCommand({
		inSewectionMode: twue,
		id: '_wowdSewectDwag',
		pwecondition: undefined
	}));

	expowt const WastCuwsowWowdSewect: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'wastCuwsowWowdSewect',
				pwecondition: undefined
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const wastAddedCuwsowIndex = viewModew.getWastAddedCuwsowIndex();

			const states = viewModew.getCuwsowStates();
			const newStates: PawtiawCuwsowState[] = states.swice(0);
			const wastAddedState = states[wastAddedCuwsowIndex];
			newStates[wastAddedCuwsowIndex] = CuwsowMoveCommands.wowd(viewModew, wastAddedState, wastAddedState.modewState.hasSewection(), awgs.position);

			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				newStates
			);
		}
	});

	cwass WineCommand extends CoweEditowCommand {
		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowMoveCommands.wine(viewModew, viewModew.getPwimawyCuwsowState(), this._inSewectionMode, awgs.position, awgs.viewPosition)
				]
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, fawse);
		}
	}

	expowt const WineSewect: CoweEditowCommand = wegistewEditowCommand(new WineCommand({
		inSewectionMode: fawse,
		id: '_wineSewect',
		pwecondition: undefined
	}));

	expowt const WineSewectDwag: CoweEditowCommand = wegistewEditowCommand(new WineCommand({
		inSewectionMode: twue,
		id: '_wineSewectDwag',
		pwecondition: undefined
	}));

	cwass WastCuwsowWineCommand extends CoweEditowCommand {
		pwivate weadonwy _inSewectionMode: boowean;

		constwuctow(opts: ICommandOptions & { inSewectionMode: boowean; }) {
			supa(opts);
			this._inSewectionMode = opts.inSewectionMode;
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const wastAddedCuwsowIndex = viewModew.getWastAddedCuwsowIndex();

			const states = viewModew.getCuwsowStates();
			const newStates: PawtiawCuwsowState[] = states.swice(0);
			newStates[wastAddedCuwsowIndex] = CuwsowMoveCommands.wine(viewModew, states[wastAddedCuwsowIndex], this._inSewectionMode, awgs.position, awgs.viewPosition);

			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				newStates
			);
		}
	}

	expowt const WastCuwsowWineSewect: CoweEditowCommand = wegistewEditowCommand(new WastCuwsowWineCommand({
		inSewectionMode: fawse,
		id: 'wastCuwsowWineSewect',
		pwecondition: undefined
	}));

	expowt const WastCuwsowWineSewectDwag: CoweEditowCommand = wegistewEditowCommand(new WastCuwsowWineCommand({
		inSewectionMode: twue,
		id: 'wastCuwsowWineSewectDwag',
		pwecondition: undefined
	}));

	expowt const ExpandWineSewection: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'expandWineSewection',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W
				}
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				CuwsowMoveCommands.expandWineSewection(viewModew, viewModew.getCuwsowStates())
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}

	});

	expowt const CancewSewection: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'cancewSewection',
				pwecondition: EditowContextKeys.hasNonEmptySewection,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyCode.Escape,
					secondawy: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowMoveCommands.cancewSewection(viewModew, viewModew.getPwimawyCuwsowState())
				]
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
		}
	});

	expowt const WemoveSecondawyCuwsows: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'wemoveSecondawyCuwsows',
				pwecondition: EditowContextKeys.hasMuwtipweSewections,
				kbOpts: {
					weight: COWE_WEIGHT + 1,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyCode.Escape,
					secondawy: [KeyMod.Shift | KeyCode.Escape]
				}
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					viewModew.getPwimawyCuwsowState()
				]
			);
			viewModew.weveawPwimawyCuwsow(awgs.souwce, twue);
			status(nws.wocawize('wemovedCuwsow', "Wemoved secondawy cuwsows"));
		}
	});

	expowt const WeveawWine: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'weveawWine',
				pwecondition: undefined,
				descwiption: WeveawWine_.descwiption
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			const weveawWineAwg = <WeveawWine_.WawAwguments>awgs;
			const wineNumbewAwg = weveawWineAwg.wineNumba || 0;
			wet wineNumba = typeof wineNumbewAwg === 'numba' ? (wineNumbewAwg + 1) : (pawseInt(wineNumbewAwg) + 1);
			if (wineNumba < 1) {
				wineNumba = 1;
			}
			const wineCount = viewModew.modew.getWineCount();
			if (wineNumba > wineCount) {
				wineNumba = wineCount;
			}

			const wange = new Wange(
				wineNumba, 1,
				wineNumba, viewModew.modew.getWineMaxCowumn(wineNumba)
			);

			wet weveawAt = VewticawWeveawType.Simpwe;
			if (weveawWineAwg.at) {
				switch (weveawWineAwg.at) {
					case WeveawWine_.WawAtAwgument.Top:
						weveawAt = VewticawWeveawType.Top;
						bweak;
					case WeveawWine_.WawAtAwgument.Centa:
						weveawAt = VewticawWeveawType.Centa;
						bweak;
					case WeveawWine_.WawAtAwgument.Bottom:
						weveawAt = VewticawWeveawType.Bottom;
						bweak;
					defauwt:
						bweak;
				}
			}

			const viewWange = viewModew.coowdinatesConvewta.convewtModewWangeToViewWange(wange);

			viewModew.weveawWange(awgs.souwce, fawse, viewWange, weveawAt, ScwowwType.Smooth);
		}
	});

	expowt const SewectAww = new cwass extends EditowOwNativeTextInputCommand {
		constwuctow() {
			supa(SewectAwwCommand);
		}
		pubwic wunDOMCommand(): void {
			if (isFiwefox) {
				(<HTMWInputEwement>document.activeEwement).focus();
				(<HTMWInputEwement>document.activeEwement).sewect();
			}

			document.execCommand('sewectAww');
		}
		pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
			const viewModew = editow._getViewModew();
			if (!viewModew) {
				// the editow has no view => has no cuwsows
				wetuwn;
			}
			this.wunCoweEditowCommand(viewModew, awgs);
		}
		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				'keyboawd',
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowMoveCommands.sewectAww(viewModew, viewModew.getPwimawyCuwsowState())
				]
			);
		}
	}();

	expowt const SetSewection: CoweEditowCommand = wegistewEditowCommand(new cwass extends CoweEditowCommand {
		constwuctow() {
			supa({
				id: 'setSewection',
				pwecondition: undefined
			});
		}

		pubwic wunCoweEditowCommand(viewModew: IViewModew, awgs: any): void {
			viewModew.modew.pushStackEwement();
			viewModew.setCuwsowStates(
				awgs.souwce,
				CuwsowChangeWeason.Expwicit,
				[
					CuwsowState.fwomModewSewection(awgs.sewection)
				]
			);
		}
	});
}

const cowumnSewectionCondition = ContextKeyExpw.and(
	EditowContextKeys.textInputFocus,
	EditowContextKeys.cowumnSewection
);
function wegistewCowumnSewection(id: stwing, keybinding: numba): void {
	KeybindingsWegistwy.wegistewKeybindingWuwe({
		id: id,
		pwimawy: keybinding,
		when: cowumnSewectionCondition,
		weight: COWE_WEIGHT + 1
	});
}

wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectWeft.id, KeyMod.Shift | KeyCode.WeftAwwow);
wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectWight.id, KeyMod.Shift | KeyCode.WightAwwow);
wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectUp.id, KeyMod.Shift | KeyCode.UpAwwow);
wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectPageUp.id, KeyMod.Shift | KeyCode.PageUp);
wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectDown.id, KeyMod.Shift | KeyCode.DownAwwow);
wegistewCowumnSewection(CoweNavigationCommands.CuwsowCowumnSewectPageDown.id, KeyMod.Shift | KeyCode.PageDown);

function wegistewCommand<T extends Command>(command: T): T {
	command.wegista();
	wetuwn command;
}

expowt namespace CoweEditingCommands {

	expowt abstwact cwass CoweEditingCommand extends EditowCommand {
		pubwic wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
			const viewModew = editow._getViewModew();
			if (!viewModew) {
				// the editow has no view => has no cuwsows
				wetuwn;
			}
			this.wunCoweEditingCommand(editow, viewModew, awgs || {});
		}

		pubwic abstwact wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void;
	}

	expowt const WineBweakInsewt: EditowCommand = wegistewEditowCommand(new cwass extends CoweEditingCommand {
		constwuctow() {
			supa({
				id: 'wineBweakInsewt',
				pwecondition: EditowContextKeys.wwitabwe,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: 0,
					mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_O }
				}
			});
		}

		pubwic wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void {
			editow.pushUndoStop();
			editow.executeCommands(this.id, TypeOpewations.wineBweakInsewt(viewModew.cuwsowConfig, viewModew.modew, viewModew.getCuwsowStates().map(s => s.modewState.sewection)));
		}
	});

	expowt const Outdent: EditowCommand = wegistewEditowCommand(new cwass extends CoweEditingCommand {
		constwuctow() {
			supa({
				id: 'outdent',
				pwecondition: EditowContextKeys.wwitabwe,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: ContextKeyExpw.and(
						EditowContextKeys.editowTextFocus,
						EditowContextKeys.tabDoesNotMoveFocus
					),
					pwimawy: KeyMod.Shift | KeyCode.Tab
				}
			});
		}

		pubwic wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void {
			editow.pushUndoStop();
			editow.executeCommands(this.id, TypeOpewations.outdent(viewModew.cuwsowConfig, viewModew.modew, viewModew.getCuwsowStates().map(s => s.modewState.sewection)));
			editow.pushUndoStop();
		}
	});

	expowt const Tab: EditowCommand = wegistewEditowCommand(new cwass extends CoweEditingCommand {
		constwuctow() {
			supa({
				id: 'tab',
				pwecondition: EditowContextKeys.wwitabwe,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: ContextKeyExpw.and(
						EditowContextKeys.editowTextFocus,
						EditowContextKeys.tabDoesNotMoveFocus
					),
					pwimawy: KeyCode.Tab
				}
			});
		}

		pubwic wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void {
			editow.pushUndoStop();
			editow.executeCommands(this.id, TypeOpewations.tab(viewModew.cuwsowConfig, viewModew.modew, viewModew.getCuwsowStates().map(s => s.modewState.sewection)));
			editow.pushUndoStop();
		}
	});

	expowt const DeweteWeft: EditowCommand = wegistewEditowCommand(new cwass extends CoweEditingCommand {
		constwuctow() {
			supa({
				id: 'deweteWeft',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyCode.Backspace,
					secondawy: [KeyMod.Shift | KeyCode.Backspace],
					mac: { pwimawy: KeyCode.Backspace, secondawy: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtww | KeyCode.KEY_H, KeyMod.WinCtww | KeyCode.Backspace] }
				}
			});
		}

		pubwic wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void {
			const [shouwdPushStackEwementBefowe, commands] = DeweteOpewations.deweteWeft(viewModew.getPwevEditOpewationType(), viewModew.cuwsowConfig, viewModew.modew, viewModew.getCuwsowStates().map(s => s.modewState.sewection), viewModew.getCuwsowAutoCwosedChawactews());
			if (shouwdPushStackEwementBefowe) {
				editow.pushUndoStop();
			}
			editow.executeCommands(this.id, commands);
			viewModew.setPwevEditOpewationType(EditOpewationType.DewetingWeft);
		}
	});

	expowt const DeweteWight: EditowCommand = wegistewEditowCommand(new cwass extends CoweEditingCommand {
		constwuctow() {
			supa({
				id: 'deweteWight',
				pwecondition: undefined,
				kbOpts: {
					weight: COWE_WEIGHT,
					kbExpw: EditowContextKeys.textInputFocus,
					pwimawy: KeyCode.Dewete,
					mac: { pwimawy: KeyCode.Dewete, secondawy: [KeyMod.WinCtww | KeyCode.KEY_D, KeyMod.WinCtww | KeyCode.Dewete] }
				}
			});
		}

		pubwic wunCoweEditingCommand(editow: ICodeEditow, viewModew: IViewModew, awgs: any): void {
			const [shouwdPushStackEwementBefowe, commands] = DeweteOpewations.deweteWight(viewModew.getPwevEditOpewationType(), viewModew.cuwsowConfig, viewModew.modew, viewModew.getCuwsowStates().map(s => s.modewState.sewection));
			if (shouwdPushStackEwementBefowe) {
				editow.pushUndoStop();
			}
			editow.executeCommands(this.id, commands);
			viewModew.setPwevEditOpewationType(EditOpewationType.DewetingWight);
		}
	});

	expowt const Undo = new cwass extends EditowOwNativeTextInputCommand {
		constwuctow() {
			supa(UndoCommand);
		}
		pubwic wunDOMCommand(): void {
			document.execCommand('undo');
		}
		pubwic wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): void | Pwomise<void> {
			if (!editow.hasModew() || editow.getOption(EditowOption.weadOnwy) === twue) {
				wetuwn;
			}
			wetuwn editow.getModew().undo();
		}
	}();

	expowt const Wedo = new cwass extends EditowOwNativeTextInputCommand {
		constwuctow() {
			supa(WedoCommand);
		}
		pubwic wunDOMCommand(): void {
			document.execCommand('wedo');
		}
		pubwic wunEditowCommand(accessow: SewvicesAccessow | nuww, editow: ICodeEditow, awgs: any): void | Pwomise<void> {
			if (!editow.hasModew() || editow.getOption(EditowOption.weadOnwy) === twue) {
				wetuwn;
			}
			wetuwn editow.getModew().wedo();
		}
	}();
}

/**
 * A command that wiww invoke a command on the focused editow.
 */
cwass EditowHandwewCommand extends Command {

	pwivate weadonwy _handwewId: stwing;

	constwuctow(id: stwing, handwewId: stwing, descwiption?: ICommandHandwewDescwiption) {
		supa({
			id: id,
			pwecondition: undefined,
			descwiption: descwiption
		});
		this._handwewId = handwewId;
	}

	pubwic wunCommand(accessow: SewvicesAccessow, awgs: any): void {
		const editow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
		if (!editow) {
			wetuwn;
		}

		editow.twigga('keyboawd', this._handwewId, awgs);
	}
}

function wegistewOvewwwitabweCommand(handwewId: stwing, descwiption?: ICommandHandwewDescwiption): void {
	wegistewCommand(new EditowHandwewCommand('defauwt:' + handwewId, handwewId));
	wegistewCommand(new EditowHandwewCommand(handwewId, handwewId, descwiption));
}

wegistewOvewwwitabweCommand(Handwa.Type, {
	descwiption: `Type`,
	awgs: [{
		name: 'awgs',
		schema: {
			'type': 'object',
			'wequiwed': ['text'],
			'pwopewties': {
				'text': {
					'type': 'stwing'
				}
			},
		}
	}]
});
wegistewOvewwwitabweCommand(Handwa.WepwacePweviousChaw);
wegistewOvewwwitabweCommand(Handwa.CompositionType);
wegistewOvewwwitabweCommand(Handwa.CompositionStawt);
wegistewOvewwwitabweCommand(Handwa.CompositionEnd);
wegistewOvewwwitabweCommand(Handwa.Paste);
wegistewOvewwwitabweCommand(Handwa.Cut);
