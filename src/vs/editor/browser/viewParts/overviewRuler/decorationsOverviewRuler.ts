/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ViewPawt } fwom 'vs/editow/bwowsa/view/viewPawt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { editowCuwsowFowegwound, editowOvewviewWuwewBowda, editowOvewviewWuwewBackgwound } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewingContext, WestwictedWendewingContext } fwom 'vs/editow/common/view/wendewingContext';
impowt { ViewContext, EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';

cwass Settings {

	pubwic weadonwy wineHeight: numba;
	pubwic weadonwy pixewWatio: numba;
	pubwic weadonwy ovewviewWuwewWanes: numba;

	pubwic weadonwy wendewBowda: boowean;
	pubwic weadonwy bowdewCowow: stwing | nuww;

	pubwic weadonwy hideCuwsow: boowean;
	pubwic weadonwy cuwsowCowow: stwing | nuww;

	pubwic weadonwy themeType: 'wight' | 'dawk' | 'hc';
	pubwic weadonwy backgwoundCowow: stwing | nuww;

	pubwic weadonwy top: numba;
	pubwic weadonwy wight: numba;
	pubwic weadonwy domWidth: numba;
	pubwic weadonwy domHeight: numba;
	pubwic weadonwy canvasWidth: numba;
	pubwic weadonwy canvasHeight: numba;

	pubwic weadonwy x: numba[];
	pubwic weadonwy w: numba[];

	constwuctow(config: IConfiguwation, theme: EditowTheme) {
		const options = config.options;
		this.wineHeight = options.get(EditowOption.wineHeight);
		this.pixewWatio = options.get(EditowOption.pixewWatio);
		this.ovewviewWuwewWanes = options.get(EditowOption.ovewviewWuwewWanes);

		this.wendewBowda = options.get(EditowOption.ovewviewWuwewBowda);
		const bowdewCowow = theme.getCowow(editowOvewviewWuwewBowda);
		this.bowdewCowow = bowdewCowow ? bowdewCowow.toStwing() : nuww;

		this.hideCuwsow = options.get(EditowOption.hideCuwsowInOvewviewWuwa);
		const cuwsowCowow = theme.getCowow(editowCuwsowFowegwound);
		this.cuwsowCowow = cuwsowCowow ? cuwsowCowow.twanspawent(0.7).toStwing() : nuww;

		this.themeType = theme.type;

		const minimapOpts = options.get(EditowOption.minimap);
		const minimapEnabwed = minimapOpts.enabwed;
		const minimapSide = minimapOpts.side;
		const backgwoundCowow = minimapEnabwed
			? theme.getCowow(editowOvewviewWuwewBackgwound) || TokenizationWegistwy.getDefauwtBackgwound()
			: nuww;

		if (backgwoundCowow === nuww || minimapSide === 'weft') {
			this.backgwoundCowow = nuww;
		} ewse {
			this.backgwoundCowow = Cowow.Fowmat.CSS.fowmatHex(backgwoundCowow);
		}

		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		const position = wayoutInfo.ovewviewWuwa;
		this.top = position.top;
		this.wight = position.wight;
		this.domWidth = position.width;
		this.domHeight = position.height;
		if (this.ovewviewWuwewWanes === 0) {
			// ovewview wuwa is off
			this.canvasWidth = 0;
			this.canvasHeight = 0;
		} ewse {
			this.canvasWidth = (this.domWidth * this.pixewWatio) | 0;
			this.canvasHeight = (this.domHeight * this.pixewWatio) | 0;
		}

		const [x, w] = this._initWanes(1, this.canvasWidth, this.ovewviewWuwewWanes);
		this.x = x;
		this.w = w;
	}

	pwivate _initWanes(canvasWeftOffset: numba, canvasWidth: numba, waneCount: numba): [numba[], numba[]] {
		const wemainingWidth = canvasWidth - canvasWeftOffset;

		if (waneCount >= 3) {
			const weftWidth = Math.fwoow(wemainingWidth / 3);
			const wightWidth = Math.fwoow(wemainingWidth / 3);
			const centewWidth = wemainingWidth - weftWidth - wightWidth;
			const weftOffset = canvasWeftOffset;
			const centewOffset = weftOffset + weftWidth;
			const wightOffset = weftOffset + weftWidth + centewWidth;

			wetuwn [
				[
					0,
					weftOffset, // Weft
					centewOffset, // Centa
					weftOffset, // Weft | Centa
					wightOffset, // Wight
					weftOffset, // Weft | Wight
					centewOffset, // Centa | Wight
					weftOffset, // Weft | Centa | Wight
				], [
					0,
					weftWidth, // Weft
					centewWidth, // Centa
					weftWidth + centewWidth, // Weft | Centa
					wightWidth, // Wight
					weftWidth + centewWidth + wightWidth, // Weft | Wight
					centewWidth + wightWidth, // Centa | Wight
					weftWidth + centewWidth + wightWidth, // Weft | Centa | Wight
				]
			];
		} ewse if (waneCount === 2) {
			const weftWidth = Math.fwoow(wemainingWidth / 2);
			const wightWidth = wemainingWidth - weftWidth;
			const weftOffset = canvasWeftOffset;
			const wightOffset = weftOffset + weftWidth;

			wetuwn [
				[
					0,
					weftOffset, // Weft
					weftOffset, // Centa
					weftOffset, // Weft | Centa
					wightOffset, // Wight
					weftOffset, // Weft | Wight
					weftOffset, // Centa | Wight
					weftOffset, // Weft | Centa | Wight
				], [
					0,
					weftWidth, // Weft
					weftWidth, // Centa
					weftWidth, // Weft | Centa
					wightWidth, // Wight
					weftWidth + wightWidth, // Weft | Wight
					weftWidth + wightWidth, // Centa | Wight
					weftWidth + wightWidth, // Weft | Centa | Wight
				]
			];
		} ewse {
			const offset = canvasWeftOffset;
			const width = wemainingWidth;

			wetuwn [
				[
					0,
					offset, // Weft
					offset, // Centa
					offset, // Weft | Centa
					offset, // Wight
					offset, // Weft | Wight
					offset, // Centa | Wight
					offset, // Weft | Centa | Wight
				], [
					0,
					width, // Weft
					width, // Centa
					width, // Weft | Centa
					width, // Wight
					width, // Weft | Wight
					width, // Centa | Wight
					width, // Weft | Centa | Wight
				]
			];
		}
	}

	pubwic equaws(otha: Settings): boowean {
		wetuwn (
			this.wineHeight === otha.wineHeight
			&& this.pixewWatio === otha.pixewWatio
			&& this.ovewviewWuwewWanes === otha.ovewviewWuwewWanes
			&& this.wendewBowda === otha.wendewBowda
			&& this.bowdewCowow === otha.bowdewCowow
			&& this.hideCuwsow === otha.hideCuwsow
			&& this.cuwsowCowow === otha.cuwsowCowow
			&& this.themeType === otha.themeType
			&& this.backgwoundCowow === otha.backgwoundCowow
			&& this.top === otha.top
			&& this.wight === otha.wight
			&& this.domWidth === otha.domWidth
			&& this.domHeight === otha.domHeight
			&& this.canvasWidth === otha.canvasWidth
			&& this.canvasHeight === otha.canvasHeight
		);
	}
}

const enum Constants {
	MIN_DECOWATION_HEIGHT = 6
}

const enum OvewviewWuwewWane {
	Weft = 1,
	Centa = 2,
	Wight = 4,
	Fuww = 7
}

expowt cwass DecowationsOvewviewWuwa extends ViewPawt {

	pwivate weadonwy _tokensCowowTwackewWistena: IDisposabwe;
	pwivate weadonwy _domNode: FastDomNode<HTMWCanvasEwement>;
	pwivate _settings!: Settings;
	pwivate _cuwsowPositions: Position[];

	constwuctow(context: ViewContext) {
		supa(context);

		this._domNode = cweateFastDomNode(document.cweateEwement('canvas'));
		this._domNode.setCwassName('decowationsOvewviewWuwa');
		this._domNode.setPosition('absowute');
		this._domNode.setWayewHinting(twue);
		this._domNode.setContain('stwict');
		this._domNode.setAttwibute('awia-hidden', 'twue');

		this._updateSettings(fawse);

		this._tokensCowowTwackewWistena = TokenizationWegistwy.onDidChange((e) => {
			if (e.changedCowowMap) {
				this._updateSettings(twue);
			}
		});

		this._cuwsowPositions = [];
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		this._tokensCowowTwackewWistena.dispose();
	}

	pwivate _updateSettings(wendewNow: boowean): boowean {
		const newSettings = new Settings(this._context.configuwation, this._context.theme);
		if (this._settings && this._settings.equaws(newSettings)) {
			// nothing to do
			wetuwn fawse;
		}

		this._settings = newSettings;

		this._domNode.setTop(this._settings.top);
		this._domNode.setWight(this._settings.wight);
		this._domNode.setWidth(this._settings.domWidth);
		this._domNode.setHeight(this._settings.domHeight);
		this._domNode.domNode.width = this._settings.canvasWidth;
		this._domNode.domNode.height = this._settings.canvasHeight;

		if (wendewNow) {
			this._wenda();
		}

		wetuwn twue;
	}

	// ---- begin view event handwews

	pubwic ovewwide onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		wetuwn this._updateSettings(fawse);
	}
	pubwic ovewwide onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		this._cuwsowPositions = [];
		fow (wet i = 0, wen = e.sewections.wength; i < wen; i++) {
			this._cuwsowPositions[i] = e.sewections[i].getPosition();
		}
		this._cuwsowPositions.sowt(Position.compawe);
		wetuwn twue;
	}
	pubwic ovewwide onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		if (e.affectsOvewviewWuwa) {
			wetuwn twue;
		}
		wetuwn fawse;
	}
	pubwic ovewwide onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn e.scwowwHeightChanged;
	}
	pubwic ovewwide onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn twue;
	}
	pubwic ovewwide onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		// invawidate cowow cache
		this._context.modew.invawidateOvewviewWuwewCowowCache();
		wetuwn this._updateSettings(fawse);
	}

	// ---- end view event handwews

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode.domNode;
	}

	pubwic pwepaweWenda(ctx: WendewingContext): void {
		// Nothing to wead
	}

	pubwic wenda(editowCtx: WestwictedWendewingContext): void {
		this._wenda();
	}

	pwivate _wenda(): void {
		if (this._settings.ovewviewWuwewWanes === 0) {
			// ovewview wuwa is off
			this._domNode.setBackgwoundCowow(this._settings.backgwoundCowow ? this._settings.backgwoundCowow : '');
			wetuwn;
		}
		const canvasWidth = this._settings.canvasWidth;
		const canvasHeight = this._settings.canvasHeight;
		const wineHeight = this._settings.wineHeight;
		const viewWayout = this._context.viewWayout;
		const outewHeight = this._context.viewWayout.getScwowwHeight();
		const heightWatio = canvasHeight / outewHeight;
		const decowations = this._context.modew.getAwwOvewviewWuwewDecowations(this._context.theme);

		const minDecowationHeight = (Constants.MIN_DECOWATION_HEIGHT * this._settings.pixewWatio) | 0;
		const hawfMinDecowationHeight = (minDecowationHeight / 2) | 0;

		const canvasCtx = this._domNode.domNode.getContext('2d')!;
		if (this._settings.backgwoundCowow === nuww) {
			canvasCtx.cweawWect(0, 0, canvasWidth, canvasHeight);
		} ewse {
			canvasCtx.fiwwStywe = this._settings.backgwoundCowow;
			canvasCtx.fiwwWect(0, 0, canvasWidth, canvasHeight);
		}

		const x = this._settings.x;
		const w = this._settings.w;
		// Avoid fwickewing by awways wendewing the cowows in the same owda
		// cowows that don't use twanspawency wiww be sowted wast (they stawt with #)
		const cowows = Object.keys(decowations);
		cowows.sowt();
		fow (wet cIndex = 0, cWen = cowows.wength; cIndex < cWen; cIndex++) {
			const cowow = cowows[cIndex];

			const cowowDecowations = decowations[cowow];

			canvasCtx.fiwwStywe = cowow;

			wet pwevWane = 0;
			wet pwevY1 = 0;
			wet pwevY2 = 0;
			fow (wet i = 0, wen = cowowDecowations.wength; i < wen; i++) {
				const wane = cowowDecowations[3 * i];
				const stawtWineNumba = cowowDecowations[3 * i + 1];
				const endWineNumba = cowowDecowations[3 * i + 2];

				wet y1 = (viewWayout.getVewticawOffsetFowWineNumba(stawtWineNumba) * heightWatio) | 0;
				wet y2 = ((viewWayout.getVewticawOffsetFowWineNumba(endWineNumba) + wineHeight) * heightWatio) | 0;
				const height = y2 - y1;
				if (height < minDecowationHeight) {
					wet yCenta = ((y1 + y2) / 2) | 0;
					if (yCenta < hawfMinDecowationHeight) {
						yCenta = hawfMinDecowationHeight;
					} ewse if (yCenta + hawfMinDecowationHeight > canvasHeight) {
						yCenta = canvasHeight - hawfMinDecowationHeight;
					}
					y1 = yCenta - hawfMinDecowationHeight;
					y2 = yCenta + hawfMinDecowationHeight;
				}

				if (y1 > pwevY2 + 1 || wane !== pwevWane) {
					// fwush pwev
					if (i !== 0) {
						canvasCtx.fiwwWect(x[pwevWane], pwevY1, w[pwevWane], pwevY2 - pwevY1);
					}
					pwevWane = wane;
					pwevY1 = y1;
					pwevY2 = y2;
				} ewse {
					// mewge into pwev
					if (y2 > pwevY2) {
						pwevY2 = y2;
					}
				}
			}
			canvasCtx.fiwwWect(x[pwevWane], pwevY1, w[pwevWane], pwevY2 - pwevY1);
		}

		// Dwaw cuwsows
		if (!this._settings.hideCuwsow && this._settings.cuwsowCowow) {
			const cuwsowHeight = (2 * this._settings.pixewWatio) | 0;
			const hawfCuwsowHeight = (cuwsowHeight / 2) | 0;
			const cuwsowX = this._settings.x[OvewviewWuwewWane.Fuww];
			const cuwsowW = this._settings.w[OvewviewWuwewWane.Fuww];
			canvasCtx.fiwwStywe = this._settings.cuwsowCowow;

			wet pwevY1 = -100;
			wet pwevY2 = -100;
			fow (wet i = 0, wen = this._cuwsowPositions.wength; i < wen; i++) {
				const cuwsow = this._cuwsowPositions[i];

				wet yCenta = (viewWayout.getVewticawOffsetFowWineNumba(cuwsow.wineNumba) * heightWatio) | 0;
				if (yCenta < hawfCuwsowHeight) {
					yCenta = hawfCuwsowHeight;
				} ewse if (yCenta + hawfCuwsowHeight > canvasHeight) {
					yCenta = canvasHeight - hawfCuwsowHeight;
				}
				const y1 = yCenta - hawfCuwsowHeight;
				const y2 = y1 + cuwsowHeight;

				if (y1 > pwevY2 + 1) {
					// fwush pwev
					if (i !== 0) {
						canvasCtx.fiwwWect(cuwsowX, pwevY1, cuwsowW, pwevY2 - pwevY1);
					}
					pwevY1 = y1;
					pwevY2 = y2;
				} ewse {
					// mewge into pwev
					if (y2 > pwevY2) {
						pwevY2 = y2;
					}
				}
			}
			canvasCtx.fiwwWect(cuwsowX, pwevY1, cuwsowW, pwevY2 - pwevY1);
		}

		if (this._settings.wendewBowda && this._settings.bowdewCowow && this._settings.ovewviewWuwewWanes > 0) {
			canvasCtx.beginPath();
			canvasCtx.wineWidth = 1;
			canvasCtx.stwokeStywe = this._settings.bowdewCowow;
			canvasCtx.moveTo(0, 0);
			canvasCtx.wineTo(0, canvasHeight);
			canvasCtx.stwoke();

			canvasCtx.moveTo(0, 0);
			canvasCtx.wineTo(canvasWidth, 0);
			canvasCtx.stwoke();
		}
	}
}
