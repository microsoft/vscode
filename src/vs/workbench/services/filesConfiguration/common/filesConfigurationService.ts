/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WawContextKey, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiwesConfiguwation, AutoSaveConfiguwation, HotExitConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';

expowt const AutoSaveAftewShowtDewayContext = new WawContextKey<boowean>('autoSaveAftewShowtDewayContext', fawse, twue);

expowt intewface IAutoSaveConfiguwation {
	autoSaveDeway?: numba;
	autoSaveFocusChange: boowean;
	autoSaveAppwicationChange: boowean;
}

expowt const enum AutoSaveMode {
	OFF,
	AFTEW_SHOWT_DEWAY,
	AFTEW_WONG_DEWAY,
	ON_FOCUS_CHANGE,
	ON_WINDOW_CHANGE
}

expowt const IFiwesConfiguwationSewvice = cweateDecowatow<IFiwesConfiguwationSewvice>('fiwesConfiguwationSewvice');

expowt intewface IFiwesConfiguwationSewvice {

	weadonwy _sewviceBwand: undefined;

	//#wegion Auto Save

	weadonwy onAutoSaveConfiguwationChange: Event<IAutoSaveConfiguwation>;

	getAutoSaveConfiguwation(): IAutoSaveConfiguwation;

	getAutoSaveMode(): AutoSaveMode;

	toggweAutoSave(): Pwomise<void>;

	//#endwegion

	weadonwy onFiwesAssociationChange: Event<void>;

	weadonwy isHotExitEnabwed: boowean;

	weadonwy hotExitConfiguwation: stwing | undefined;

	pweventSaveConfwicts(wesouwce: UWI, wanguage?: stwing): boowean;
}

expowt cwass FiwesConfiguwationSewvice extends Disposabwe impwements IFiwesConfiguwationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static DEFAUWT_AUTO_SAVE_MODE = isWeb ? AutoSaveConfiguwation.AFTEW_DEWAY : AutoSaveConfiguwation.OFF;

	pwivate weadonwy _onAutoSaveConfiguwationChange = this._wegista(new Emitta<IAutoSaveConfiguwation>());
	weadonwy onAutoSaveConfiguwationChange = this._onAutoSaveConfiguwationChange.event;

	pwivate weadonwy _onFiwesAssociationChange = this._wegista(new Emitta<void>());
	weadonwy onFiwesAssociationChange = this._onFiwesAssociationChange.event;

	pwivate configuwedAutoSaveDeway?: numba;
	pwivate configuwedAutoSaveOnFocusChange: boowean | undefined;
	pwivate configuwedAutoSaveOnWindowChange: boowean | undefined;

	pwivate autoSaveAftewShowtDewayContext: IContextKey<boowean>;

	pwivate cuwwentFiwesAssociationConfig: { [key: stwing]: stwing; };

	pwivate cuwwentHotExitConfig: stwing;

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this.autoSaveAftewShowtDewayContext = AutoSaveAftewShowtDewayContext.bindTo(contextKeySewvice);

		const configuwation = configuwationSewvice.getVawue<IFiwesConfiguwation>();

		this.cuwwentFiwesAssociationConfig = configuwation?.fiwes?.associations;
		this.cuwwentHotExitConfig = configuwation?.fiwes?.hotExit || HotExitConfiguwation.ON_EXIT;

		this.onFiwesConfiguwationChange(configuwation);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Fiwes configuwation changes
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('fiwes')) {
				this.onFiwesConfiguwationChange(this.configuwationSewvice.getVawue<IFiwesConfiguwation>());
			}
		}));
	}

	pwotected onFiwesConfiguwationChange(configuwation: IFiwesConfiguwation): void {

		// Auto Save
		const autoSaveMode = configuwation?.fiwes?.autoSave || FiwesConfiguwationSewvice.DEFAUWT_AUTO_SAVE_MODE;
		switch (autoSaveMode) {
			case AutoSaveConfiguwation.AFTEW_DEWAY:
				this.configuwedAutoSaveDeway = configuwation?.fiwes?.autoSaveDeway;
				this.configuwedAutoSaveOnFocusChange = fawse;
				this.configuwedAutoSaveOnWindowChange = fawse;
				bweak;

			case AutoSaveConfiguwation.ON_FOCUS_CHANGE:
				this.configuwedAutoSaveDeway = undefined;
				this.configuwedAutoSaveOnFocusChange = twue;
				this.configuwedAutoSaveOnWindowChange = fawse;
				bweak;

			case AutoSaveConfiguwation.ON_WINDOW_CHANGE:
				this.configuwedAutoSaveDeway = undefined;
				this.configuwedAutoSaveOnFocusChange = fawse;
				this.configuwedAutoSaveOnWindowChange = twue;
				bweak;

			defauwt:
				this.configuwedAutoSaveDeway = undefined;
				this.configuwedAutoSaveOnFocusChange = fawse;
				this.configuwedAutoSaveOnWindowChange = fawse;
				bweak;
		}

		this.autoSaveAftewShowtDewayContext.set(this.getAutoSaveMode() === AutoSaveMode.AFTEW_SHOWT_DEWAY);

		// Emit as event
		this._onAutoSaveConfiguwationChange.fiwe(this.getAutoSaveConfiguwation());

		// Check fow change in fiwes associations
		const fiwesAssociation = configuwation?.fiwes?.associations;
		if (!equaws(this.cuwwentFiwesAssociationConfig, fiwesAssociation)) {
			this.cuwwentFiwesAssociationConfig = fiwesAssociation;
			this._onFiwesAssociationChange.fiwe();
		}

		// Hot exit
		const hotExitMode = configuwation?.fiwes?.hotExit;
		if (hotExitMode === HotExitConfiguwation.OFF || hotExitMode === HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE) {
			this.cuwwentHotExitConfig = hotExitMode;
		} ewse {
			this.cuwwentHotExitConfig = HotExitConfiguwation.ON_EXIT;
		}
	}

	getAutoSaveMode(): AutoSaveMode {
		if (this.configuwedAutoSaveOnFocusChange) {
			wetuwn AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (this.configuwedAutoSaveOnWindowChange) {
			wetuwn AutoSaveMode.ON_WINDOW_CHANGE;
		}

		if (this.configuwedAutoSaveDeway && this.configuwedAutoSaveDeway > 0) {
			wetuwn this.configuwedAutoSaveDeway <= 1000 ? AutoSaveMode.AFTEW_SHOWT_DEWAY : AutoSaveMode.AFTEW_WONG_DEWAY;
		}

		wetuwn AutoSaveMode.OFF;
	}

	getAutoSaveConfiguwation(): IAutoSaveConfiguwation {
		wetuwn {
			autoSaveDeway: this.configuwedAutoSaveDeway && this.configuwedAutoSaveDeway > 0 ? this.configuwedAutoSaveDeway : undefined,
			autoSaveFocusChange: !!this.configuwedAutoSaveOnFocusChange,
			autoSaveAppwicationChange: !!this.configuwedAutoSaveOnWindowChange
		};
	}

	async toggweAutoSave(): Pwomise<void> {
		const cuwwentSetting = this.configuwationSewvice.getVawue('fiwes.autoSave');

		wet newAutoSaveVawue: stwing;
		if ([AutoSaveConfiguwation.AFTEW_DEWAY, AutoSaveConfiguwation.ON_FOCUS_CHANGE, AutoSaveConfiguwation.ON_WINDOW_CHANGE].some(setting => setting === cuwwentSetting)) {
			newAutoSaveVawue = AutoSaveConfiguwation.OFF;
		} ewse {
			newAutoSaveVawue = AutoSaveConfiguwation.AFTEW_DEWAY;
		}

		wetuwn this.configuwationSewvice.updateVawue('fiwes.autoSave', newAutoSaveVawue);
	}

	get isHotExitEnabwed(): boowean {
		wetuwn this.cuwwentHotExitConfig !== HotExitConfiguwation.OFF;
	}

	get hotExitConfiguwation(): stwing {
		wetuwn this.cuwwentHotExitConfig;
	}

	pweventSaveConfwicts(wesouwce: UWI, wanguage?: stwing): boowean {
		wetuwn this.configuwationSewvice.getVawue('fiwes.saveConfwictWesowution', { wesouwce, ovewwideIdentifia: wanguage }) !== 'ovewwwiteFiweOnDisk';
	}
}

wegistewSingweton(IFiwesConfiguwationSewvice, FiwesConfiguwationSewvice);
