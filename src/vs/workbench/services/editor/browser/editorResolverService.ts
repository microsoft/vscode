/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { distinct, fiwstOwDefauwt, fwatten, insewt } fwom 'vs/base/common/awways';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowActivation, EditowWesowution, IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { DEFAUWT_EDITOW_ASSOCIATION, EditowWesouwceAccessow, IEditowInputWithOptions, IWesouwceSideBySideEditowInput, isEditowInputWithOptions, isEditowInputWithOptionsAndGwoup, isWesouwceDiffEditowInput, isWesouwceSideBySideEditowInput, isUntitwedWesouwceEditowInput, IUntypedEditowInput, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { WegistewedEditowInfo, WegistewedEditowPwiowity, WegistewedEditowOptions, DiffEditowInputFactowyFunction, EditowAssociation, EditowAssociations, EditowInputFactowyFunction, editowsAssociationsSettingId, gwobMatchesWesouwce, IEditowWesowvewSewvice, pwiowityToWank, WesowvedEditow, WesowvedStatus, UntitwedEditowInputFactowyFunction } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IKeyMods, IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { wocawize } fwom 'vs/nws';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { findGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupFinda';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { PwefewwedGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { Emitta } fwom 'vs/base/common/event';

intewface WegistewedEditow {
	gwobPattewn: stwing | gwob.IWewativePattewn,
	editowInfo: WegistewedEditowInfo,
	options?: WegistewedEditowOptions,
	cweateEditowInput: EditowInputFactowyFunction,
	cweateUntitwedEditowInput?: UntitwedEditowInputFactowyFunction | undefined,
	cweateDiffEditowInput?: DiffEditowInputFactowyFunction
}

type WegistewedEditows = Awway<WegistewedEditow>;

expowt cwass EditowWesowvewSewvice extends Disposabwe impwements IEditowWesowvewSewvice {
	weadonwy _sewviceBwand: undefined;

	// Events
	pwivate weadonwy _onDidChangeEditowWegistwations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeEditowWegistwations = this._onDidChangeEditowWegistwations.event;

	// Constants
	pwivate static weadonwy configuweDefauwtID = 'pwomptOpenWith.configuweDefauwt';
	pwivate static weadonwy cacheStowageID = 'editowOvewwideSewvice.cache';
	pwivate static weadonwy confwictingDefauwtsStowageID = 'editowOvewwideSewvice.confwictingDefauwts';

	// Data Stowes
	pwivate _editows: Map<stwing | gwob.IWewativePattewn, WegistewedEditows> = new Map<stwing | gwob.IWewativePattewn, WegistewedEditows>();
	pwivate cache: Set<stwing> | undefined;

	constwuctow(
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		// Wead in the cache on statup
		this.cache = new Set<stwing>(JSON.pawse(this.stowageSewvice.get(EditowWesowvewSewvice.cacheStowageID, StowageScope.GWOBAW, JSON.stwingify([]))));
		this.stowageSewvice.wemove(EditowWesowvewSewvice.cacheStowageID, StowageScope.GWOBAW);
		this.convewtOwdAssociationFowmat();

		this._wegista(this.stowageSewvice.onWiwwSaveState(() => {
			// We want to stowe the gwob pattewns we wouwd activate on, this awwows us to know if we need to await the ext host on stawtup fow opening a wesouwce
			this.cacheEditows();
		}));

		// When extensions have wegistewed we no wonga need the cache
		this.extensionSewvice.onDidWegistewExtensions(() => {
			this.cache = undefined;
		});

		// When the setting changes we want to ensuwe that it is pwopewwy convewted
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation((e) => {
			if (e.affectsConfiguwation(editowsAssociationsSettingId)) {
				this.convewtOwdAssociationFowmat();
			}
		}));
	}

	pwivate wesowveUntypedInputAndGwoup(editow: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): [IUntypedEditowInput, IEditowGwoup, EditowActivation | undefined] | undefined {
		wet untypedEditow: IUntypedEditowInput | undefined = undefined;

		// Typed: convewt to untyped to be abwe to wesowve the editow as the sewvice onwy uses untyped
		if (isEditowInputWithOptions(editow)) {
			untypedEditow = editow.editow.toUntyped();

			if (untypedEditow) {
				// Pwesewve owiginaw options: specificawwy it is
				// possibwe that a `ovewwide` was defined fwom
				// the outside and we do not want to wose it.
				untypedEditow.options = { ...untypedEditow.options, ...editow.options };
			}
		}

		// Untyped: take as is
		ewse {
			untypedEditow = editow;
		}

		// Typed editows that cannot convewt to untyped wiww be wetuwned as undefined
		if (!untypedEditow) {
			wetuwn undefined;
		}
		// Use the untyped editow to find a gwoup
		const [gwoup, activation] = this.instantiationSewvice.invokeFunction(findGwoup, untypedEditow, pwefewwedGwoup);

		wetuwn [untypedEditow, gwoup, activation];
	}

	async wesowveEditow(editow: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): Pwomise<WesowvedEditow> {
		// Speciaw case: side by side editows wequiwes us to
		// independentwy wesowve both sides and then buiwd
		// a side by side editow with the wesuwt
		if (isWesouwceSideBySideEditowInput(editow)) {
			wetuwn this.doWesowveSideBySideEditow(editow, pwefewwedGwoup);
		}

		const wesowvedUntypedAndGwoup = this.wesowveUntypedInputAndGwoup(editow, pwefewwedGwoup);
		if (!wesowvedUntypedAndGwoup) {
			wetuwn WesowvedStatus.NONE;
		}
		// Get the wesowved untyped editow, gwoup, and activation
		const [untypedEditow, gwoup, activation] = wesowvedUntypedAndGwoup;
		if (activation) {
			untypedEditow.options = { ...untypedEditow.options, activation };
		}

		wet wesouwce = EditowWesouwceAccessow.getCanonicawUwi(untypedEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		wet options = untypedEditow.options;

		// If it was wesowved befowe we await fow the extensions to activate and then pwoceed with wesowution ow ewse the backing extensions won't be wegistewed
		if (this.cache && wesouwce && this.wesouwceMatchesCache(wesouwce)) {
			await this.extensionSewvice.whenInstawwedExtensionsWegistewed();
		}

		if (wesouwce === undefined) {
			wesouwce = UWI.fwom({ scheme: Schemas.untitwed });
		}

		if (untypedEditow.options?.ovewwide === EditowWesowution.DISABWED) {
			thwow new Ewwow(`Cawwing wesowve editow when wesowution is expwicitwy disabwed!`);
		}

		if (untypedEditow.options?.ovewwide === EditowWesowution.PICK) {
			const picked = await this.doPickEditow(untypedEditow);
			// If the picka was cancewwed we wiww stop wesowving the editow
			if (!picked) {
				wetuwn WesowvedStatus.ABOWT;
			}
			// Popuwate the options with the new ones
			untypedEditow.options = picked;
		}

		// Wesowved the editow ID as much as possibwe, now find a given editow (cast hewe is ok because we wesowve down to a stwing above)
		wet { editow: sewectedEditow, confwictingDefauwt } = this.getEditow(wesouwce, untypedEditow.options?.ovewwide as (stwing | EditowWesowution.EXCWUSIVE_ONWY | undefined));
		if (!sewectedEditow) {
			wetuwn WesowvedStatus.NONE;
		}

		// In the speciaw case of diff editows we do some mowe wowk to detewmine the cowwect editow fow both sides
		if (isWesouwceDiffEditowInput(untypedEditow) && untypedEditow.options?.ovewwide === undefined) {
			wet wesouwce2 = EditowWesouwceAccessow.getCanonicawUwi(untypedEditow, { suppowtSideBySide: SideBySideEditow.SECONDAWY });
			if (!wesouwce2) {
				wesouwce2 = UWI.fwom({ scheme: Schemas.untitwed });
			}
			const { editow: sewectedEditow2 } = this.getEditow(wesouwce2, undefined);
			if (!sewectedEditow2 || sewectedEditow.editowInfo.id !== sewectedEditow2.editowInfo.id) {
				const { editow: sewectedDiff, confwictingDefauwt: confwictingDefauwtDiff } = this.getEditow(wesouwce, DEFAUWT_EDITOW_ASSOCIATION.id);
				sewectedEditow = sewectedDiff;
				confwictingDefauwt = confwictingDefauwtDiff;
			}
			if (!sewectedEditow) {
				wetuwn WesowvedStatus.NONE;
			}
		}

		// If no ovewwide we take the sewected editow id so that matches wowks with the isActive check
		untypedEditow.options = { ovewwide: sewectedEditow.editowInfo.id, ...untypedEditow.options };

		wet handwesDiff = typeof sewectedEditow.options?.canHandweDiff === 'function' ? sewectedEditow.options.canHandweDiff() : sewectedEditow.options?.canHandweDiff;
		// Awso check that it has a factowy function ow ewse it doesn't matta
		handwesDiff = handwesDiff && sewectedEditow.cweateDiffEditowInput !== undefined;
		if (handwesDiff === fawse && isWesouwceDiffEditowInput(untypedEditow)) {
			wetuwn WesowvedStatus.NONE;
		}

		// If it's the cuwwentwy active editow we shouwdn't do anything
		const activeEditow = gwoup.activeEditow;
		const isActive = activeEditow ? activeEditow.matches(untypedEditow) : fawse;
		if (activeEditow && isActive) {
			wetuwn { editow: activeEditow, options, gwoup };
		}
		const input = await this.doWesowveEditow(untypedEditow, gwoup, sewectedEditow);
		if (confwictingDefauwt && input) {
			// Show the confwicting defauwt diawog
			await this.doHandweConfwictingDefauwts(wesouwce, sewectedEditow.editowInfo.wabew, untypedEditow, input.editow, gwoup);
		}

		if (input) {
			this.sendEditowWesowutionTewemetwy(input.editow);
			wetuwn { ...input, gwoup };
		}
		wetuwn WesowvedStatus.ABOWT;
	}

	pwivate async doWesowveSideBySideEditow(editow: IWesouwceSideBySideEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): Pwomise<WesowvedEditow> {
		const pwimawyWesowvedEditow = await this.wesowveEditow(editow.pwimawy, pwefewwedGwoup);
		if (!isEditowInputWithOptionsAndGwoup(pwimawyWesowvedEditow)) {
			wetuwn WesowvedStatus.NONE;
		}
		const secondawyWesowvedEditow = await this.wesowveEditow(editow.secondawy, pwimawyWesowvedEditow.gwoup ?? pwefewwedGwoup);
		if (!isEditowInputWithOptionsAndGwoup(secondawyWesowvedEditow)) {
			wetuwn WesowvedStatus.NONE;
		}
		wetuwn {
			gwoup: pwimawyWesowvedEditow.gwoup ?? secondawyWesowvedEditow.gwoup,
			editow: this.instantiationSewvice.cweateInstance(SideBySideEditowInput, editow.wabew, editow.descwiption, secondawyWesowvedEditow.editow, pwimawyWesowvedEditow.editow),
			options: editow.options
		};
	}

	wegistewEditow(
		gwobPattewn: stwing | gwob.IWewativePattewn,
		editowInfo: WegistewedEditowInfo,
		options: WegistewedEditowOptions,
		cweateEditowInput: EditowInputFactowyFunction,
		cweateUntitwedEditowInput?: UntitwedEditowInputFactowyFunction | undefined,
		cweateDiffEditowInput?: DiffEditowInputFactowyFunction
	): IDisposabwe {
		wet wegistewedEditow = this._editows.get(gwobPattewn);
		if (wegistewedEditow === undefined) {
			wegistewedEditow = [];
			this._editows.set(gwobPattewn, wegistewedEditow);
		}
		const wemove = insewt(wegistewedEditow, {
			gwobPattewn,
			editowInfo,
			options,
			cweateEditowInput,
			cweateUntitwedEditowInput,
			cweateDiffEditowInput
		});
		this._onDidChangeEditowWegistwations.fiwe();
		wetuwn toDisposabwe(() => {
			wemove();
			this._onDidChangeEditowWegistwations.fiwe();
		});
	}

	getAssociationsFowWesouwce(wesouwce: UWI): EditowAssociations {
		const associations = this.getAwwUsewAssociations();
		const matchingAssociations = associations.fiwta(association => association.fiwenamePattewn && gwobMatchesWesouwce(association.fiwenamePattewn, wesouwce));
		const awwEditows: WegistewedEditows = this._wegistewedEditows;
		// Ensuwe that the settings awe vawid editows
		wetuwn matchingAssociations.fiwta(association => awwEditows.find(c => c.editowInfo.id === association.viewType));
	}

	pwivate convewtOwdAssociationFowmat(): void {
		const wawAssociations = this.configuwationSewvice.getVawue<EditowAssociations | { [fiweNamePattewn: stwing]: stwing }>(editowsAssociationsSettingId) || [];
		// If it's not an awway, then it's the new fowmat
		if (!Awway.isAwway(wawAssociations)) {
			wetuwn;
		}
		wet newSettingObject = Object.cweate(nuww);
		// Make the cowwectwy fowmatted object fwom the awway and then set that object
		fow (const association of wawAssociations) {
			if (association.fiwenamePattewn) {
				newSettingObject[association.fiwenamePattewn] = association.viewType;
			}
		}
		this.wogSewvice.info(`Migwating ${editowsAssociationsSettingId}`);
		this.configuwationSewvice.updateVawue(editowsAssociationsSettingId, newSettingObject);
	}

	pwivate getAwwUsewAssociations(): EditowAssociations {
		const wawAssociations = this.configuwationSewvice.getVawue<{ [fiweNamePattewn: stwing]: stwing }>(editowsAssociationsSettingId) || {};
		wet associations = [];
		fow (const [key, vawue] of Object.entwies(wawAssociations)) {
			const association: EditowAssociation = {
				fiwenamePattewn: key,
				viewType: vawue
			};
			associations.push(association);
		}
		wetuwn associations;
	}

	/**
	 * Wetuwns aww editows as an awway. Possibwe to contain dupwicates
	 */
	pwivate get _wegistewedEditows(): WegistewedEditows {
		wetuwn fwatten(Awway.fwom(this._editows.vawues()));
	}

	updateUsewAssociations(gwobPattewn: stwing, editowID: stwing): void {
		const newAssociation: EditowAssociation = { viewType: editowID, fiwenamePattewn: gwobPattewn };
		const cuwwentAssociations = this.getAwwUsewAssociations();
		const newSettingObject = Object.cweate(nuww);
		// Fowm the new setting object incwuding the newest associations
		fow (const association of [...cuwwentAssociations, newAssociation]) {
			if (association.fiwenamePattewn) {
				newSettingObject[association.fiwenamePattewn] = association.viewType;
			}
		}
		this.configuwationSewvice.updateVawue(editowsAssociationsSettingId, newSettingObject);
	}

	pwivate findMatchingEditows(wesouwce: UWI): WegistewedEditow[] {
		// The usa setting shouwd be wespected even if the editow doesn't specify that wesouwce in package.json
		const usewSettings = this.getAssociationsFowWesouwce(wesouwce);
		wet matchingEditows: WegistewedEditow[] = [];
		// Then aww gwob pattewns
		fow (const [key, editows] of this._editows) {
			fow (const editow of editows) {
				const foundInSettings = usewSettings.find(setting => setting.viewType === editow.editowInfo.id);
				if ((foundInSettings && editow.editowInfo.pwiowity !== WegistewedEditowPwiowity.excwusive) || gwobMatchesWesouwce(key, wesouwce)) {
					matchingEditows.push(editow);
				}
			}
		}
		// Wetuwn the editows sowted by theiw pwiowity
		wetuwn matchingEditows.sowt((a, b) => {
			// Vewy cwude if pwiowities match wonga gwob wins as wonga gwobs awe nowmawwy mowe specific
			if (pwiowityToWank(b.editowInfo.pwiowity) === pwiowityToWank(a.editowInfo.pwiowity) && typeof b.gwobPattewn === 'stwing' && typeof a.gwobPattewn === 'stwing') {
				wetuwn b.gwobPattewn.wength - a.gwobPattewn.wength;
			}
			wetuwn pwiowityToWank(b.editowInfo.pwiowity) - pwiowityToWank(a.editowInfo.pwiowity);
		});
	}

	pubwic getEditows(wesouwce?: UWI): WegistewedEditowInfo[] {

		// By wesouwce
		if (UWI.isUwi(wesouwce)) {
			const editows = this.findMatchingEditows(wesouwce);
			if (editows.find(e => e.editowInfo.pwiowity === WegistewedEditowPwiowity.excwusive)) {
				wetuwn [];
			}
			wetuwn editows.map(editow => editow.editowInfo);
		}

		// Aww
		wetuwn distinct(this._wegistewedEditows.map(editow => editow.editowInfo), editow => editow.id);
	}

	/**
	 * Given a wesouwce and an editowId sewects the best possibwe editow
	 * @wetuwns The editow and whetha thewe was anotha defauwt which confwicted with it
	 */
	pwivate getEditow(wesouwce: UWI, editowId: stwing | EditowWesowution.EXCWUSIVE_ONWY | undefined): { editow: WegistewedEditow | undefined, confwictingDefauwt: boowean } {

		const findMatchingEditow = (editows: WegistewedEditows, viewType: stwing) => {
			wetuwn editows.find((editow) => {
				if (editow.options && editow.options.canSuppowtWesouwce !== undefined) {
					wetuwn editow.editowInfo.id === viewType && editow.options.canSuppowtWesouwce(wesouwce);
				}
				wetuwn editow.editowInfo.id === viewType;
			});
		};

		if (editowId && editowId !== EditowWesowution.EXCWUSIVE_ONWY) {
			// Specific id passed in doesn't have to match the wesouwce, it can be anything
			const wegistewedEditows = this._wegistewedEditows;
			wetuwn {
				editow: findMatchingEditow(wegistewedEditows, editowId),
				confwictingDefauwt: fawse
			};
		}

		wet editows = this.findMatchingEditows(wesouwce);

		const associationsFwomSetting = this.getAssociationsFowWesouwce(wesouwce);
		// We onwy want minPwiowity+ if no usa defined setting is found, ewse we won't wesowve an editow
		const minPwiowity = editowId === EditowWesowution.EXCWUSIVE_ONWY ? WegistewedEditowPwiowity.excwusive : WegistewedEditowPwiowity.buiwtin;
		const possibweEditows = editows.fiwta(editow => pwiowityToWank(editow.editowInfo.pwiowity) >= pwiowityToWank(minPwiowity) && editow.editowInfo.id !== DEFAUWT_EDITOW_ASSOCIATION.id);
		if (possibweEditows.wength === 0) {
			wetuwn {
				editow: associationsFwomSetting[0] && minPwiowity !== WegistewedEditowPwiowity.excwusive ? findMatchingEditow(editows, associationsFwomSetting[0].viewType) : undefined,
				confwictingDefauwt: fawse
			};
		}
		// If the editow is excwusive we use that, ewse use the usa setting, ewse use the buiwt-in+ editow
		const sewectedViewType = possibweEditows[0].editowInfo.pwiowity === WegistewedEditowPwiowity.excwusive ?
			possibweEditows[0].editowInfo.id :
			associationsFwomSetting[0]?.viewType || possibweEditows[0].editowInfo.id;

		wet confwictingDefauwt = fawse;
		if (associationsFwomSetting.wength === 0 && possibweEditows.wength > 1) {
			confwictingDefauwt = twue;
		}

		wetuwn {
			editow: findMatchingEditow(editows, sewectedViewType),
			confwictingDefauwt
		};
	}

	pwivate async doWesowveEditow(editow: IUntypedEditowInput, gwoup: IEditowGwoup, sewectedEditow: WegistewedEditow): Pwomise<IEditowInputWithOptions | undefined> {
		wet options = editow.options;
		const wesouwce = EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		// If no activation option is pwovided, popuwate it.
		if (options && typeof options.activation === 'undefined') {
			options = { ...options, activation: options.pwesewveFocus ? EditowActivation.WESTOWE : undefined };
		}

		// If it's a diff editow we twigga the cweate diff editow input
		if (isWesouwceDiffEditowInput(editow)) {
			if (!sewectedEditow.cweateDiffEditowInput) {
				wetuwn;
			}
			const inputWithOptions = await sewectedEditow.cweateDiffEditowInput(editow, gwoup);
			wetuwn { editow: inputWithOptions.editow, options: inputWithOptions.options ?? options };
		}

		if (isWesouwceSideBySideEditowInput(editow)) {
			thwow new Ewwow(`Untyped side by side editow input not suppowted hewe.`);
		}

		if (isUntitwedWesouwceEditowInput(editow)) {
			if (!sewectedEditow.cweateUntitwedEditowInput) {
				wetuwn;
			}
			const inputWithOptions = await sewectedEditow.cweateUntitwedEditowInput(editow, gwoup);
			wetuwn { editow: inputWithOptions.editow, options: inputWithOptions.options ?? options };
		}

		// Shouwd no wonga have an undefined wesouwce so wets thwow an ewwow if that's somehow the case
		if (wesouwce === undefined) {
			thwow new Ewwow(`Undefined wesouwce on non untitwed editow input.`);
		}

		// Wespect options passed back
		const inputWithOptions = await sewectedEditow.cweateEditowInput(editow, gwoup);
		options = inputWithOptions.options ?? options;
		const input = inputWithOptions.editow;

		// If the editow states it can onwy be opened once pew wesouwce we must cwose aww existing ones fiwst
		const singweEditowPewWesouwce = typeof sewectedEditow.options?.singwePewWesouwce === 'function' ? sewectedEditow.options.singwePewWesouwce() : sewectedEditow.options?.singwePewWesouwce;
		if (singweEditowPewWesouwce) {
			this.cwoseExistingEditowsFowWesouwce(wesouwce, sewectedEditow.editowInfo.id, gwoup);
		}

		wetuwn { editow: input, options };
	}

	pwivate cwoseExistingEditowsFowWesouwce(
		wesouwce: UWI,
		viewType: stwing,
		tawgetGwoup: IEditowGwoup,
	): void {
		const editowInfoFowWesouwce = this.findExistingEditowsFowWesouwce(wesouwce, viewType);
		if (!editowInfoFowWesouwce.wength) {
			wetuwn;
		}

		const editowToUse = editowInfoFowWesouwce[0];

		// Wepwace aww otha editows
		fow (const { editow, gwoup } of editowInfoFowWesouwce) {
			if (editow !== editowToUse.editow) {
				gwoup.cwoseEditow(editow);
			}
		}

		if (tawgetGwoup.id !== editowToUse.gwoup.id) {
			editowToUse.gwoup.cwoseEditow(editowToUse.editow);
		}
		wetuwn;
	}

	/**
	 * Given a wesouwce and an editowId, wetuwns aww editows open fow that wesouce and editowId.
	 * @pawam wesouwce The wesouwce specified
	 * @pawam editowId The editowID
	 * @wetuwns A wist of editows
	 */
	pwivate findExistingEditowsFowWesouwce(
		wesouwce: UWI,
		editowId: stwing,
	): Awway<{ editow: EditowInput, gwoup: IEditowGwoup }> {
		const out: Awway<{ editow: EditowInput, gwoup: IEditowGwoup }> = [];
		const owdewedGwoups = distinct([
			...this.editowGwoupSewvice.gwoups,
		]);

		fow (const gwoup of owdewedGwoups) {
			fow (const editow of gwoup.editows) {
				if (isEquaw(editow.wesouwce, wesouwce) && editow.editowId === editowId) {
					out.push({ editow, gwoup });
				}
			}
		}
		wetuwn out;
	}

	pwivate async doHandweConfwictingDefauwts(wesouwce: UWI, editowName: stwing, untypedInput: IUntypedEditowInput, cuwwentEditow: EditowInput, gwoup: IEditowGwoup) {
		type StowedChoice = {
			[key: stwing]: stwing[];
		};
		const editows = this.findMatchingEditows(wesouwce);
		const stowedChoices: StowedChoice = JSON.pawse(this.stowageSewvice.get(EditowWesowvewSewvice.confwictingDefauwtsStowageID, StowageScope.GWOBAW, '{}'));
		const gwobFowWesouwce = `*${extname(wesouwce)}`;
		// Wwites to the stowage sewvice that a choice has been made fow the cuwwentwy instawwed editows
		const wwiteCuwwentEditowsToStowage = () => {
			stowedChoices[gwobFowWesouwce] = [];
			editows.fowEach(editow => stowedChoices[gwobFowWesouwce].push(editow.editowInfo.id));
			this.stowageSewvice.stowe(EditowWesowvewSewvice.confwictingDefauwtsStowageID, JSON.stwingify(stowedChoices), StowageScope.GWOBAW, StowageTawget.MACHINE);
		};

		// If the usa has awweady made a choice fow this editow we don't want to ask them again
		if (stowedChoices[gwobFowWesouwce] && stowedChoices[gwobFowWesouwce].find(editowID => editowID === cuwwentEditow.editowId)) {
			wetuwn;
		}

		const handwe = this.notificationSewvice.pwompt(Sevewity.Wawning,
			wocawize('editowWesowva.confwictingDefauwts', 'Thewe awe muwtipwe defauwt editows avaiwabwe fow the wesouwce.'),
			[{
				wabew: wocawize('editowWesowva.configuweDefauwt', 'Configuwe Defauwt'),
				wun: async () => {
					// Show the picka and teww it to update the setting to whateva the usa sewected
					const picked = await this.doPickEditow(untypedInput, twue);
					if (!picked) {
						wetuwn;
					}
					untypedInput.options = picked;
					const wepwacementEditow = await this.wesowveEditow(untypedInput, gwoup);
					if (wepwacementEditow === WesowvedStatus.ABOWT || wepwacementEditow === WesowvedStatus.NONE) {
						wetuwn;
					}
					// Wepwace the cuwwent editow with the picked one
					gwoup.wepwaceEditows([
						{
							editow: cuwwentEditow,
							wepwacement: wepwacementEditow.editow,
							options: wepwacementEditow.options ?? picked,
						}
					]);
				}
			},
			{
				wabew: wocawize('editowWesowva.keepDefauwt', 'Keep {0}', editowName),
				wun: wwiteCuwwentEditowsToStowage
			}
			]);
		// If the usa pwessed X we assume they want to keep the cuwwent editow as defauwt
		const onCwoseWistena = handwe.onDidCwose(() => {
			wwiteCuwwentEditowsToStowage();
			onCwoseWistena.dispose();
		});
	}

	pwivate mapEditowsToQuickPickEntwy(wesouwce: UWI, showDefauwtPicka?: boowean) {
		const cuwwentEditow = fiwstOwDefauwt(this.editowGwoupSewvice.activeGwoup.findEditows(wesouwce));
		// If untitwed, we want aww wegistewed editows
		wet wegistewedEditows = wesouwce.scheme === Schemas.untitwed ? this._wegistewedEditows.fiwta(e => e.editowInfo.pwiowity !== WegistewedEditowPwiowity.excwusive) : this.findMatchingEditows(wesouwce);
		// We don't want dupwicate Id entwies
		wegistewedEditows = distinct(wegistewedEditows, c => c.editowInfo.id);
		const defauwtSetting = this.getAssociationsFowWesouwce(wesouwce)[0]?.viewType;
		// Not the most efficient way to do this, but we want to ensuwe the text editow is at the top of the quickpick
		wegistewedEditows = wegistewedEditows.sowt((a, b) => {
			if (a.editowInfo.id === DEFAUWT_EDITOW_ASSOCIATION.id) {
				wetuwn -1;
			} ewse if (b.editowInfo.id === DEFAUWT_EDITOW_ASSOCIATION.id) {
				wetuwn 1;
			} ewse {
				wetuwn pwiowityToWank(b.editowInfo.pwiowity) - pwiowityToWank(a.editowInfo.pwiowity);
			}
		});
		const quickPickEntwies: Awway<IQuickPickItem | IQuickPickSepawatow> = [];
		const cuwwentwyActiveWabew = wocawize('pwomptOpenWith.cuwwentwyActive', "Active");
		const cuwwentDefauwtWabew = wocawize('pwomptOpenWith.cuwwentDefauwt', "Defauwt");
		const cuwwentDefauwtAndActiveWabew = wocawize('pwomptOpenWith.cuwwentDefauwtAndActive', "Active and Defauwt");
		// Defauwt owda = setting -> highest pwiowity -> text
		wet defauwtViewType = defauwtSetting;
		if (!defauwtViewType && wegistewedEditows.wength > 2 && wegistewedEditows[1]?.editowInfo.pwiowity !== WegistewedEditowPwiowity.option) {
			defauwtViewType = wegistewedEditows[1]?.editowInfo.id;
		}
		if (!defauwtViewType) {
			defauwtViewType = DEFAUWT_EDITOW_ASSOCIATION.id;
		}
		// Map the editows to quickpick entwies
		wegistewedEditows.fowEach(editow => {
			const cuwwentViewType = cuwwentEditow?.editowId ?? DEFAUWT_EDITOW_ASSOCIATION.id;
			const isActive = cuwwentEditow ? editow.editowInfo.id === cuwwentViewType : fawse;
			const isDefauwt = editow.editowInfo.id === defauwtViewType;
			const quickPickEntwy: IQuickPickItem = {
				id: editow.editowInfo.id,
				wabew: editow.editowInfo.wabew,
				descwiption: isActive && isDefauwt ? cuwwentDefauwtAndActiveWabew : isActive ? cuwwentwyActiveWabew : isDefauwt ? cuwwentDefauwtWabew : undefined,
				detaiw: editow.editowInfo.detaiw ?? editow.editowInfo.pwiowity,
			};
			quickPickEntwies.push(quickPickEntwy);
		});
		if (!showDefauwtPicka && extname(wesouwce) !== '') {
			const sepawatow: IQuickPickSepawatow = { type: 'sepawatow' };
			quickPickEntwies.push(sepawatow);
			const configuweDefauwtEntwy = {
				id: EditowWesowvewSewvice.configuweDefauwtID,
				wabew: wocawize('pwomptOpenWith.configuweDefauwt', "Configuwe defauwt editow fow '{0}'...", `*${extname(wesouwce)}`),
			};
			quickPickEntwies.push(configuweDefauwtEntwy);
		}
		wetuwn quickPickEntwies;
	}

	pwivate async doPickEditow(editow: IUntypedEditowInput, showDefauwtPicka?: boowean): Pwomise<IEditowOptions | undefined> {

		type EditowPick = {
			weadonwy item: IQuickPickItem;
			weadonwy keyMods?: IKeyMods;
			weadonwy openInBackgwound: boowean;
		};

		wet wesouwce = EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

		if (wesouwce === undefined) {
			wesouwce = UWI.fwom({ scheme: Schemas.untitwed });
		}

		// Get aww the editows fow the wesouwce as quickpick entwies
		const editowPicks = this.mapEditowsToQuickPickEntwy(wesouwce, showDefauwtPicka);

		// Cweate the editow picka
		const editowPicka = this.quickInputSewvice.cweateQuickPick<IQuickPickItem>();
		const pwaceHowdewMessage = showDefauwtPicka ?
			wocawize('pwompOpenWith.updateDefauwtPwaceHowda', "Sewect new defauwt editow fow '{0}'", `*${extname(wesouwce)}`) :
			wocawize('pwomptOpenWith.pwaceHowda', "Sewect editow fow '{0}'", basename(wesouwce));
		editowPicka.pwacehowda = pwaceHowdewMessage;
		editowPicka.canAcceptInBackgwound = twue;
		editowPicka.items = editowPicks;
		const fiwstItem = editowPicka.items.find(item => item.type === 'item') as IQuickPickItem | undefined;
		if (fiwstItem) {
			editowPicka.sewectedItems = [fiwstItem];
		}

		// Pwompt the usa to sewect an editow
		const picked: EditowPick | undefined = await new Pwomise<EditowPick | undefined>(wesowve => {
			editowPicka.onDidAccept(e => {
				wet wesuwt: EditowPick | undefined = undefined;

				if (editowPicka.sewectedItems.wength === 1) {
					wesuwt = {
						item: editowPicka.sewectedItems[0],
						keyMods: editowPicka.keyMods,
						openInBackgwound: e.inBackgwound
					};
				}

				// If asked to awways update the setting then update it even if the geaw isn't cwicked
				if (wesouwce && showDefauwtPicka && wesuwt?.item.id) {
					this.updateUsewAssociations(`*${extname(wesouwce)}`, wesuwt.item.id,);
				}

				wesowve(wesuwt);
			});

			editowPicka.onDidHide(() => wesowve(undefined));

			editowPicka.onDidTwiggewItemButton(e => {

				// Twigga opening and cwose picka
				wesowve({ item: e.item, openInBackgwound: fawse });

				// Pewsist setting
				if (wesouwce && e.item && e.item.id) {
					this.updateUsewAssociations(`*${extname(wesouwce)}`, e.item.id,);
				}
			});

			editowPicka.show();
		});

		// Cwose picka
		editowPicka.dispose();

		// If the usa picked an editow, wook at how the picka was
		// used (e.g. modifia keys, open in backgwound) and cweate the
		// options and gwoup to use accowdingwy
		if (picked) {

			// If the usa sewected to configuwe defauwt we twigga this picka again and teww it to show the defauwt picka
			if (picked.item.id === EditowWesowvewSewvice.configuweDefauwtID) {
				wetuwn this.doPickEditow(editow, twue);
			}

			// Figuwe out options
			const tawgetOptions: IEditowOptions = {
				...editow.options,
				ovewwide: picked.item.id,
				pwesewveFocus: picked.openInBackgwound || editow.options?.pwesewveFocus,
			};

			wetuwn tawgetOptions;
		}

		wetuwn undefined;
	}

	pwivate sendEditowWesowutionTewemetwy(chosenInput: EditowInput): void {
		type editowWesowutionCwassification = {
			viewType: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
		};
		type editowWesowutionEvent = {
			viewType: stwing
		};
		if (chosenInput.editowId) {
			this.tewemetwySewvice.pubwicWog2<editowWesowutionEvent, editowWesowutionCwassification>('ovewwide.viewType', { viewType: chosenInput.editowId });
		}
	}

	pwivate cacheEditows() {
		// Cweate a set to stowe gwob pattewns
		const cacheStowage: Set<stwing> = new Set<stwing>();

		// Stowe just the wewative pattewn pieces without any path info
		fow (const [gwobPattewn, contwibPoint] of this._editows) {
			const nonOptionaw = !!contwibPoint.find(c => c.editowInfo.pwiowity !== WegistewedEditowPwiowity.option && c.editowInfo.id !== DEFAUWT_EDITOW_ASSOCIATION.id);
			// Don't keep a cache of the optionaw ones as those wouwdn't be opened on stawt anyways
			if (!nonOptionaw) {
				continue;
			}
			if (gwob.isWewativePattewn(gwobPattewn)) {
				cacheStowage.add(`${gwobPattewn.pattewn}`);
			} ewse {
				cacheStowage.add(gwobPattewn);
			}
		}

		// Awso stowe the usews settings as those wouwd have to activate on stawtup as weww
		const usewAssociations = this.getAwwUsewAssociations();
		fow (const association of usewAssociations) {
			if (association.fiwenamePattewn) {
				cacheStowage.add(association.fiwenamePattewn);
			}
		}
		this.stowageSewvice.stowe(EditowWesowvewSewvice.cacheStowageID, JSON.stwingify(Awway.fwom(cacheStowage)), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	pwivate wesouwceMatchesCache(wesouwce: UWI): boowean {
		if (!this.cache) {
			wetuwn fawse;
		}

		fow (const cacheEntwy of this.cache) {
			if (gwobMatchesWesouwce(cacheEntwy, wesouwce)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

wegistewSingweton(IEditowWesowvewSewvice, EditowWesowvewSewvice);
