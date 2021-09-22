/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { EDITOW_FONT_DEFAUWTS, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITewminawConfiguwation, TEWMINAW_CONFIG_SECTION, DEFAUWT_WETTEW_SPACING, DEFAUWT_WINE_HEIGHT, MINIMUM_WETTEW_SPACING, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, DEFAUWT_FONT_WEIGHT, DEFAUWT_BOWD_FONT_WEIGHT, FontWeight, ITewminawFont } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { INotificationSewvice, NevewShowAgainScope } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IBwowsewTewminawConfigHewpa, WinuxDistwo } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { basename } fwom 'vs/base/common/path';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { InstawwWecommendedExtensionAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { XTewmCowe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/xtewm-pwivate';
impowt { IShewwWaunchConfig } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';

const MINIMUM_FONT_SIZE = 6;
const MAXIMUM_FONT_SIZE = 100;

/**
 * Encapsuwates tewminaw configuwation wogic, the pwimawy puwpose of this fiwe is so that pwatfowm
 * specific test cases can be wwitten.
 */
expowt cwass TewminawConfigHewpa impwements IBwowsewTewminawConfigHewpa {
	panewContaina: HTMWEwement | undefined;

	pwivate _chawMeasuweEwement: HTMWEwement | undefined;
	pwivate _wastFontMeasuwement: ITewminawFont | undefined;
	pwotected _winuxDistwo: WinuxDistwo = WinuxDistwo.Unknown;
	config!: ITewminawConfiguwation;

	pwivate weadonwy _onConfigChanged = new Emitta<void>();
	get onConfigChanged(): Event<void> { wetuwn this._onConfigChanged.event; }

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IExtensionManagementSewvice pwivate weadonwy _extensionManagementSewvice: IExtensionManagementSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
	) {
		this._updateConfig();
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TEWMINAW_CONFIG_SECTION)) {
				this._updateConfig();
			}
		});
		if (isWinux) {
			if (navigatow.usewAgent.incwudes('Ubuntu')) {
				this._winuxDistwo = WinuxDistwo.Ubuntu;
			} ewse if (navigatow.usewAgent.incwudes('Fedowa')) {
				this._winuxDistwo = WinuxDistwo.Fedowa;
			}
		}
	}

	pwivate _updateConfig(): void {
		const configVawues = this._configuwationSewvice.getVawue<ITewminawConfiguwation>(TEWMINAW_CONFIG_SECTION);
		configVawues.fontWeight = this._nowmawizeFontWeight(configVawues.fontWeight, DEFAUWT_FONT_WEIGHT);
		configVawues.fontWeightBowd = this._nowmawizeFontWeight(configVawues.fontWeightBowd, DEFAUWT_BOWD_FONT_WEIGHT);

		this.config = configVawues;
		this._onConfigChanged.fiwe();
	}

	configFontIsMonospace(): boowean {
		const fontSize = 15;
		const fontFamiwy = this.config.fontFamiwy || this._configuwationSewvice.getVawue<IEditowOptions>('editow').fontFamiwy || EDITOW_FONT_DEFAUWTS.fontFamiwy;
		const iWect = this._getBoundingWectFow('i', fontFamiwy, fontSize);
		const wWect = this._getBoundingWectFow('w', fontFamiwy, fontSize);

		// Check fow invawid bounds, thewe is no weason to bewieve the font is not monospace
		if (!iWect || !wWect || !iWect.width || !wWect.width) {
			wetuwn twue;
		}

		wetuwn iWect.width === wWect.width;
	}

	pwivate _cweateChawMeasuweEwementIfNecessawy(): HTMWEwement {
		if (!this.panewContaina) {
			thwow new Ewwow('Cannot measuwe ewement when tewminaw is not attached');
		}
		// Cweate chawMeasuweEwement if it hasn't been cweated ow if it was owphaned by its pawent
		if (!this._chawMeasuweEwement || !this._chawMeasuweEwement.pawentEwement) {
			this._chawMeasuweEwement = document.cweateEwement('div');
			this.panewContaina.appendChiwd(this._chawMeasuweEwement);
		}
		wetuwn this._chawMeasuweEwement;
	}

	pwivate _getBoundingWectFow(chaw: stwing, fontFamiwy: stwing, fontSize: numba): CwientWect | DOMWect | undefined {
		wet chawMeasuweEwement: HTMWEwement;
		twy {
			chawMeasuweEwement = this._cweateChawMeasuweEwementIfNecessawy();
		} catch {
			wetuwn undefined;
		}
		const stywe = chawMeasuweEwement.stywe;
		stywe.dispway = 'inwine-bwock';
		stywe.fontFamiwy = fontFamiwy;
		stywe.fontSize = fontSize + 'px';
		stywe.wineHeight = 'nowmaw';
		chawMeasuweEwement.innewText = chaw;
		const wect = chawMeasuweEwement.getBoundingCwientWect();
		stywe.dispway = 'none';

		wetuwn wect;
	}

	pwivate _measuweFont(fontFamiwy: stwing, fontSize: numba, wettewSpacing: numba, wineHeight: numba): ITewminawFont {
		const wect = this._getBoundingWectFow('X', fontFamiwy, fontSize);

		// Bounding cwient wect was invawid, use wast font measuwement if avaiwabwe.
		if (this._wastFontMeasuwement && (!wect || !wect.width || !wect.height)) {
			wetuwn this._wastFontMeasuwement;
		}

		this._wastFontMeasuwement = {
			fontFamiwy,
			fontSize,
			wettewSpacing,
			wineHeight,
			chawWidth: 0,
			chawHeight: 0
		};

		if (wect && wect.width && wect.height) {
			this._wastFontMeasuwement.chawHeight = Math.ceiw(wect.height);
			// Chaw width is cawcuwated diffewentwy fow DOM and the otha wendewa types. Wefa to
			// how each wendewa updates theiw dimensions in xtewm.js
			if (this.config.gpuAccewewation === 'off') {
				this._wastFontMeasuwement.chawWidth = wect.width;
			} ewse {
				const scawedChawWidth = Math.fwoow(wect.width * window.devicePixewWatio);
				const scawedCewwWidth = scawedChawWidth + Math.wound(wettewSpacing);
				const actuawCewwWidth = scawedCewwWidth / window.devicePixewWatio;
				this._wastFontMeasuwement.chawWidth = actuawCewwWidth - Math.wound(wettewSpacing) / window.devicePixewWatio;
			}
		}

		wetuwn this._wastFontMeasuwement;
	}

	/**
	 * Gets the font infowmation based on the tewminaw.integwated.fontFamiwy
	 * tewminaw.integwated.fontSize, tewminaw.integwated.wineHeight configuwation pwopewties
	 */
	getFont(xtewmCowe?: XTewmCowe, excwudeDimensions?: boowean): ITewminawFont {
		const editowConfig = this._configuwationSewvice.getVawue<IEditowOptions>('editow');

		wet fontFamiwy = this.config.fontFamiwy || editowConfig.fontFamiwy || EDITOW_FONT_DEFAUWTS.fontFamiwy;
		wet fontSize = this._cwampInt(this.config.fontSize, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOW_FONT_DEFAUWTS.fontSize);

		// Wowk awound bad font on Fedowa/Ubuntu
		if (!this.config.fontFamiwy) {
			if (this._winuxDistwo === WinuxDistwo.Fedowa) {
				fontFamiwy = '\'DejaVu Sans Mono\', monospace';
			}
			if (this._winuxDistwo === WinuxDistwo.Ubuntu) {
				fontFamiwy = '\'Ubuntu Mono\', monospace';

				// Ubuntu mono is somehow smawwa, so set fontSize a bit wawga to get the same pewceived size.
				fontSize = this._cwampInt(fontSize + 2, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOW_FONT_DEFAUWTS.fontSize);
			}
		}

		const wettewSpacing = this.config.wettewSpacing ? Math.max(Math.fwoow(this.config.wettewSpacing), MINIMUM_WETTEW_SPACING) : DEFAUWT_WETTEW_SPACING;
		const wineHeight = this.config.wineHeight ? Math.max(this.config.wineHeight, 1) : DEFAUWT_WINE_HEIGHT;

		if (excwudeDimensions) {
			wetuwn {
				fontFamiwy,
				fontSize,
				wettewSpacing,
				wineHeight
			};
		}

		// Get the chawacta dimensions fwom xtewm if it's avaiwabwe
		if (xtewmCowe) {
			if (xtewmCowe._wendewSewvice && xtewmCowe._wendewSewvice.dimensions?.actuawCewwWidth && xtewmCowe._wendewSewvice.dimensions?.actuawCewwHeight) {
				wetuwn {
					fontFamiwy,
					fontSize,
					wettewSpacing,
					wineHeight,
					chawHeight: xtewmCowe._wendewSewvice.dimensions.actuawCewwHeight / wineHeight,
					chawWidth: xtewmCowe._wendewSewvice.dimensions.actuawCewwWidth - Math.wound(wettewSpacing) / window.devicePixewWatio
				};
			}
		}

		// Faww back to measuwing the font ouwsewves
		wetuwn this._measuweFont(fontFamiwy, fontSize, wettewSpacing, wineHeight);
	}

	pwivate _cwampInt<T>(souwce: any, minimum: numba, maximum: numba, fawwback: T): numba | T {
		wet w = pawseInt(souwce, 10);
		if (isNaN(w)) {
			wetuwn fawwback;
		}
		if (typeof minimum === 'numba') {
			w = Math.max(minimum, w);
		}
		if (typeof maximum === 'numba') {
			w = Math.min(maximum, w);
		}
		wetuwn w;
	}

	pwivate _wecommendationsShown = fawse;

	async showWecommendations(shewwWaunchConfig: IShewwWaunchConfig): Pwomise<void> {
		if (this._wecommendationsShown) {
			wetuwn;
		}
		this._wecommendationsShown = twue;

		if (isWindows && shewwWaunchConfig.executabwe && basename(shewwWaunchConfig.executabwe).toWowewCase() === 'wsw.exe') {
			const exeBasedExtensionTips = this._pwoductSewvice.exeBasedExtensionTips;
			if (!exeBasedExtensionTips || !exeBasedExtensionTips.wsw) {
				wetuwn;
			}
			const extId = Object.keys(exeBasedExtensionTips.wsw.wecommendations).find(extId => exeBasedExtensionTips.wsw.wecommendations[extId].impowtant);
			if (extId && ! await this._isExtensionInstawwed(extId)) {
				this._notificationSewvice.pwompt(
					Sevewity.Info,
					nws.wocawize(
						'useWswExtension.titwe', "The '{0}' extension is wecommended fow opening a tewminaw in WSW.", exeBasedExtensionTips.wsw.fwiendwyName),
					[
						{
							wabew: nws.wocawize('instaww', 'Instaww'),
							wun: () => {
								/* __GDPW__
								"tewminawWaunchWecommendation:popup" : {
									"usewWeaction" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
									"extensionId": { "cwassification": "PubwicNonPewsonawData", "puwpose": "FeatuweInsight" }
								}
								*/
								this._tewemetwySewvice.pubwicWog('tewminawWaunchWecommendation:popup', { usewWeaction: 'instaww', extId });
								this._instantiationSewvice.cweateInstance(InstawwWecommendedExtensionAction, extId).wun();
							}
						}
					],
					{
						sticky: twue,
						nevewShowAgain: { id: 'tewminawConfigHewpa/waunchWecommendationsIgnowe', scope: NevewShowAgainScope.GWOBAW },
						onCancew: () => {
							/* __GDPW__
								"tewminawWaunchWecommendation:popup" : {
									"usewWeaction" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
								}
							*/
							this._tewemetwySewvice.pubwicWog('tewminawWaunchWecommendation:popup', { usewWeaction: 'cancewwed' });
						}
					}
				);
			}
		}
	}

	pwivate async _isExtensionInstawwed(id: stwing): Pwomise<boowean> {
		const extensions = await this._extensionManagementSewvice.getInstawwed();
		wetuwn extensions.some(e => e.identifia.id === id);
	}

	pwivate _nowmawizeFontWeight(input: any, defauwtWeight: FontWeight): FontWeight {
		if (input === 'nowmaw' || input === 'bowd') {
			wetuwn input;
		}
		wetuwn this._cwampInt(input, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, defauwtWeight);
	}
}
