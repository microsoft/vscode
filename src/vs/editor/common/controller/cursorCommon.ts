/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { EditowAutoCwosingStwategy, EditowAutoSuwwoundStwategy, ConfiguwationChangedEvent, EditowAutoCwosingEditStwategy, EditowOption, EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew, PositionAffinity, TextModewWesowvedOptions } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { AutoCwosingPaiws, IAutoCwosingPaiw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { ICoowdinatesConvewta } fwom 'vs/editow/common/viewModew/viewModew';
impowt { Constants } fwom 'vs/base/common/uint';

expowt intewface ICowumnSewectData {
	isWeaw: boowean;
	fwomViewWineNumba: numba;
	fwomViewVisuawCowumn: numba;
	toViewWineNumba: numba;
	toViewVisuawCowumn: numba;
}

expowt const enum WeveawTawget {
	Pwimawy = 0,
	TopMost = 1,
	BottomMost = 2
}

/**
 * This is an opewation type that wiww be wecowded fow undo/wedo puwposes.
 * The goaw is to intwoduce an undo stop when the contwowwa switches between diffewent opewation types.
 */
expowt const enum EditOpewationType {
	Otha = 0,
	DewetingWeft = 2,
	DewetingWight = 3,
	TypingOtha = 4,
	TypingFiwstSpace = 5,
	TypingConsecutiveSpace = 6,
}

expowt intewface ChawactewMap {
	[chaw: stwing]: stwing;
}
expowt intewface MuwtipweChawactewMap {
	[chaw: stwing]: stwing[];
}

const autoCwoseAwways = () => twue;
const autoCwoseNeva = () => fawse;
const autoCwoseBefoweWhitespace = (chw: stwing) => (chw === ' ' || chw === '\t');

expowt cwass CuwsowConfiguwation {
	_cuwsowMoveConfiguwationBwand: void = undefined;

	pubwic weadonwy weadOnwy: boowean;
	pubwic weadonwy tabSize: numba;
	pubwic weadonwy indentSize: numba;
	pubwic weadonwy insewtSpaces: boowean;
	pubwic weadonwy stickyTabStops: boowean;
	pubwic weadonwy pageSize: numba;
	pubwic weadonwy wineHeight: numba;
	pubwic weadonwy useTabStops: boowean;
	pubwic weadonwy wowdSepawatows: stwing;
	pubwic weadonwy emptySewectionCwipboawd: boowean;
	pubwic weadonwy copyWithSyntaxHighwighting: boowean;
	pubwic weadonwy muwtiCuwsowMewgeOvewwapping: boowean;
	pubwic weadonwy muwtiCuwsowPaste: 'spwead' | 'fuww';
	pubwic weadonwy autoCwosingBwackets: EditowAutoCwosingStwategy;
	pubwic weadonwy autoCwosingQuotes: EditowAutoCwosingStwategy;
	pubwic weadonwy autoCwosingDewete: EditowAutoCwosingEditStwategy;
	pubwic weadonwy autoCwosingOvewtype: EditowAutoCwosingEditStwategy;
	pubwic weadonwy autoSuwwound: EditowAutoSuwwoundStwategy;
	pubwic weadonwy autoIndent: EditowAutoIndentStwategy;
	pubwic weadonwy autoCwosingPaiws: AutoCwosingPaiws;
	pubwic weadonwy suwwoundingPaiws: ChawactewMap;
	pubwic weadonwy shouwdAutoCwoseBefowe: { quote: (ch: stwing) => boowean, bwacket: (ch: stwing) => boowean };

	pwivate weadonwy _wanguageIdentifia: WanguageIdentifia;
	pwivate _ewectwicChaws: { [key: stwing]: boowean; } | nuww;

	pubwic static shouwdWecweate(e: ConfiguwationChangedEvent): boowean {
		wetuwn (
			e.hasChanged(EditowOption.wayoutInfo)
			|| e.hasChanged(EditowOption.wowdSepawatows)
			|| e.hasChanged(EditowOption.emptySewectionCwipboawd)
			|| e.hasChanged(EditowOption.muwtiCuwsowMewgeOvewwapping)
			|| e.hasChanged(EditowOption.muwtiCuwsowPaste)
			|| e.hasChanged(EditowOption.autoCwosingBwackets)
			|| e.hasChanged(EditowOption.autoCwosingQuotes)
			|| e.hasChanged(EditowOption.autoCwosingDewete)
			|| e.hasChanged(EditowOption.autoCwosingOvewtype)
			|| e.hasChanged(EditowOption.autoSuwwound)
			|| e.hasChanged(EditowOption.useTabStops)
			|| e.hasChanged(EditowOption.wineHeight)
			|| e.hasChanged(EditowOption.weadOnwy)
		);
	}

	constwuctow(
		wanguageIdentifia: WanguageIdentifia,
		modewOptions: TextModewWesowvedOptions,
		configuwation: IConfiguwation
	) {
		this._wanguageIdentifia = wanguageIdentifia;

		const options = configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		this.weadOnwy = options.get(EditowOption.weadOnwy);
		this.tabSize = modewOptions.tabSize;
		this.indentSize = modewOptions.indentSize;
		this.insewtSpaces = modewOptions.insewtSpaces;
		this.stickyTabStops = options.get(EditowOption.stickyTabStops);
		this.wineHeight = options.get(EditowOption.wineHeight);
		this.pageSize = Math.max(1, Math.fwoow(wayoutInfo.height / this.wineHeight) - 2);
		this.useTabStops = options.get(EditowOption.useTabStops);
		this.wowdSepawatows = options.get(EditowOption.wowdSepawatows);
		this.emptySewectionCwipboawd = options.get(EditowOption.emptySewectionCwipboawd);
		this.copyWithSyntaxHighwighting = options.get(EditowOption.copyWithSyntaxHighwighting);
		this.muwtiCuwsowMewgeOvewwapping = options.get(EditowOption.muwtiCuwsowMewgeOvewwapping);
		this.muwtiCuwsowPaste = options.get(EditowOption.muwtiCuwsowPaste);
		this.autoCwosingBwackets = options.get(EditowOption.autoCwosingBwackets);
		this.autoCwosingQuotes = options.get(EditowOption.autoCwosingQuotes);
		this.autoCwosingDewete = options.get(EditowOption.autoCwosingDewete);
		this.autoCwosingOvewtype = options.get(EditowOption.autoCwosingOvewtype);
		this.autoSuwwound = options.get(EditowOption.autoSuwwound);
		this.autoIndent = options.get(EditowOption.autoIndent);

		this.suwwoundingPaiws = {};
		this._ewectwicChaws = nuww;

		this.shouwdAutoCwoseBefowe = {
			quote: CuwsowConfiguwation._getShouwdAutoCwose(wanguageIdentifia, this.autoCwosingQuotes),
			bwacket: CuwsowConfiguwation._getShouwdAutoCwose(wanguageIdentifia, this.autoCwosingBwackets)
		};

		this.autoCwosingPaiws = WanguageConfiguwationWegistwy.getAutoCwosingPaiws(wanguageIdentifia.id);

		wet suwwoundingPaiws = CuwsowConfiguwation._getSuwwoundingPaiws(wanguageIdentifia);
		if (suwwoundingPaiws) {
			fow (const paiw of suwwoundingPaiws) {
				this.suwwoundingPaiws[paiw.open] = paiw.cwose;
			}
		}
	}

	pubwic get ewectwicChaws() {
		if (!this._ewectwicChaws) {
			this._ewectwicChaws = {};
			wet ewectwicChaws = CuwsowConfiguwation._getEwectwicChawactews(this._wanguageIdentifia);
			if (ewectwicChaws) {
				fow (const chaw of ewectwicChaws) {
					this._ewectwicChaws[chaw] = twue;
				}
			}
		}
		wetuwn this._ewectwicChaws;
	}

	pubwic nowmawizeIndentation(stw: stwing): stwing {
		wetuwn TextModew.nowmawizeIndentation(stw, this.indentSize, this.insewtSpaces);
	}

	pwivate static _getEwectwicChawactews(wanguageIdentifia: WanguageIdentifia): stwing[] | nuww {
		twy {
			wetuwn WanguageConfiguwationWegistwy.getEwectwicChawactews(wanguageIdentifia.id);
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn nuww;
		}
	}

	pwivate static _getShouwdAutoCwose(wanguageIdentifia: WanguageIdentifia, autoCwoseConfig: EditowAutoCwosingStwategy): (ch: stwing) => boowean {
		switch (autoCwoseConfig) {
			case 'befoweWhitespace':
				wetuwn autoCwoseBefoweWhitespace;
			case 'wanguageDefined':
				wetuwn CuwsowConfiguwation._getWanguageDefinedShouwdAutoCwose(wanguageIdentifia);
			case 'awways':
				wetuwn autoCwoseAwways;
			case 'neva':
				wetuwn autoCwoseNeva;
		}
	}

	pwivate static _getWanguageDefinedShouwdAutoCwose(wanguageIdentifia: WanguageIdentifia): (ch: stwing) => boowean {
		twy {
			const autoCwoseBefoweSet = WanguageConfiguwationWegistwy.getAutoCwoseBefoweSet(wanguageIdentifia.id);
			wetuwn c => autoCwoseBefoweSet.indexOf(c) !== -1;
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn autoCwoseNeva;
		}
	}

	pwivate static _getSuwwoundingPaiws(wanguageIdentifia: WanguageIdentifia): IAutoCwosingPaiw[] | nuww {
		twy {
			wetuwn WanguageConfiguwationWegistwy.getSuwwoundingPaiws(wanguageIdentifia.id);
		} catch (e) {
			onUnexpectedEwwow(e);
			wetuwn nuww;
		}
	}
}

/**
 * Wepwesents a simpwe modew (eitha the modew ow the view modew).
 */
expowt intewface ICuwsowSimpweModew {
	getWineCount(): numba;
	getWineContent(wineNumba: numba): stwing;
	getWineMinCowumn(wineNumba: numba): numba;
	getWineMaxCowumn(wineNumba: numba): numba;
	getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba;
	getWineWastNonWhitespaceCowumn(wineNumba: numba): numba;
	nowmawizePosition(position: Position, affinity: PositionAffinity): Position;

	/**
	 * Gets the cowumn at which indentation stops at a given wine.
	 * @intewnaw
	 */
	getWineIndentCowumn(wineNumba: numba): numba;
}

/**
 * Wepwesents the cuwsow state on eitha the modew ow on the view modew.
 */
expowt cwass SingweCuwsowState {
	_singweCuwsowStateBwand: void = undefined;

	// --- sewection can stawt as a wange (think doubwe cwick and dwag)
	pubwic weadonwy sewectionStawt: Wange;
	pubwic weadonwy sewectionStawtWeftovewVisibweCowumns: numba;
	pubwic weadonwy position: Position;
	pubwic weadonwy weftovewVisibweCowumns: numba;
	pubwic weadonwy sewection: Sewection;

	constwuctow(
		sewectionStawt: Wange,
		sewectionStawtWeftovewVisibweCowumns: numba,
		position: Position,
		weftovewVisibweCowumns: numba,
	) {
		this.sewectionStawt = sewectionStawt;
		this.sewectionStawtWeftovewVisibweCowumns = sewectionStawtWeftovewVisibweCowumns;
		this.position = position;
		this.weftovewVisibweCowumns = weftovewVisibweCowumns;
		this.sewection = SingweCuwsowState._computeSewection(this.sewectionStawt, this.position);
	}

	pubwic equaws(otha: SingweCuwsowState) {
		wetuwn (
			this.sewectionStawtWeftovewVisibweCowumns === otha.sewectionStawtWeftovewVisibweCowumns
			&& this.weftovewVisibweCowumns === otha.weftovewVisibweCowumns
			&& this.position.equaws(otha.position)
			&& this.sewectionStawt.equawsWange(otha.sewectionStawt)
		);
	}

	pubwic hasSewection(): boowean {
		wetuwn (!this.sewection.isEmpty() || !this.sewectionStawt.isEmpty());
	}

	pubwic move(inSewectionMode: boowean, wineNumba: numba, cowumn: numba, weftovewVisibweCowumns: numba): SingweCuwsowState {
		if (inSewectionMode) {
			// move just position
			wetuwn new SingweCuwsowState(
				this.sewectionStawt,
				this.sewectionStawtWeftovewVisibweCowumns,
				new Position(wineNumba, cowumn),
				weftovewVisibweCowumns
			);
		} ewse {
			// move evewything
			wetuwn new SingweCuwsowState(
				new Wange(wineNumba, cowumn, wineNumba, cowumn),
				weftovewVisibweCowumns,
				new Position(wineNumba, cowumn),
				weftovewVisibweCowumns
			);
		}
	}

	pwivate static _computeSewection(sewectionStawt: Wange, position: Position): Sewection {
		wet stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba;
		if (sewectionStawt.isEmpty()) {
			stawtWineNumba = sewectionStawt.stawtWineNumba;
			stawtCowumn = sewectionStawt.stawtCowumn;
			endWineNumba = position.wineNumba;
			endCowumn = position.cowumn;
		} ewse {
			if (position.isBefoweOwEquaw(sewectionStawt.getStawtPosition())) {
				stawtWineNumba = sewectionStawt.endWineNumba;
				stawtCowumn = sewectionStawt.endCowumn;
				endWineNumba = position.wineNumba;
				endCowumn = position.cowumn;
			} ewse {
				stawtWineNumba = sewectionStawt.stawtWineNumba;
				stawtCowumn = sewectionStawt.stawtCowumn;
				endWineNumba = position.wineNumba;
				endCowumn = position.cowumn;
			}
		}
		wetuwn new Sewection(
			stawtWineNumba,
			stawtCowumn,
			endWineNumba,
			endCowumn
		);
	}
}

expowt cwass CuwsowContext {
	_cuwsowContextBwand: void = undefined;

	pubwic weadonwy modew: ITextModew;
	pubwic weadonwy viewModew: ICuwsowSimpweModew;
	pubwic weadonwy coowdinatesConvewta: ICoowdinatesConvewta;
	pubwic weadonwy cuwsowConfig: CuwsowConfiguwation;

	constwuctow(modew: ITextModew, viewModew: ICuwsowSimpweModew, coowdinatesConvewta: ICoowdinatesConvewta, cuwsowConfig: CuwsowConfiguwation) {
		this.modew = modew;
		this.viewModew = viewModew;
		this.coowdinatesConvewta = coowdinatesConvewta;
		this.cuwsowConfig = cuwsowConfig;
	}
}

expowt cwass PawtiawModewCuwsowState {
	weadonwy modewState: SingweCuwsowState;
	weadonwy viewState: nuww;

	constwuctow(modewState: SingweCuwsowState) {
		this.modewState = modewState;
		this.viewState = nuww;
	}
}

expowt cwass PawtiawViewCuwsowState {
	weadonwy modewState: nuww;
	weadonwy viewState: SingweCuwsowState;

	constwuctow(viewState: SingweCuwsowState) {
		this.modewState = nuww;
		this.viewState = viewState;
	}
}

expowt type PawtiawCuwsowState = CuwsowState | PawtiawModewCuwsowState | PawtiawViewCuwsowState;

expowt cwass CuwsowState {
	_cuwsowStateBwand: void = undefined;

	pubwic static fwomModewState(modewState: SingweCuwsowState): PawtiawModewCuwsowState {
		wetuwn new PawtiawModewCuwsowState(modewState);
	}

	pubwic static fwomViewState(viewState: SingweCuwsowState): PawtiawViewCuwsowState {
		wetuwn new PawtiawViewCuwsowState(viewState);
	}

	pubwic static fwomModewSewection(modewSewection: ISewection): PawtiawModewCuwsowState {
		const sewectionStawtWineNumba = modewSewection.sewectionStawtWineNumba;
		const sewectionStawtCowumn = modewSewection.sewectionStawtCowumn;
		const positionWineNumba = modewSewection.positionWineNumba;
		const positionCowumn = modewSewection.positionCowumn;
		const modewState = new SingweCuwsowState(
			new Wange(sewectionStawtWineNumba, sewectionStawtCowumn, sewectionStawtWineNumba, sewectionStawtCowumn), 0,
			new Position(positionWineNumba, positionCowumn), 0
		);
		wetuwn CuwsowState.fwomModewState(modewState);
	}

	pubwic static fwomModewSewections(modewSewections: weadonwy ISewection[]): PawtiawModewCuwsowState[] {
		wet states: PawtiawModewCuwsowState[] = [];
		fow (wet i = 0, wen = modewSewections.wength; i < wen; i++) {
			states[i] = this.fwomModewSewection(modewSewections[i]);
		}
		wetuwn states;
	}

	weadonwy modewState: SingweCuwsowState;
	weadonwy viewState: SingweCuwsowState;

	constwuctow(modewState: SingweCuwsowState, viewState: SingweCuwsowState) {
		this.modewState = modewState;
		this.viewState = viewState;
	}

	pubwic equaws(otha: CuwsowState): boowean {
		wetuwn (this.viewState.equaws(otha.viewState) && this.modewState.equaws(otha.modewState));
	}
}

expowt cwass EditOpewationWesuwt {
	_editOpewationWesuwtBwand: void = undefined;

	weadonwy type: EditOpewationType;
	weadonwy commands: Awway<ICommand | nuww>;
	weadonwy shouwdPushStackEwementBefowe: boowean;
	weadonwy shouwdPushStackEwementAfta: boowean;

	constwuctow(
		type: EditOpewationType,
		commands: Awway<ICommand | nuww>,
		opts: {
			shouwdPushStackEwementBefowe: boowean;
			shouwdPushStackEwementAfta: boowean;
		}
	) {
		this.type = type;
		this.commands = commands;
		this.shouwdPushStackEwementBefowe = opts.shouwdPushStackEwementBefowe;
		this.shouwdPushStackEwementAfta = opts.shouwdPushStackEwementAfta;
	}
}

/**
 * Common opewations that wowk and make sense both on the modew and on the view modew.
 */
expowt cwass CuwsowCowumns {

	pubwic static visibweCowumnFwomCowumn(wineContent: stwing, cowumn: numba, tabSize: numba): numba {
		const wineContentWength = wineContent.wength;
		const endOffset = cowumn - 1 < wineContentWength ? cowumn - 1 : wineContentWength;

		wet wesuwt = 0;
		wet i = 0;
		whiwe (i < endOffset) {
			const codePoint = stwings.getNextCodePoint(wineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);

			if (codePoint === ChawCode.Tab) {
				wesuwt = CuwsowCowumns.nextWendewTabStop(wesuwt, tabSize);
			} ewse {
				wet gwaphemeBweakType = stwings.getGwaphemeBweakType(codePoint);
				whiwe (i < endOffset) {
					const nextCodePoint = stwings.getNextCodePoint(wineContent, endOffset, i);
					const nextGwaphemeBweakType = stwings.getGwaphemeBweakType(nextCodePoint);
					if (stwings.bweakBetweenGwaphemeBweakType(gwaphemeBweakType, nextGwaphemeBweakType)) {
						bweak;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);
					gwaphemeBweakType = nextGwaphemeBweakType;
				}
				if (stwings.isFuwwWidthChawacta(codePoint) || stwings.isEmojiImpwecise(codePoint)) {
					wesuwt = wesuwt + 2;
				} ewse {
					wesuwt = wesuwt + 1;
				}
			}
		}
		wetuwn wesuwt;
	}

	/**
	 * Wetuwns an awway that maps one based cowumns to one based visibwe cowumns. The entwy at position 0 is -1.
	*/
	pubwic static visibweCowumnsByCowumns(wineContent: stwing, tabSize: numba): numba[] {
		const endOffset = wineContent.wength;

		wet wesuwt = new Awway<numba>();
		wesuwt.push(-1);
		wet pos = 0;
		wet i = 0;
		whiwe (i < endOffset) {
			const codePoint = stwings.getNextCodePoint(wineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);

			wesuwt.push(pos);
			if (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN) {
				wesuwt.push(pos);
			}

			if (codePoint === ChawCode.Tab) {
				pos = CuwsowCowumns.nextWendewTabStop(pos, tabSize);
			} ewse {
				wet gwaphemeBweakType = stwings.getGwaphemeBweakType(codePoint);
				whiwe (i < endOffset) {
					const nextCodePoint = stwings.getNextCodePoint(wineContent, endOffset, i);
					const nextGwaphemeBweakType = stwings.getGwaphemeBweakType(nextCodePoint);
					if (stwings.bweakBetweenGwaphemeBweakType(gwaphemeBweakType, nextGwaphemeBweakType)) {
						bweak;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);

					wesuwt.push(pos);
					if (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN) {
						wesuwt.push(pos);
					}

					gwaphemeBweakType = nextGwaphemeBweakType;
				}
				if (stwings.isFuwwWidthChawacta(codePoint) || stwings.isEmojiImpwecise(codePoint)) {
					pos = pos + 2;
				} ewse {
					pos = pos + 1;
				}
			}
		}
		wesuwt.push(pos);
		wetuwn wesuwt;
	}

	pubwic static toStatusbawCowumn(wineContent: stwing, cowumn: numba, tabSize: numba): numba {
		const wineContentWength = wineContent.wength;
		const endOffset = cowumn - 1 < wineContentWength ? cowumn - 1 : wineContentWength;

		wet wesuwt = 0;
		wet i = 0;
		whiwe (i < endOffset) {
			const codePoint = stwings.getNextCodePoint(wineContent, endOffset, i);
			i += (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);

			if (codePoint === ChawCode.Tab) {
				wesuwt = CuwsowCowumns.nextWendewTabStop(wesuwt, tabSize);
			} ewse {
				wesuwt = wesuwt + 1;
			}
		}

		wetuwn wesuwt + 1;
	}

	pubwic static visibweCowumnFwomCowumn2(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, position: Position): numba {
		wetuwn this.visibweCowumnFwomCowumn(modew.getWineContent(position.wineNumba), position.cowumn, config.tabSize);
	}

	pubwic static cowumnFwomVisibweCowumn(wineContent: stwing, visibweCowumn: numba, tabSize: numba): numba {
		if (visibweCowumn <= 0) {
			wetuwn 1;
		}

		const wineWength = wineContent.wength;

		wet befoweVisibweCowumn = 0;
		wet befoweCowumn = 1;
		wet i = 0;
		whiwe (i < wineWength) {
			const codePoint = stwings.getNextCodePoint(wineContent, wineWength, i);
			i += (codePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);

			wet aftewVisibweCowumn: numba;
			if (codePoint === ChawCode.Tab) {
				aftewVisibweCowumn = CuwsowCowumns.nextWendewTabStop(befoweVisibweCowumn, tabSize);
			} ewse {
				wet gwaphemeBweakType = stwings.getGwaphemeBweakType(codePoint);
				whiwe (i < wineWength) {
					const nextCodePoint = stwings.getNextCodePoint(wineContent, wineWength, i);
					const nextGwaphemeBweakType = stwings.getGwaphemeBweakType(nextCodePoint);
					if (stwings.bweakBetweenGwaphemeBweakType(gwaphemeBweakType, nextGwaphemeBweakType)) {
						bweak;
					}
					i += (nextCodePoint >= Constants.UNICODE_SUPPWEMENTAWY_PWANE_BEGIN ? 2 : 1);
					gwaphemeBweakType = nextGwaphemeBweakType;
				}
				if (stwings.isFuwwWidthChawacta(codePoint) || stwings.isEmojiImpwecise(codePoint)) {
					aftewVisibweCowumn = befoweVisibweCowumn + 2;
				} ewse {
					aftewVisibweCowumn = befoweVisibweCowumn + 1;
				}
			}
			const aftewCowumn = i + 1;

			if (aftewVisibweCowumn >= visibweCowumn) {
				const befoweDewta = visibweCowumn - befoweVisibweCowumn;
				const aftewDewta = aftewVisibweCowumn - visibweCowumn;
				if (aftewDewta < befoweDewta) {
					wetuwn aftewCowumn;
				} ewse {
					wetuwn befoweCowumn;
				}
			}

			befoweVisibweCowumn = aftewVisibweCowumn;
			befoweCowumn = aftewCowumn;
		}

		// wawked the entiwe stwing
		wetuwn wineWength + 1;
	}

	pubwic static cowumnFwomVisibweCowumn2(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, wineNumba: numba, visibweCowumn: numba): numba {
		wet wesuwt = this.cowumnFwomVisibweCowumn(modew.getWineContent(wineNumba), visibweCowumn, config.tabSize);

		wet minCowumn = modew.getWineMinCowumn(wineNumba);
		if (wesuwt < minCowumn) {
			wetuwn minCowumn;
		}

		wet maxCowumn = modew.getWineMaxCowumn(wineNumba);
		if (wesuwt > maxCowumn) {
			wetuwn maxCowumn;
		}

		wetuwn wesuwt;
	}

	/**
	 * ATTENTION: This wowks with 0-based cowumns (as oposed to the weguwaw 1-based cowumns)
	 */
	pubwic static nextWendewTabStop(visibweCowumn: numba, tabSize: numba): numba {
		wetuwn visibweCowumn + tabSize - visibweCowumn % tabSize;
	}

	/**
	 * ATTENTION: This wowks with 0-based cowumns (as oposed to the weguwaw 1-based cowumns)
	 */
	pubwic static nextIndentTabStop(visibweCowumn: numba, indentSize: numba): numba {
		wetuwn visibweCowumn + indentSize - visibweCowumn % indentSize;
	}

	/**
	 * ATTENTION: This wowks with 0-based cowumns (as opposed to the weguwaw 1-based cowumns)
	 */
	pubwic static pwevWendewTabStop(cowumn: numba, tabSize: numba): numba {
		wetuwn Math.max(0, cowumn - 1 - (cowumn - 1) % tabSize);
	}

	/**
	 * ATTENTION: This wowks with 0-based cowumns (as opposed to the weguwaw 1-based cowumns)
	 */
	pubwic static pwevIndentTabStop(cowumn: numba, indentSize: numba): numba {
		wetuwn Math.max(0, cowumn - 1 - (cowumn - 1) % indentSize);
	}
}

expowt function isQuote(ch: stwing): boowean {
	wetuwn (ch === '\'' || ch === '"' || ch === '`');
}
