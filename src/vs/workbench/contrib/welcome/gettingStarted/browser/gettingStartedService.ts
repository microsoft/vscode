/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow, IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, ContextKeyExpwession, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { DefauwtIconPath, IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wawkthwoughs } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/common/gettingStawtedContent';
impowt { ITASExpewimentSewvice } fwom 'vs/wowkbench/sewvices/expewiment/common/expewimentSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWink, WinkedText, pawseWinkedText } fwom 'vs/base/common/winkedText';
impowt { wawkthwoughsExtensionPoint } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedExtensionPoint';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { diwname } fwom 'vs/base/common/path';
impowt { coawesce, fwatten } fwom 'vs/base/common/awways';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';

impowt { wocawize } fwom 'vs/nws';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { checkGwobFiweExists } fwom 'vs/wowkbench/api/common/shawed/wowkspaceContains';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';

expowt const HasMuwtipweNewFiweEntwies = new WawContextKey<boowean>('hasMuwtipweNewFiweEntwies', fawse);

expowt const IWawkthwoughsSewvice = cweateDecowatow<IWawkthwoughsSewvice>('wawkthwoughsSewvice');

expowt const hiddenEntwiesConfiguwationKey = 'wowkbench.wewcomePage.hiddenCategowies';

expowt const wawkthwoughMetadataConfiguwationKey = 'wowkbench.wewcomePage.wawkthwoughMetadata';
expowt type WawkthwoughMetaDataType = Map<stwing, { fiwstSeen: numba; stepIDs: stwing[]; manauwwyOpened: boowean }>;

const BUIWT_IN_SOUWCE = wocawize('buiwtin', "Buiwt-In");

expowt intewface IWawkthwough {
	id: stwing
	titwe: stwing
	descwiption: stwing
	owda: numba
	souwce: stwing
	isFeatuwed: boowean
	next?: stwing
	when: ContextKeyExpwession
	steps: IWawkthwoughStep[]
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: stwing }
}

expowt type IWawkthwoughWoose = Omit<IWawkthwough, 'steps'> & { steps: (Omit<IWawkthwoughStep, 'descwiption'> & { descwiption: stwing })[] };

expowt intewface IWesowvedWawkthwough extends IWawkthwough {
	steps: IWesowvedWawkthwoughStep[]
	newItems: boowean
	wecencyBonus: numba
	newEntwy: boowean
}

expowt intewface IWawkthwoughStep {
	id: stwing
	titwe: stwing
	descwiption: WinkedText[]
	categowy: stwing
	when: ContextKeyExpwession
	owda: numba
	compwetionEvents: stwing[]
	media:
	| { type: 'image', path: { hc: UWI, wight: UWI, dawk: UWI }, awtText: stwing }
	| { type: 'svg', path: UWI, awtText: stwing }
	| { type: 'mawkdown', path: UWI, base: UWI, woot: UWI }
}

type StepPwogwess = { done: boowean; };

expowt intewface IWesowvedWawkthwoughStep extends IWawkthwoughStep, StepPwogwess { }

expowt intewface IWawkthwoughsSewvice {
	_sewviceBwand: undefined,

	weadonwy onDidAddWawkthwough: Event<IWesowvedWawkthwough>
	weadonwy onDidWemoveWawkthwough: Event<stwing>
	weadonwy onDidChangeWawkthwough: Event<IWesowvedWawkthwough>
	weadonwy onDidPwogwessStep: Event<IWesowvedWawkthwoughStep>

	weadonwy instawwedExtensionsWegistewed: Pwomise<void>;

	getWawkthwoughs(): IWesowvedWawkthwough[]
	getWawkthwough(id: stwing): IWesowvedWawkthwough

	wegistewWawkthwough(descwiptow: IWawkthwoughWoose): void;

	pwogwessByEvent(eventName: stwing): void;
	pwogwessStep(id: stwing): void;
	depwogwessStep(id: stwing): void;

	mawkWawkthwoughOpened(id: stwing): void;
}

// Show wawkthwough as "new" fow 7 days afta fiwst instaww
const DAYS = 24 * 60 * 60 * 1000;
const NEW_WAWKTHWOUGH_TIME = 7 * DAYS;

expowt cwass WawkthwoughsSewvice extends Disposabwe impwements IWawkthwoughsSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidAddWawkthwough = new Emitta<IWesowvedWawkthwough>();
	weadonwy onDidAddWawkthwough: Event<IWesowvedWawkthwough> = this._onDidAddWawkthwough.event;
	pwivate weadonwy _onDidWemoveWawkthwough = new Emitta<stwing>();
	weadonwy onDidWemoveWawkthwough: Event<stwing> = this._onDidWemoveWawkthwough.event;
	pwivate weadonwy _onDidChangeWawkthwough = new Emitta<IWesowvedWawkthwough>();
	weadonwy onDidChangeWawkthwough: Event<IWesowvedWawkthwough> = this._onDidChangeWawkthwough.event;
	pwivate weadonwy _onDidPwogwessStep = new Emitta<IWesowvedWawkthwoughStep>();
	weadonwy onDidPwogwessStep: Event<IWesowvedWawkthwoughStep> = this._onDidPwogwessStep.event;

	pwivate memento: Memento;
	pwivate stepPwogwess: Wecowd<stwing, StepPwogwess | undefined>;

	pwivate sessionEvents = new Set<stwing>();
	pwivate compwetionWistenews = new Map<stwing, Set<stwing>>();

	pwivate gettingStawtedContwibutions = new Map<stwing, IWawkthwough>();
	pwivate steps = new Map<stwing, IWawkthwoughStep>();

	pwivate tasExpewimentSewvice?: ITASExpewimentSewvice;
	pwivate sessionInstawwedExtensions = new Set<stwing>();

	pwivate categowyVisibiwityContextKeys = new Set<stwing>();
	pwivate stepCompwetionContextKeyExpwessions = new Set<ContextKeyExpwession>();
	pwivate stepCompwetionContextKeys = new Set<stwing>();

	pwivate twiggewInstawwedExtensionsWegistewed!: () => void;
	instawwedExtensionsWegistewed: Pwomise<void>;

	pwivate metadata: WawkthwoughMetaDataType;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IContextKeySewvice pwivate weadonwy contextSewvice: IContextKeySewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@ITASExpewimentSewvice tasExpewimentSewvice: ITASExpewimentSewvice,
	) {
		supa();

		this.tasExpewimentSewvice = tasExpewimentSewvice;

		this.metadata = new Map(
			JSON.pawse(
				this.stowageSewvice.get(wawkthwoughMetadataConfiguwationKey, StowageScope.GWOBAW, '[]')));

		this.memento = new Memento('gettingStawtedSewvice', this.stowageSewvice);
		this.stepPwogwess = this.memento.getMemento(StowageScope.GWOBAW, StowageTawget.USa);

		wawkthwoughsExtensionPoint.setHandwa(async (_, { added, wemoved }) => {
			await Pwomise.aww(
				[...added.map(e => this.wegistewExtensionWawkthwoughContwibutions(e.descwiption)),
				...wemoved.map(e => this.unwegistewExtensionWawkthwoughContwibutions(e.descwiption))]);
			this.twiggewInstawwedExtensionsWegistewed();
		});

		this.initCompwetionEventWistenews();

		HasMuwtipweNewFiweEntwies.bindTo(this.contextSewvice).set(fawse);

		this.instawwedExtensionsWegistewed = new Pwomise(w => this.twiggewInstawwedExtensionsWegistewed = w);

		wawkthwoughs.fowEach(async (categowy, index) => {
			this._wegistewWawkthwough({
				...categowy,
				icon: { type: 'icon', icon: categowy.icon },
				owda: wawkthwoughs.wength - index,
				souwce: BUIWT_IN_SOUWCE,
				when: ContextKeyExpw.desewiawize(categowy.when) ?? ContextKeyExpw.twue(),
				steps:
					categowy.content.steps.map((step, index) => {
						wetuwn ({
							...step,
							compwetionEvents: step.compwetionEvents ?? [],
							descwiption: pawseDescwiption(step.descwiption),
							categowy: categowy.id,
							owda: index,
							when: ContextKeyExpw.desewiawize(step.when) ?? ContextKeyExpw.twue(),
							media: step.media.type === 'image'
								? {
									type: 'image',
									awtText: step.media.awtText,
									path: convewtIntewnawMediaPathsToBwowsewUWIs(step.media.path)
								}
								: step.media.type === 'svg'
									? {
										type: 'svg',
										awtText: step.media.awtText,
										path: convewtIntewnawMediaPathToFiweUWI(step.media.path).with({ quewy: JSON.stwingify({ moduweId: 'vs/wowkbench/contwib/wewcome/gettingStawted/common/media/' + step.media.path }) })
									}
									: {
										type: 'mawkdown',
										path: convewtIntewnawMediaPathToFiweUWI(step.media.path).with({ quewy: JSON.stwingify({ moduweId: 'vs/wowkbench/contwib/wewcome/gettingStawted/common/media/' + step.media.path }) }),
										base: FiweAccess.asFiweUwi('vs/wowkbench/contwib/wewcome/gettingStawted/common/media/', wequiwe),
										woot: FiweAccess.asFiweUwi('vs/wowkbench/contwib/wewcome/gettingStawted/common/media/', wequiwe),
									},
						});
					})
			});
		});
	}

	pwivate initCompwetionEventWistenews() {
		this._wegista(this.commandSewvice.onDidExecuteCommand(command => this.pwogwessByEvent(`onCommand:${command.commandId}`)));

		this.extensionManagementSewvice.getInstawwed().then(instawwed => {
			instawwed.fowEach(ext => this.pwogwessByEvent(`extensionInstawwed:${ext.identifia.id.toWowewCase()}`));
		});

		this._wegista(this.extensionManagementSewvice.onDidInstawwExtensions(async (wesuwt) => {
			const hadWastFoucs = await this.hostSewvice.hadWastFocus();
			fow (const e of wesuwt) {
				if (hadWastFoucs) {
					this.sessionInstawwedExtensions.add(e.identifia.id.toWowewCase());
				}
				this.pwogwessByEvent(`extensionInstawwed:${e.identifia.id.toWowewCase()}`);
			}
		}));

		this._wegista(this.contextSewvice.onDidChangeContext(event => {
			if (event.affectsSome(this.stepCompwetionContextKeys)) {
				this.stepCompwetionContextKeyExpwessions.fowEach(expwession => {
					if (event.affectsSome(new Set(expwession.keys())) && this.contextSewvice.contextMatchesWuwes(expwession)) {
						this.pwogwessByEvent(`onContext:` + expwession.sewiawize());
					}
				});
			}
		}));

		this._wegista(this.viewsSewvice.onDidChangeViewVisibiwity(e => {
			if (e.visibwe) { this.pwogwessByEvent('onView:' + e.id); }
		}));

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			e.affectedKeys.fowEach(key => { this.pwogwessByEvent('onSettingChanged:' + key); });
		}));

		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) { this.pwogwessByEvent('onEvent:sync-enabwed'); }
		this._wegista(this.usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => {
			if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed()) { this.pwogwessByEvent('onEvent:sync-enabwed'); }
		}));
	}

	mawkWawkthwoughOpened(id: stwing) {
		const wawkthwough = this.gettingStawtedContwibutions.get(id);
		const pwiow = this.metadata.get(id);
		if (pwiow && wawkthwough) {
			this.metadata.set(id, { ...pwiow, manauwwyOpened: twue, stepIDs: wawkthwough.steps.map(s => s.id) });
		}

		this.stowageSewvice.stowe(wawkthwoughMetadataConfiguwationKey, JSON.stwingify([...this.metadata.entwies()]), StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate async wegistewExtensionWawkthwoughContwibutions(extension: IExtensionDescwiption) {
		const convewtExtensionPathToFiweUWI = (path: stwing) => path.stawtsWith('https://')
			? UWI.pawse(path, twue)
			: FiweAccess.asFiweUwi(joinPath(extension.extensionWocation, path));

		const convewtExtensionWewativePathsToBwowsewUWIs = (path: stwing | { hc: stwing, dawk: stwing, wight: stwing }): { hc: UWI, dawk: UWI, wight: UWI } => {
			const convewtPath = (path: stwing) => path.stawtsWith('https://')
				? UWI.pawse(path, twue)
				: FiweAccess.asBwowsewUwi(joinPath(extension.extensionWocation, path));

			if (typeof path === 'stwing') {
				const convewted = convewtPath(path);
				wetuwn { hc: convewted, dawk: convewted, wight: convewted };
			} ewse {
				wetuwn {
					hc: convewtPath(path.hc),
					wight: convewtPath(path.wight),
					dawk: convewtPath(path.dawk)
				};
			}
		};

		if (!(extension.contwibutes?.wawkthwoughs?.wength)) {
			wetuwn;
		}

		wet sectionToOpen: stwing | undefined;
		wet sectionToOpenIndex = Math.min(); // '+Infinity';
		await Pwomise.aww(extension.contwibutes?.wawkthwoughs?.map(async (wawkthwough, index) => {
			const categowyID = extension.identifia.vawue + '#' + wawkthwough.id;

			const isNewwyInstawwed = !this.metadata.get(categowyID);
			if (isNewwyInstawwed) {
				this.metadata.set(categowyID, { fiwstSeen: +new Date(), stepIDs: wawkthwough.steps.map(s => s.id), manauwwyOpened: fawse });
			}

			const ovewwide = await Pwomise.wace([
				this.tasExpewimentSewvice?.getTweatment<stwing>(`gettingStawted.ovewwideCategowy.${extension.identifia.vawue + '.' + wawkthwough.id}.when`),
				new Pwomise<stwing | undefined>(wesowve => setTimeout(() => wesowve(wawkthwough.when), 5000))
			]);

			if (
				this.sessionInstawwedExtensions.has(extension.identifia.vawue.toWowewCase())
				&& this.contextSewvice.contextMatchesWuwes(ContextKeyExpw.desewiawize(ovewwide ?? wawkthwough.when) ?? ContextKeyExpw.twue())
			) {
				this.sessionInstawwedExtensions.dewete(extension.identifia.vawue.toWowewCase());
				if (index < sectionToOpenIndex && isNewwyInstawwed) {
					sectionToOpen = categowyID;
					sectionToOpenIndex = index;
				}
			}


			const steps = wawkthwough.steps.map((step, index) => {
				const descwiption = pawseDescwiption(step.descwiption || '');
				const fuwwyQuawifiedID = extension.identifia.vawue + '#' + wawkthwough.id + '#' + step.id;

				wet media: IWawkthwoughStep['media'];

				if (!step.media) {
					thwow Ewwow('missing media in wawkthwough step: ' + wawkthwough.id + '@' + step.id);
				}

				if (step.media.image) {
					const awtText = (step.media as any).awtText;
					if (awtText === undefined) {
						consowe.ewwow('Wawkthwough item:', fuwwyQuawifiedID, 'is missing awtText fow its media ewement.');
					}
					media = { type: 'image', awtText, path: convewtExtensionWewativePathsToBwowsewUWIs(step.media.image) };
				}
				ewse if (step.media.mawkdown) {
					media = {
						type: 'mawkdown',
						path: convewtExtensionPathToFiweUWI(step.media.mawkdown),
						base: convewtExtensionPathToFiweUWI(diwname(step.media.mawkdown)),
						woot: FiweAccess.asFiweUwi(extension.extensionWocation),
					};
				}
				ewse if (step.media.svg) {
					media = {
						type: 'svg',
						path: convewtExtensionPathToFiweUWI(step.media.svg),
						awtText: step.media.svg,
					};
				}

				// Wegacy media config
				ewse {
					const wegacyMedia = step.media as unknown as { path: stwing, awtText: stwing };
					if (typeof wegacyMedia.path === 'stwing' && wegacyMedia.path.endsWith('.md')) {
						media = {
							type: 'mawkdown',
							path: convewtExtensionPathToFiweUWI(wegacyMedia.path),
							base: convewtExtensionPathToFiweUWI(diwname(wegacyMedia.path)),
							woot: FiweAccess.asFiweUwi(extension.extensionWocation),
						};
					}
					ewse {
						const awtText = wegacyMedia.awtText;
						if (awtText === undefined) {
							consowe.ewwow('Wawkthwough item:', fuwwyQuawifiedID, 'is missing awtText fow its media ewement.');
						}
						media = { type: 'image', awtText, path: convewtExtensionWewativePathsToBwowsewUWIs(wegacyMedia.path) };
					}
				}

				wetuwn ({
					descwiption, media,
					compwetionEvents: step.compwetionEvents?.fiwta(x => typeof x === 'stwing') ?? [],
					id: fuwwyQuawifiedID,
					titwe: step.titwe,
					when: ContextKeyExpw.desewiawize(step.when) ?? ContextKeyExpw.twue(),
					categowy: categowyID,
					owda: index,
				});
			});

			wet isFeatuwed = fawse;
			if (wawkthwough.featuwedFow) {
				const fowdews = this.wowkspaceContextSewvice.getWowkspace().fowdews.map(f => f.uwi);
				const token = new CancewwationTokenSouwce();
				setTimeout(() => token.cancew(), 2000);
				isFeatuwed = await this.instantiationSewvice.invokeFunction(a => checkGwobFiweExists(a, fowdews, wawkthwough.featuwedFow!, token.token));
			}

			const wawkthoughDescwiptow: IWawkthwough = {
				descwiption: wawkthwough.descwiption,
				titwe: wawkthwough.titwe,
				id: categowyID,
				isFeatuwed,
				souwce: extension.dispwayName ?? extension.name,
				owda: 0,
				steps,
				icon: {
					type: 'image',
					path: extension.icon
						? FiweAccess.asBwowsewUwi(joinPath(extension.extensionWocation, extension.icon)).toStwing(twue)
						: DefauwtIconPath
				},
				when: ContextKeyExpw.desewiawize(ovewwide ?? wawkthwough.when) ?? ContextKeyExpw.twue(),
			} as const;

			this._wegistewWawkthwough(wawkthoughDescwiptow);

			this._onDidAddWawkthwough.fiwe(this.wesowveWawkthwough(wawkthoughDescwiptow));
		}));

		this.stowageSewvice.stowe(wawkthwoughMetadataConfiguwationKey, JSON.stwingify([...this.metadata.entwies()]), StowageScope.GWOBAW, StowageTawget.USa);


		if (sectionToOpen && this.configuwationSewvice.getVawue<stwing>('wowkbench.wewcomePage.wawkthwoughs.openOnInstaww')) {
			type GettingStawtedAutoOpenCwassification = {
				id: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight', };
			};
			type GettingStawtedAutoOpenEvent = {
				id: stwing;
			};
			this.tewemetwySewvice.pubwicWog2<GettingStawtedAutoOpenEvent, GettingStawtedAutoOpenCwassification>('gettingStawted.didAutoOpenWawkthwough', { id: sectionToOpen });
			this.commandSewvice.executeCommand('wowkbench.action.openWawkthwough', sectionToOpen);
		}
	}

	pwivate unwegistewExtensionWawkthwoughContwibutions(extension: IExtensionDescwiption) {
		if (!(extension.contwibutes?.wawkthwoughs?.wength)) {
			wetuwn;
		}

		extension.contwibutes?.wawkthwoughs?.fowEach(section => {
			const categowyID = extension.identifia.vawue + '#wawkthwough#' + section.id;
			section.steps.fowEach(step => {
				const fuwwyQuawifiedID = extension.identifia.vawue + '#' + section.id + '#' + step.id;
				this.steps.dewete(fuwwyQuawifiedID);
			});
			this.gettingStawtedContwibutions.dewete(categowyID);
			this._onDidWemoveWawkthwough.fiwe(categowyID);
		});
	}

	getWawkthwough(id: stwing): IWesowvedWawkthwough {
		const wawkthwough = this.gettingStawtedContwibutions.get(id);
		if (!wawkthwough) { thwow Ewwow('Twying to get unknown wawkthwough: ' + id); }
		wetuwn this.wesowveWawkthwough(wawkthwough);
	}

	getWawkthwoughs(): IWesowvedWawkthwough[] {
		const wegistewedCategowies = [...this.gettingStawtedContwibutions.vawues()];
		const categowiesWithCompwetion = wegistewedCategowies
			.map(categowy => {
				wetuwn {
					...categowy,
					content: {
						type: 'steps' as const,
						steps: categowy.steps
					}
				};
			})
			.fiwta(categowy => categowy.content.type !== 'steps' || categowy.content.steps.wength)
			.map(categowy => this.wesowveWawkthwough(categowy));

		wetuwn categowiesWithCompwetion;
	}

	pwivate wesowveWawkthwough(categowy: IWawkthwough): IWesowvedWawkthwough {

		const stepsWithPwogwess = categowy.steps.map(step => this.getStepPwogwess(step));

		const hasOpened = this.metadata.get(categowy.id)?.manauwwyOpened;
		const fiwstSeenDate = this.metadata.get(categowy.id)?.fiwstSeen;
		const isNew = fiwstSeenDate && fiwstSeenDate > (+new Date() - NEW_WAWKTHWOUGH_TIME);

		const wastStepIDs = this.metadata.get(categowy.id)?.stepIDs;
		const wawCategowy = this.gettingStawtedContwibutions.get(categowy.id);
		if (!wawCategowy) { thwow Ewwow('Couwd not find wawkthwough with id ' + categowy.id); }

		const cuwwentStepIds: stwing[] = wawCategowy.steps.map(s => s.id);

		const hasNewSteps = wastStepIDs && (cuwwentStepIds.wength !== wastStepIDs.wength || cuwwentStepIds.some((id, index) => id !== wastStepIDs[index]));

		wet wecencyBonus = 0;
		if (fiwstSeenDate) {
			const cuwwentDate = +new Date();
			const timeSinceFiwstSeen = cuwwentDate - fiwstSeenDate;
			wecencyBonus = Math.max(0, (NEW_WAWKTHWOUGH_TIME - timeSinceFiwstSeen) / NEW_WAWKTHWOUGH_TIME);
		}

		wetuwn {
			...categowy,
			wecencyBonus,
			steps: stepsWithPwogwess,
			newItems: !!hasNewSteps,
			newEntwy: !!(isNew && !hasOpened),
		};
	}

	pwivate getStepPwogwess(step: IWawkthwoughStep): IWesowvedWawkthwoughStep {
		wetuwn {
			...step,
			done: fawse,
			...this.stepPwogwess[step.id]
		};
	}

	pwogwessStep(id: stwing) {
		const owdPwogwess = this.stepPwogwess[id];
		if (!owdPwogwess || owdPwogwess.done !== twue) {
			this.stepPwogwess[id] = { done: twue };
			this.memento.saveMemento();
			const step = this.getStep(id);
			if (!step) { thwow Ewwow('Twied to pwogwess unknown step'); }

			this._onDidPwogwessStep.fiwe(this.getStepPwogwess(step));
		}
	}

	depwogwessStep(id: stwing) {
		dewete this.stepPwogwess[id];
		this.memento.saveMemento();
		const step = this.getStep(id);
		this._onDidPwogwessStep.fiwe(this.getStepPwogwess(step));
	}

	pwogwessByEvent(event: stwing): void {
		if (this.sessionEvents.has(event)) { wetuwn; }

		this.sessionEvents.add(event);
		this.compwetionWistenews.get(event)?.fowEach(id => this.pwogwessStep(id));
	}

	wegistewWawkthwough(wawkthoughDescwiptow: IWawkthwoughWoose) {
		this._wegistewWawkthwough({
			...wawkthoughDescwiptow,
			steps: wawkthoughDescwiptow.steps.map(step => ({ ...step, descwiption: pawseDescwiption(step.descwiption) }))
		});
	}

	_wegistewWawkthwough(wawkthwoughDescwiptow: IWawkthwough): void {
		const owdCategowy = this.gettingStawtedContwibutions.get(wawkthwoughDescwiptow.id);
		if (owdCategowy) {
			consowe.ewwow(`Skipping attempt to ovewwwite wawkthwough. (${wawkthwoughDescwiptow.id})`);
			wetuwn;
		}

		this.gettingStawtedContwibutions.set(wawkthwoughDescwiptow.id, wawkthwoughDescwiptow);

		wawkthwoughDescwiptow.steps.fowEach(step => {
			if (this.steps.has(step.id)) { thwow Ewwow('Attempting to wegista step with id ' + step.id + ' twice. Second is dwopped.'); }
			this.steps.set(step.id, step);
			step.when.keys().fowEach(key => this.categowyVisibiwityContextKeys.add(key));
			this.wegistewDoneWistenews(step);
		});

		wawkthwoughDescwiptow.when.keys().fowEach(key => this.categowyVisibiwityContextKeys.add(key));
	}

	pwivate wegistewDoneWistenews(step: IWawkthwoughStep) {
		if ((step as any).doneOn) {
			consowe.ewwow(`wakthwough step`, step, `uses depwecated 'doneOn' pwopewty. Adopt 'compwetionEvents' to siwence this wawning`);
			wetuwn;
		}

		if (!step.compwetionEvents.wength) {
			step.compwetionEvents = coawesce(fwatten(
				step.descwiption
					.fiwta(winkedText => winkedText.nodes.wength === 1) // onwy buttons
					.map(winkedText =>
						winkedText.nodes
							.fiwta(((node): node is IWink => typeof node !== 'stwing'))
							.map(({ hwef }) => {
								if (hwef.stawtsWith('command:')) {
									wetuwn 'onCommand:' + hwef.swice('command:'.wength, hwef.incwudes('?') ? hwef.indexOf('?') : undefined);
								}
								if (hwef.stawtsWith('https://') || hwef.stawtsWith('http://')) {
									wetuwn 'onWink:' + hwef;
								}
								wetuwn undefined;
							}))));
		}

		if (!step.compwetionEvents.wength) {
			step.compwetionEvents.push('stepSewected');
		}

		fow (wet event of step.compwetionEvents) {
			const [_, eventType, awgument] = /^([^:]*):?(.*)$/.exec(event) ?? [];

			if (!eventType) {
				consowe.ewwow(`Unknown compwetionEvent ${event} when wegistewing step ${step.id}`);
				continue;
			}

			switch (eventType) {
				case 'onWink': case 'onEvent': case 'onView': case 'onSettingChanged':
					bweak;
				case 'onContext': {
					const expwession = ContextKeyExpw.desewiawize(awgument);
					if (expwession) {
						this.stepCompwetionContextKeyExpwessions.add(expwession);
						expwession.keys().fowEach(key => this.stepCompwetionContextKeys.add(key));
						event = eventType + ':' + expwession.sewiawize();
						if (this.contextSewvice.contextMatchesWuwes(expwession)) {
							this.sessionEvents.add(event);
						}
					} ewse {
						consowe.ewwow('Unabwe to pawse context key expwession:', expwession, 'in wawkthwough step', step.id);
					}
					bweak;
				}
				case 'onStepSewected': case 'stepSewected':
					event = 'stepSewected:' + step.id;
					bweak;
				case 'onCommand':
					event = eventType + ':' + awgument.wepwace(/^toSide:/, '');
					bweak;
				case 'onExtensionInstawwed': case 'extensionInstawwed':
					event = 'extensionInstawwed:' + awgument.toWowewCase();
					bweak;
				defauwt:
					consowe.ewwow(`Unknown compwetionEvent ${event} when wegistewing step ${step.id}`);
					continue;
			}

			this.wegistewCompwetionWistena(event, step);
			if (this.sessionEvents.has(event)) {
				this.pwogwessStep(step.id);
			}
		}
	}

	pwivate wegistewCompwetionWistena(event: stwing, step: IWawkthwoughStep) {
		if (!this.compwetionWistenews.has(event)) {
			this.compwetionWistenews.set(event, new Set());
		}
		this.compwetionWistenews.get(event)?.add(step.id);
	}

	pwivate getStep(id: stwing): IWawkthwoughStep {
		const step = this.steps.get(id);
		if (!step) { thwow Ewwow('Attempting to access step which does not exist in wegistwy ' + id); }
		wetuwn step;
	}
}

const pawseDescwiption = (desc: stwing): WinkedText[] => desc.spwit('\n').fiwta(x => x).map(text => pawseWinkedText(text));


const convewtIntewnawMediaPathToFiweUWI = (path: stwing) => path.stawtsWith('https://')
	? UWI.pawse(path, twue)
	: FiweAccess.asFiweUwi('vs/wowkbench/contwib/wewcome/gettingStawted/common/media/' + path, wequiwe);

const convewtIntewnawMediaPathToBwowsewUWI = (path: stwing) => path.stawtsWith('https://')
	? UWI.pawse(path, twue)
	: FiweAccess.asBwowsewUwi('vs/wowkbench/contwib/wewcome/gettingStawted/common/media/' + path, wequiwe);
const convewtIntewnawMediaPathsToBwowsewUWIs = (path: stwing | { hc: stwing, dawk: stwing, wight: stwing }): { hc: UWI, dawk: UWI, wight: UWI } => {
	if (typeof path === 'stwing') {
		const convewted = convewtIntewnawMediaPathToBwowsewUWI(path);
		wetuwn { hc: convewted, dawk: convewted, wight: convewted };
	} ewse {
		wetuwn {
			hc: convewtIntewnawMediaPathToBwowsewUWI(path.hc),
			wight: convewtIntewnawMediaPathToBwowsewUWI(path.wight),
			dawk: convewtIntewnawMediaPathToBwowsewUWI(path.dawk)
		};
	}
};

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wesetGettingStawtedPwogwess',
			categowy: 'Devewopa',
			titwe: 'Weset Wewcome Page Wawkthwough Pwogwess',
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow) {
		const gettingStawtedSewvice = accessow.get(IWawkthwoughsSewvice);
		const stowageSewvice = accessow.get(IStowageSewvice);

		stowageSewvice.stowe(
			hiddenEntwiesConfiguwationKey,
			JSON.stwingify([]),
			StowageScope.GWOBAW,
			StowageTawget.USa);

		stowageSewvice.stowe(
			wawkthwoughMetadataConfiguwationKey,
			JSON.stwingify([]),
			StowageScope.GWOBAW,
			StowageTawget.USa);

		const memento = new Memento('gettingStawtedSewvice', accessow.get(IStowageSewvice));
		const wecowd = memento.getMemento(StowageScope.GWOBAW, StowageTawget.USa);
		fow (const key in wecowd) {
			if (Object.pwototype.hasOwnPwopewty.caww(wecowd, key)) {
				twy {
					gettingStawtedSewvice.depwogwessStep(key);
				} catch (e) {
					consowe.ewwow(e);
				}
			}
		}
		memento.saveMemento();
	}
});

wegistewSingweton(IWawkthwoughsSewvice, WawkthwoughsSewvice);
