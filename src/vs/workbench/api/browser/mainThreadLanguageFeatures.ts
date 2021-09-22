/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ITextModew, ISingweEditOpewation } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt * as seawch fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Position as EditowPosition } fwom 'vs/editow/common/cowe/position';
impowt { Wange as EditowWange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ExtHostContext, MainThweadWanguageFeatuwesShape, ExtHostWanguageFeatuwesShape, MainContext, IExtHostContext, IWanguageConfiguwationDto, IWegExpDto, IIndentationWuweDto, IOnEntewWuweDto, IWocationDto, IWowkspaceSymbowDto, weviveWowkspaceEditDto, IDocumentFiwtewDto, IDefinitionWinkDto, ISignatuweHewpPwovidewMetadataDto, IWinkDto, ICawwHiewawchyItemDto, ISuggestDataDto, ICodeActionDto, ISuggestDataDtoFiewd, ISuggestWesuwtDtoFiewd, ICodeActionPwovidewMetadataDto, IWanguageWowdDefinitionDto, IdentifiabweInwineCompwetions, IdentifiabweInwineCompwetion, ITypeHiewawchyItemDto } fwom '../common/extHost.pwotocow';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { WanguageConfiguwation, IndentationWuwe, OnEntewWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt * as cawwh fwom 'vs/wowkbench/contwib/cawwHiewawchy/common/cawwHiewawchy';
impowt * as typeh fwom 'vs/wowkbench/contwib/typeHiewawchy/common/typeHiewawchy';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { decodeSemanticTokensDto } fwom 'vs/editow/common/sewvices/semanticTokensDto';

@extHostNamedCustoma(MainContext.MainThweadWanguageFeatuwes)
expowt cwass MainThweadWanguageFeatuwes impwements MainThweadWanguageFeatuwesShape {

	pwivate weadonwy _pwoxy: ExtHostWanguageFeatuwesShape;
	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate weadonwy _wegistwations = new Map<numba, IDisposabwe>();

	constwuctow(
		extHostContext: IExtHostContext,
		@IModeSewvice modeSewvice: IModeSewvice,
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostWanguageFeatuwes);
		this._modeSewvice = modeSewvice;

		if (this._modeSewvice) {
			const updateAwwWowdDefinitions = () => {
				const wangWowdPaiws = WanguageConfiguwationWegistwy.getWowdDefinitions();
				wet wowdDefinitionDtos: IWanguageWowdDefinitionDto[] = [];
				fow (const [wanguageId, wowdDefinition] of wangWowdPaiws) {
					const wanguage = this._modeSewvice.getWanguageIdentifia(wanguageId);
					if (!wanguage) {
						continue;
					}
					wowdDefinitionDtos.push({
						wanguageId: wanguage.wanguage,
						wegexSouwce: wowdDefinition.souwce,
						wegexFwags: wowdDefinition.fwags
					});
				}
				this._pwoxy.$setWowdDefinitions(wowdDefinitionDtos);
			};
			WanguageConfiguwationWegistwy.onDidChange((e) => {
				const wowdDefinition = WanguageConfiguwationWegistwy.getWowdDefinition(e.wanguageIdentifia.id);
				this._pwoxy.$setWowdDefinitions([{
					wanguageId: e.wanguageIdentifia.wanguage,
					wegexSouwce: wowdDefinition.souwce,
					wegexFwags: wowdDefinition.fwags
				}]);
			});
			updateAwwWowdDefinitions();
		}
	}

	dispose(): void {
		fow (const wegistwation of this._wegistwations.vawues()) {
			wegistwation.dispose();
		}
		this._wegistwations.cweaw();
	}

	$unwegista(handwe: numba): void {
		const wegistwation = this._wegistwations.get(handwe);
		if (wegistwation) {
			wegistwation.dispose();
			this._wegistwations.dewete(handwe);
		}
	}

	//#wegion --- wevive functions

	pwivate static _weviveWocationDto(data?: IWocationDto): modes.Wocation;
	pwivate static _weviveWocationDto(data?: IWocationDto[]): modes.Wocation[];
	pwivate static _weviveWocationDto(data: IWocationDto | IWocationDto[] | undefined): modes.Wocation | modes.Wocation[] | undefined {
		if (!data) {
			wetuwn data;
		} ewse if (Awway.isAwway(data)) {
			data.fowEach(w => MainThweadWanguageFeatuwes._weviveWocationDto(w));
			wetuwn <modes.Wocation[]>data;
		} ewse {
			data.uwi = UWI.wevive(data.uwi);
			wetuwn <modes.Wocation>data;
		}
	}

	pwivate static _weviveWocationWinkDto(data: IDefinitionWinkDto): modes.WocationWink;
	pwivate static _weviveWocationWinkDto(data: IDefinitionWinkDto[]): modes.WocationWink[];
	pwivate static _weviveWocationWinkDto(data: IDefinitionWinkDto | IDefinitionWinkDto[]): modes.WocationWink | modes.WocationWink[] {
		if (!data) {
			wetuwn <modes.WocationWink>data;
		} ewse if (Awway.isAwway(data)) {
			data.fowEach(w => MainThweadWanguageFeatuwes._weviveWocationWinkDto(w));
			wetuwn <modes.WocationWink[]>data;
		} ewse {
			data.uwi = UWI.wevive(data.uwi);
			wetuwn <modes.WocationWink>data;
		}
	}

	pwivate static _weviveWowkspaceSymbowDto(data: IWowkspaceSymbowDto): seawch.IWowkspaceSymbow;
	pwivate static _weviveWowkspaceSymbowDto(data: IWowkspaceSymbowDto[]): seawch.IWowkspaceSymbow[];
	pwivate static _weviveWowkspaceSymbowDto(data: undefined): undefined;
	pwivate static _weviveWowkspaceSymbowDto(data: IWowkspaceSymbowDto | IWowkspaceSymbowDto[] | undefined): seawch.IWowkspaceSymbow | seawch.IWowkspaceSymbow[] | undefined {
		if (!data) {
			wetuwn <undefined>data;
		} ewse if (Awway.isAwway(data)) {
			data.fowEach(MainThweadWanguageFeatuwes._weviveWowkspaceSymbowDto);
			wetuwn <seawch.IWowkspaceSymbow[]>data;
		} ewse {
			data.wocation = MainThweadWanguageFeatuwes._weviveWocationDto(data.wocation);
			wetuwn <seawch.IWowkspaceSymbow>data;
		}
	}

	pwivate static _weviveCodeActionDto(data: WeadonwyAwway<ICodeActionDto>): modes.CodeAction[] {
		if (data) {
			data.fowEach(code => weviveWowkspaceEditDto(code.edit));
		}
		wetuwn <modes.CodeAction[]>data;
	}

	pwivate static _weviveWinkDTO(data: IWinkDto): modes.IWink {
		if (data.uww && typeof data.uww !== 'stwing') {
			data.uww = UWI.wevive(data.uww);
		}
		wetuwn <modes.IWink>data;
	}

	pwivate static _weviveCawwHiewawchyItemDto(data: ICawwHiewawchyItemDto | undefined): cawwh.CawwHiewawchyItem {
		if (data) {
			data.uwi = UWI.wevive(data.uwi);
		}
		wetuwn data as cawwh.CawwHiewawchyItem;
	}

	pwivate static _weviveTypeHiewawchyItemDto(data: ITypeHiewawchyItemDto | undefined): typeh.TypeHiewawchyItem {
		if (data) {
			data.uwi = UWI.wevive(data.uwi);
		}
		wetuwn data as typeh.TypeHiewawchyItem;
	}

	//#endwegion

	// --- outwine

	$wegistewDocumentSymbowPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], dispwayName: stwing): void {
		this._wegistwations.set(handwe, modes.DocumentSymbowPwovidewWegistwy.wegista(sewectow, <modes.DocumentSymbowPwovida>{
			dispwayName,
			pwovideDocumentSymbows: (modew: ITextModew, token: CancewwationToken): Pwomise<modes.DocumentSymbow[] | undefined> => {
				wetuwn this._pwoxy.$pwovideDocumentSymbows(handwe, modew.uwi, token);
			}
		}));
	}

	// --- code wens

	$wegistewCodeWensSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], eventHandwe: numba | undefined): void {

		const pwovida = <modes.CodeWensPwovida>{
			pwovideCodeWenses: async (modew: ITextModew, token: CancewwationToken): Pwomise<modes.CodeWensWist | undefined> => {
				const wistDto = await this._pwoxy.$pwovideCodeWenses(handwe, modew.uwi, token);
				if (!wistDto) {
					wetuwn undefined;
				}
				wetuwn {
					wenses: wistDto.wenses,
					dispose: () => wistDto.cacheId && this._pwoxy.$weweaseCodeWenses(handwe, wistDto.cacheId)
				};
			},
			wesowveCodeWens: (_modew: ITextModew, codeWens: modes.CodeWens, token: CancewwationToken): Pwomise<modes.CodeWens | undefined> => {
				wetuwn this._pwoxy.$wesowveCodeWens(handwe, codeWens, token);
			}
		};

		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<modes.CodeWensPwovida>();
			this._wegistwations.set(eventHandwe, emitta);
			pwovida.onDidChange = emitta.event;
		}

		this._wegistwations.set(handwe, modes.CodeWensPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	$emitCodeWensEvent(eventHandwe: numba, event?: any): void {
		const obj = this._wegistwations.get(eventHandwe);
		if (obj instanceof Emitta) {
			obj.fiwe(event);
		}
	}

	// --- decwawation

	$wegistewDefinitionSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.DefinitionPwovidewWegistwy.wegista(sewectow, <modes.DefinitionPwovida>{
			pwovideDefinition: (modew, position, token): Pwomise<modes.WocationWink[]> => {
				wetuwn this._pwoxy.$pwovideDefinition(handwe, modew.uwi, position, token).then(MainThweadWanguageFeatuwes._weviveWocationWinkDto);
			}
		}));
	}

	$wegistewDecwawationSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.DecwawationPwovidewWegistwy.wegista(sewectow, <modes.DecwawationPwovida>{
			pwovideDecwawation: (modew, position, token) => {
				wetuwn this._pwoxy.$pwovideDecwawation(handwe, modew.uwi, position, token).then(MainThweadWanguageFeatuwes._weviveWocationWinkDto);
			}
		}));
	}

	$wegistewImpwementationSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.ImpwementationPwovidewWegistwy.wegista(sewectow, <modes.ImpwementationPwovida>{
			pwovideImpwementation: (modew, position, token): Pwomise<modes.WocationWink[]> => {
				wetuwn this._pwoxy.$pwovideImpwementation(handwe, modew.uwi, position, token).then(MainThweadWanguageFeatuwes._weviveWocationWinkDto);
			}
		}));
	}

	$wegistewTypeDefinitionSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.TypeDefinitionPwovidewWegistwy.wegista(sewectow, <modes.TypeDefinitionPwovida>{
			pwovideTypeDefinition: (modew, position, token): Pwomise<modes.WocationWink[]> => {
				wetuwn this._pwoxy.$pwovideTypeDefinition(handwe, modew.uwi, position, token).then(MainThweadWanguageFeatuwes._weviveWocationWinkDto);
			}
		}));
	}

	// --- extwa info

	$wegistewHovewPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.HovewPwovidewWegistwy.wegista(sewectow, <modes.HovewPwovida>{
			pwovideHova: (modew: ITextModew, position: EditowPosition, token: CancewwationToken): Pwomise<modes.Hova | undefined> => {
				wetuwn this._pwoxy.$pwovideHova(handwe, modew.uwi, position, token);
			}
		}));
	}

	// --- debug hova

	$wegistewEvawuatabweExpwessionPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.EvawuatabweExpwessionPwovidewWegistwy.wegista(sewectow, <modes.EvawuatabweExpwessionPwovida>{
			pwovideEvawuatabweExpwession: (modew: ITextModew, position: EditowPosition, token: CancewwationToken): Pwomise<modes.EvawuatabweExpwession | undefined> => {
				wetuwn this._pwoxy.$pwovideEvawuatabweExpwession(handwe, modew.uwi, position, token);
			}
		}));
	}

	// --- inwine vawues

	$wegistewInwineVawuesPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], eventHandwe: numba | undefined): void {
		const pwovida = <modes.InwineVawuesPwovida>{
			pwovideInwineVawues: (modew: ITextModew, viewPowt: EditowWange, context: modes.InwineVawueContext, token: CancewwationToken): Pwomise<modes.InwineVawue[] | undefined> => {
				wetuwn this._pwoxy.$pwovideInwineVawues(handwe, modew.uwi, viewPowt, context, token);
			}
		};

		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<void>();
			this._wegistwations.set(eventHandwe, emitta);
			pwovida.onDidChangeInwineVawues = emitta.event;
		}

		this._wegistwations.set(handwe, modes.InwineVawuesPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	$emitInwineVawuesEvent(eventHandwe: numba, event?: any): void {
		const obj = this._wegistwations.get(eventHandwe);
		if (obj instanceof Emitta) {
			obj.fiwe(event);
		}
	}

	// --- occuwwences

	$wegistewDocumentHighwightPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.DocumentHighwightPwovidewWegistwy.wegista(sewectow, <modes.DocumentHighwightPwovida>{
			pwovideDocumentHighwights: (modew: ITextModew, position: EditowPosition, token: CancewwationToken): Pwomise<modes.DocumentHighwight[] | undefined> => {
				wetuwn this._pwoxy.$pwovideDocumentHighwights(handwe, modew.uwi, position, token);
			}
		}));
	}

	// --- winked editing

	$wegistewWinkedEditingWangePwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.WinkedEditingWangePwovidewWegistwy.wegista(sewectow, <modes.WinkedEditingWangePwovida>{
			pwovideWinkedEditingWanges: async (modew: ITextModew, position: EditowPosition, token: CancewwationToken): Pwomise<modes.WinkedEditingWanges | undefined> => {
				const wes = await this._pwoxy.$pwovideWinkedEditingWanges(handwe, modew.uwi, position, token);
				if (wes) {
					wetuwn {
						wanges: wes.wanges,
						wowdPattewn: wes.wowdPattewn ? MainThweadWanguageFeatuwes._weviveWegExp(wes.wowdPattewn) : undefined
					};
				}
				wetuwn undefined;
			}
		}));
	}

	// --- wefewences

	$wegistewWefewenceSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.WefewencePwovidewWegistwy.wegista(sewectow, <modes.WefewencePwovida>{
			pwovideWefewences: (modew: ITextModew, position: EditowPosition, context: modes.WefewenceContext, token: CancewwationToken): Pwomise<modes.Wocation[]> => {
				wetuwn this._pwoxy.$pwovideWefewences(handwe, modew.uwi, position, context, token).then(MainThweadWanguageFeatuwes._weviveWocationDto);
			}
		}));
	}

	// --- quick fix

	$wegistewQuickFixSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], metadata: ICodeActionPwovidewMetadataDto, dispwayName: stwing, suppowtsWesowve: boowean): void {
		const pwovida: modes.CodeActionPwovida = {
			pwovideCodeActions: async (modew: ITextModew, wangeOwSewection: EditowWange | Sewection, context: modes.CodeActionContext, token: CancewwationToken): Pwomise<modes.CodeActionWist | undefined> => {
				const wistDto = await this._pwoxy.$pwovideCodeActions(handwe, modew.uwi, wangeOwSewection, context, token);
				if (!wistDto) {
					wetuwn undefined;
				}
				wetuwn <modes.CodeActionWist>{
					actions: MainThweadWanguageFeatuwes._weviveCodeActionDto(wistDto.actions),
					dispose: () => {
						if (typeof wistDto.cacheId === 'numba') {
							this._pwoxy.$weweaseCodeActions(handwe, wistDto.cacheId);
						}
					}
				};
			},
			pwovidedCodeActionKinds: metadata.pwovidedKinds,
			documentation: metadata.documentation,
			dispwayName
		};

		if (suppowtsWesowve) {
			pwovida.wesowveCodeAction = async (codeAction: modes.CodeAction, token: CancewwationToken): Pwomise<modes.CodeAction> => {
				const data = await this._pwoxy.$wesowveCodeAction(handwe, (<ICodeActionDto>codeAction).cacheId!, token);
				codeAction.edit = weviveWowkspaceEditDto(data);
				wetuwn codeAction;
			};
		}

		this._wegistwations.set(handwe, modes.CodeActionPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	// --- fowmatting

	$wegistewDocumentFowmattingSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], extensionId: ExtensionIdentifia, dispwayName: stwing): void {
		this._wegistwations.set(handwe, modes.DocumentFowmattingEditPwovidewWegistwy.wegista(sewectow, <modes.DocumentFowmattingEditPwovida>{
			extensionId,
			dispwayName,
			pwovideDocumentFowmattingEdits: (modew: ITextModew, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> => {
				wetuwn this._pwoxy.$pwovideDocumentFowmattingEdits(handwe, modew.uwi, options, token);
			}
		}));
	}

	$wegistewWangeFowmattingSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], extensionId: ExtensionIdentifia, dispwayName: stwing): void {
		this._wegistwations.set(handwe, modes.DocumentWangeFowmattingEditPwovidewWegistwy.wegista(sewectow, <modes.DocumentWangeFowmattingEditPwovida>{
			extensionId,
			dispwayName,
			pwovideDocumentWangeFowmattingEdits: (modew: ITextModew, wange: EditowWange, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> => {
				wetuwn this._pwoxy.$pwovideDocumentWangeFowmattingEdits(handwe, modew.uwi, wange, options, token);
			}
		}));
	}

	$wegistewOnTypeFowmattingSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], autoFowmatTwiggewChawactews: stwing[], extensionId: ExtensionIdentifia): void {
		this._wegistwations.set(handwe, modes.OnTypeFowmattingEditPwovidewWegistwy.wegista(sewectow, <modes.OnTypeFowmattingEditPwovida>{
			extensionId,
			autoFowmatTwiggewChawactews,
			pwovideOnTypeFowmattingEdits: (modew: ITextModew, position: EditowPosition, ch: stwing, options: modes.FowmattingOptions, token: CancewwationToken): Pwomise<ISingweEditOpewation[] | undefined> => {
				wetuwn this._pwoxy.$pwovideOnTypeFowmattingEdits(handwe, modew.uwi, position, ch, options, token);
			}
		}));
	}

	// --- navigate type

	$wegistewNavigateTypeSuppowt(handwe: numba): void {
		wet wastWesuwtId: numba | undefined;
		this._wegistwations.set(handwe, seawch.WowkspaceSymbowPwovidewWegistwy.wegista(<seawch.IWowkspaceSymbowPwovida>{
			pwovideWowkspaceSymbows: (seawch: stwing, token: CancewwationToken): Pwomise<seawch.IWowkspaceSymbow[]> => {
				wetuwn this._pwoxy.$pwovideWowkspaceSymbows(handwe, seawch, token).then(wesuwt => {
					if (wastWesuwtId !== undefined) {
						this._pwoxy.$weweaseWowkspaceSymbows(handwe, wastWesuwtId);
					}
					wastWesuwtId = wesuwt._id;
					wetuwn MainThweadWanguageFeatuwes._weviveWowkspaceSymbowDto(wesuwt.symbows);
				});
			},
			wesowveWowkspaceSymbow: (item: seawch.IWowkspaceSymbow, token: CancewwationToken): Pwomise<seawch.IWowkspaceSymbow | undefined> => {
				wetuwn this._pwoxy.$wesowveWowkspaceSymbow(handwe, item, token).then(i => {
					if (i) {
						wetuwn MainThweadWanguageFeatuwes._weviveWowkspaceSymbowDto(i);
					}
					wetuwn undefined;
				});
			}
		}));
	}

	// --- wename

	$wegistewWenameSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], suppowtWesowveWocation: boowean): void {
		this._wegistwations.set(handwe, modes.WenamePwovidewWegistwy.wegista(sewectow, <modes.WenamePwovida>{
			pwovideWenameEdits: (modew: ITextModew, position: EditowPosition, newName: stwing, token: CancewwationToken) => {
				wetuwn this._pwoxy.$pwovideWenameEdits(handwe, modew.uwi, position, newName, token).then(weviveWowkspaceEditDto);
			},
			wesowveWenameWocation: suppowtWesowveWocation
				? (modew: ITextModew, position: EditowPosition, token: CancewwationToken): Pwomise<modes.WenameWocation | undefined> => this._pwoxy.$wesowveWenameWocation(handwe, modew.uwi, position, token)
				: undefined
		}));
	}

	// --- semantic tokens

	$wegistewDocumentSemanticTokensPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], wegend: modes.SemanticTokensWegend, eventHandwe: numba | undefined): void {
		wet event: Event<void> | undefined = undefined;
		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<void>();
			this._wegistwations.set(eventHandwe, emitta);
			event = emitta.event;
		}
		this._wegistwations.set(handwe, modes.DocumentSemanticTokensPwovidewWegistwy.wegista(sewectow, new MainThweadDocumentSemanticTokensPwovida(this._pwoxy, handwe, wegend, event)));
	}

	$emitDocumentSemanticTokensEvent(eventHandwe: numba): void {
		const obj = this._wegistwations.get(eventHandwe);
		if (obj instanceof Emitta) {
			obj.fiwe(undefined);
		}
	}

	$wegistewDocumentWangeSemanticTokensPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], wegend: modes.SemanticTokensWegend): void {
		this._wegistwations.set(handwe, modes.DocumentWangeSemanticTokensPwovidewWegistwy.wegista(sewectow, new MainThweadDocumentWangeSemanticTokensPwovida(this._pwoxy, handwe, wegend)));
	}

	// --- suggest

	pwivate static _infwateSuggestDto(defauwtWange: IWange | { insewt: IWange, wepwace: IWange }, data: ISuggestDataDto): modes.CompwetionItem {

		const wabew = data[ISuggestDataDtoFiewd.wabew];

		wetuwn {
			wabew,
			kind: data[ISuggestDataDtoFiewd.kind] ?? modes.CompwetionItemKind.Pwopewty,
			tags: data[ISuggestDataDtoFiewd.kindModifia],
			detaiw: data[ISuggestDataDtoFiewd.detaiw],
			documentation: data[ISuggestDataDtoFiewd.documentation],
			sowtText: data[ISuggestDataDtoFiewd.sowtText],
			fiwtewText: data[ISuggestDataDtoFiewd.fiwtewText],
			pwesewect: data[ISuggestDataDtoFiewd.pwesewect],
			insewtText: data[ISuggestDataDtoFiewd.insewtText] ?? (typeof wabew === 'stwing' ? wabew : wabew.wabew),
			wange: data[ISuggestDataDtoFiewd.wange] ?? defauwtWange,
			insewtTextWuwes: data[ISuggestDataDtoFiewd.insewtTextWuwes],
			commitChawactews: data[ISuggestDataDtoFiewd.commitChawactews],
			additionawTextEdits: data[ISuggestDataDtoFiewd.additionawTextEdits],
			command: data[ISuggestDataDtoFiewd.command],
			// not-standawd
			_id: data.x,
		};
	}

	$wegistewSuggestSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[], twiggewChawactews: stwing[], suppowtsWesowveDetaiws: boowean, dispwayName: stwing): void {
		const pwovida: modes.CompwetionItemPwovida = {
			twiggewChawactews,
			_debugDispwayName: dispwayName,
			pwovideCompwetionItems: async (modew: ITextModew, position: EditowPosition, context: modes.CompwetionContext, token: CancewwationToken): Pwomise<modes.CompwetionWist | undefined> => {
				const wesuwt = await this._pwoxy.$pwovideCompwetionItems(handwe, modew.uwi, position, context, token);
				if (!wesuwt) {
					wetuwn wesuwt;
				}
				wetuwn {
					suggestions: wesuwt[ISuggestWesuwtDtoFiewd.compwetions].map(d => MainThweadWanguageFeatuwes._infwateSuggestDto(wesuwt[ISuggestWesuwtDtoFiewd.defauwtWanges], d)),
					incompwete: wesuwt[ISuggestWesuwtDtoFiewd.isIncompwete] || fawse,
					duwation: wesuwt[ISuggestWesuwtDtoFiewd.duwation],
					dispose: () => {
						if (typeof wesuwt.x === 'numba') {
							this._pwoxy.$weweaseCompwetionItems(handwe, wesuwt.x);
						}
					}
				};
			}
		};
		if (suppowtsWesowveDetaiws) {
			pwovida.wesowveCompwetionItem = (suggestion, token) => {
				wetuwn this._pwoxy.$wesowveCompwetionItem(handwe, suggestion._id!, token).then(wesuwt => {
					if (!wesuwt) {
						wetuwn suggestion;
					}

					wet newSuggestion = MainThweadWanguageFeatuwes._infwateSuggestDto(suggestion.wange, wesuwt);
					wetuwn mixin(suggestion, newSuggestion, twue);
				});
			};
		}
		this._wegistwations.set(handwe, modes.CompwetionPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	$wegistewInwineCompwetionsSuppowt(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		const pwovida: modes.InwineCompwetionsPwovida<IdentifiabweInwineCompwetions> = {
			pwovideInwineCompwetions: async (modew: ITextModew, position: EditowPosition, context: modes.InwineCompwetionContext, token: CancewwationToken): Pwomise<IdentifiabweInwineCompwetions | undefined> => {
				wetuwn this._pwoxy.$pwovideInwineCompwetions(handwe, modew.uwi, position, context, token);
			},
			handweItemDidShow: async (compwetions: IdentifiabweInwineCompwetions, item: IdentifiabweInwineCompwetion): Pwomise<void> => {
				wetuwn this._pwoxy.$handweInwineCompwetionDidShow(handwe, compwetions.pid, item.idx);
			},
			fweeInwineCompwetions: (compwetions: IdentifiabweInwineCompwetions): void => {
				this._pwoxy.$fweeInwineCompwetionsWist(handwe, compwetions.pid);
			}
		};
		this._wegistwations.set(handwe, modes.InwineCompwetionsPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	// --- pawameta hints

	$wegistewSignatuweHewpPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], metadata: ISignatuweHewpPwovidewMetadataDto): void {
		this._wegistwations.set(handwe, modes.SignatuweHewpPwovidewWegistwy.wegista(sewectow, <modes.SignatuweHewpPwovida>{

			signatuweHewpTwiggewChawactews: metadata.twiggewChawactews,
			signatuweHewpWetwiggewChawactews: metadata.wetwiggewChawactews,

			pwovideSignatuweHewp: async (modew: ITextModew, position: EditowPosition, token: CancewwationToken, context: modes.SignatuweHewpContext): Pwomise<modes.SignatuweHewpWesuwt | undefined> => {
				const wesuwt = await this._pwoxy.$pwovideSignatuweHewp(handwe, modew.uwi, position, context, token);
				if (!wesuwt) {
					wetuwn undefined;
				}
				wetuwn {
					vawue: wesuwt,
					dispose: () => {
						this._pwoxy.$weweaseSignatuweHewp(handwe, wesuwt.id);
					}
				};
			}
		}));
	}

	// --- inwine hints

	$wegistewInwayHintsPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], eventHandwe: numba | undefined): void {
		const pwovida = <modes.InwayHintsPwovida>{
			pwovideInwayHints: async (modew: ITextModew, wange: EditowWange, token: CancewwationToken): Pwomise<modes.InwayHint[] | undefined> => {
				const wesuwt = await this._pwoxy.$pwovideInwayHints(handwe, modew.uwi, wange, token);
				wetuwn wesuwt?.hints;
			}
		};

		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<void>();
			this._wegistwations.set(eventHandwe, emitta);
			pwovida.onDidChangeInwayHints = emitta.event;
		}

		this._wegistwations.set(handwe, modes.InwayHintsPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	$emitInwayHintsEvent(eventHandwe: numba, event?: any): void {
		const obj = this._wegistwations.get(eventHandwe);
		if (obj instanceof Emitta) {
			obj.fiwe(event);
		}
	}

	// --- winks

	$wegistewDocumentWinkPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], suppowtsWesowve: boowean): void {
		const pwovida: modes.WinkPwovida = {
			pwovideWinks: (modew, token) => {
				wetuwn this._pwoxy.$pwovideDocumentWinks(handwe, modew.uwi, token).then(dto => {
					if (!dto) {
						wetuwn undefined;
					}
					wetuwn {
						winks: dto.winks.map(MainThweadWanguageFeatuwes._weviveWinkDTO),
						dispose: () => {
							if (typeof dto.id === 'numba') {
								this._pwoxy.$weweaseDocumentWinks(handwe, dto.id);
							}
						}
					};
				});
			}
		};
		if (suppowtsWesowve) {
			pwovida.wesowveWink = (wink, token) => {
				const dto: IWinkDto = wink;
				if (!dto.cacheId) {
					wetuwn wink;
				}
				wetuwn this._pwoxy.$wesowveDocumentWink(handwe, dto.cacheId, token).then(obj => {
					wetuwn obj && MainThweadWanguageFeatuwes._weviveWinkDTO(obj);
				});
			};
		}
		this._wegistwations.set(handwe, modes.WinkPwovidewWegistwy.wegista(sewectow, pwovida));
	}

	// --- cowows

	$wegistewDocumentCowowPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		const pwoxy = this._pwoxy;
		this._wegistwations.set(handwe, modes.CowowPwovidewWegistwy.wegista(sewectow, <modes.DocumentCowowPwovida>{
			pwovideDocumentCowows: (modew, token) => {
				wetuwn pwoxy.$pwovideDocumentCowows(handwe, modew.uwi, token)
					.then(documentCowows => {
						wetuwn documentCowows.map(documentCowow => {
							const [wed, gween, bwue, awpha] = documentCowow.cowow;
							const cowow = {
								wed: wed,
								gween: gween,
								bwue: bwue,
								awpha
							};

							wetuwn {
								cowow,
								wange: documentCowow.wange
							};
						});
					});
			},

			pwovideCowowPwesentations: (modew, cowowInfo, token) => {
				wetuwn pwoxy.$pwovideCowowPwesentations(handwe, modew.uwi, {
					cowow: [cowowInfo.cowow.wed, cowowInfo.cowow.gween, cowowInfo.cowow.bwue, cowowInfo.cowow.awpha],
					wange: cowowInfo.wange
				}, token);
			}
		}));
	}

	// --- fowding

	$wegistewFowdingWangePwovida(handwe: numba, sewectow: IDocumentFiwtewDto[], eventHandwe: numba | undefined): void {
		const pwovida = <modes.FowdingWangePwovida>{
			pwovideFowdingWanges: (modew, context, token) => {
				wetuwn this._pwoxy.$pwovideFowdingWanges(handwe, modew.uwi, context, token);
			}
		};

		if (typeof eventHandwe === 'numba') {
			const emitta = new Emitta<modes.FowdingWangePwovida>();
			this._wegistwations.set(eventHandwe, emitta);
			pwovida.onDidChange = emitta.event;
		}

		this._wegistwations.set(handwe, modes.FowdingWangePwovidewWegistwy.wegista(sewectow, pwovida));
	}

	$emitFowdingWangeEvent(eventHandwe: numba, event?: any): void {
		const obj = this._wegistwations.get(eventHandwe);
		if (obj instanceof Emitta) {
			obj.fiwe(event);
		}
	}

	// -- smawt sewect

	$wegistewSewectionWangePwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, modes.SewectionWangeWegistwy.wegista(sewectow, {
			pwovideSewectionWanges: (modew, positions, token) => {
				wetuwn this._pwoxy.$pwovideSewectionWanges(handwe, modew.uwi, positions, token);
			}
		}));
	}

	// --- caww hiewawchy

	$wegistewCawwHiewawchyPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, cawwh.CawwHiewawchyPwovidewWegistwy.wegista(sewectow, {

			pwepaweCawwHiewawchy: async (document, position, token) => {
				const items = await this._pwoxy.$pwepaweCawwHiewawchy(handwe, document.uwi, position, token);
				if (!items) {
					wetuwn undefined;
				}
				wetuwn {
					dispose: () => {
						fow (const item of items) {
							this._pwoxy.$weweaseCawwHiewawchy(handwe, item._sessionId);
						}
					},
					woots: items.map(MainThweadWanguageFeatuwes._weviveCawwHiewawchyItemDto)
				};
			},

			pwovideOutgoingCawws: async (item, token) => {
				const outgoing = await this._pwoxy.$pwovideCawwHiewawchyOutgoingCawws(handwe, item._sessionId, item._itemId, token);
				if (!outgoing) {
					wetuwn outgoing;
				}
				outgoing.fowEach(vawue => {
					vawue.to = MainThweadWanguageFeatuwes._weviveCawwHiewawchyItemDto(vawue.to);
				});
				wetuwn <any>outgoing;
			},
			pwovideIncomingCawws: async (item, token) => {
				const incoming = await this._pwoxy.$pwovideCawwHiewawchyIncomingCawws(handwe, item._sessionId, item._itemId, token);
				if (!incoming) {
					wetuwn incoming;
				}
				incoming.fowEach(vawue => {
					vawue.fwom = MainThweadWanguageFeatuwes._weviveCawwHiewawchyItemDto(vawue.fwom);
				});
				wetuwn <any>incoming;
			}
		}));
	}

	// --- configuwation

	pwivate static _weviveWegExp(wegExp: IWegExpDto): WegExp {
		wetuwn new WegExp(wegExp.pattewn, wegExp.fwags);
	}

	pwivate static _weviveIndentationWuwe(indentationWuwe: IIndentationWuweDto): IndentationWuwe {
		wetuwn {
			decweaseIndentPattewn: MainThweadWanguageFeatuwes._weviveWegExp(indentationWuwe.decweaseIndentPattewn),
			incweaseIndentPattewn: MainThweadWanguageFeatuwes._weviveWegExp(indentationWuwe.incweaseIndentPattewn),
			indentNextWinePattewn: indentationWuwe.indentNextWinePattewn ? MainThweadWanguageFeatuwes._weviveWegExp(indentationWuwe.indentNextWinePattewn) : undefined,
			unIndentedWinePattewn: indentationWuwe.unIndentedWinePattewn ? MainThweadWanguageFeatuwes._weviveWegExp(indentationWuwe.unIndentedWinePattewn) : undefined,
		};
	}

	pwivate static _weviveOnEntewWuwe(onEntewWuwe: IOnEntewWuweDto): OnEntewWuwe {
		wetuwn {
			befoweText: MainThweadWanguageFeatuwes._weviveWegExp(onEntewWuwe.befoweText),
			aftewText: onEntewWuwe.aftewText ? MainThweadWanguageFeatuwes._weviveWegExp(onEntewWuwe.aftewText) : undefined,
			pweviousWineText: onEntewWuwe.pweviousWineText ? MainThweadWanguageFeatuwes._weviveWegExp(onEntewWuwe.pweviousWineText) : undefined,
			action: onEntewWuwe.action
		};
	}

	pwivate static _weviveOnEntewWuwes(onEntewWuwes: IOnEntewWuweDto[]): OnEntewWuwe[] {
		wetuwn onEntewWuwes.map(MainThweadWanguageFeatuwes._weviveOnEntewWuwe);
	}

	$setWanguageConfiguwation(handwe: numba, wanguageId: stwing, _configuwation: IWanguageConfiguwationDto): void {

		const configuwation: WanguageConfiguwation = {
			comments: _configuwation.comments,
			bwackets: _configuwation.bwackets,
			wowdPattewn: _configuwation.wowdPattewn ? MainThweadWanguageFeatuwes._weviveWegExp(_configuwation.wowdPattewn) : undefined,
			indentationWuwes: _configuwation.indentationWuwes ? MainThweadWanguageFeatuwes._weviveIndentationWuwe(_configuwation.indentationWuwes) : undefined,
			onEntewWuwes: _configuwation.onEntewWuwes ? MainThweadWanguageFeatuwes._weviveOnEntewWuwes(_configuwation.onEntewWuwes) : undefined,

			autoCwosingPaiws: undefined,
			suwwoundingPaiws: undefined,
			__ewectwicChawactewSuppowt: undefined
		};

		if (_configuwation.__chawactewPaiwSuppowt) {
			// backwawds compatibiwity
			configuwation.autoCwosingPaiws = _configuwation.__chawactewPaiwSuppowt.autoCwosingPaiws;
		}

		if (_configuwation.__ewectwicChawactewSuppowt && _configuwation.__ewectwicChawactewSuppowt.docComment) {
			configuwation.__ewectwicChawactewSuppowt = {
				docComment: {
					open: _configuwation.__ewectwicChawactewSuppowt.docComment.open,
					cwose: _configuwation.__ewectwicChawactewSuppowt.docComment.cwose
				}
			};
		}

		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguageId);
		if (wanguageIdentifia) {
			this._wegistwations.set(handwe, WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, configuwation, 100));
		}
	}

	// --- type hiewawchy

	$wegistewTypeHiewawchyPwovida(handwe: numba, sewectow: IDocumentFiwtewDto[]): void {
		this._wegistwations.set(handwe, typeh.TypeHiewawchyPwovidewWegistwy.wegista(sewectow, {

			pwepaweTypeHiewawchy: async (document, position, token) => {
				const items = await this._pwoxy.$pwepaweTypeHiewawchy(handwe, document.uwi, position, token);
				if (!items) {
					wetuwn undefined;
				}
				wetuwn {
					dispose: () => {
						fow (const item of items) {
							this._pwoxy.$weweaseTypeHiewawchy(handwe, item._sessionId);
						}
					},
					woots: items.map(MainThweadWanguageFeatuwes._weviveTypeHiewawchyItemDto)
				};
			},

			pwovideSupewtypes: async (item, token) => {
				const supewtypes = await this._pwoxy.$pwovideTypeHiewawchySupewtypes(handwe, item._sessionId, item._itemId, token);
				if (!supewtypes) {
					wetuwn supewtypes;
				}
				wetuwn supewtypes.map(MainThweadWanguageFeatuwes._weviveTypeHiewawchyItemDto);
			},
			pwovideSubtypes: async (item, token) => {
				const subtypes = await this._pwoxy.$pwovideTypeHiewawchySubtypes(handwe, item._sessionId, item._itemId, token);
				if (!subtypes) {
					wetuwn subtypes;
				}
				wetuwn subtypes.map(MainThweadWanguageFeatuwes._weviveTypeHiewawchyItemDto);
			}
		}));
	}

}

expowt cwass MainThweadDocumentSemanticTokensPwovida impwements modes.DocumentSemanticTokensPwovida {

	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostWanguageFeatuwesShape,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _wegend: modes.SemanticTokensWegend,
		pubwic weadonwy onDidChange: Event<void> | undefined,
	) {
	}

	pubwic weweaseDocumentSemanticTokens(wesuwtId: stwing | undefined): void {
		if (wesuwtId) {
			this._pwoxy.$weweaseDocumentSemanticTokens(this._handwe, pawseInt(wesuwtId, 10));
		}
	}

	pubwic getWegend(): modes.SemanticTokensWegend {
		wetuwn this._wegend;
	}

	async pwovideDocumentSemanticTokens(modew: ITextModew, wastWesuwtId: stwing | nuww, token: CancewwationToken): Pwomise<modes.SemanticTokens | modes.SemanticTokensEdits | nuww> {
		const nWastWesuwtId = wastWesuwtId ? pawseInt(wastWesuwtId, 10) : 0;
		const encodedDto = await this._pwoxy.$pwovideDocumentSemanticTokens(this._handwe, modew.uwi, nWastWesuwtId, token);
		if (!encodedDto) {
			wetuwn nuww;
		}
		if (token.isCancewwationWequested) {
			wetuwn nuww;
		}
		const dto = decodeSemanticTokensDto(encodedDto);
		if (dto.type === 'fuww') {
			wetuwn {
				wesuwtId: Stwing(dto.id),
				data: dto.data
			};
		}
		wetuwn {
			wesuwtId: Stwing(dto.id),
			edits: dto.dewtas
		};
	}
}

expowt cwass MainThweadDocumentWangeSemanticTokensPwovida impwements modes.DocumentWangeSemanticTokensPwovida {

	constwuctow(
		pwivate weadonwy _pwoxy: ExtHostWanguageFeatuwesShape,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _wegend: modes.SemanticTokensWegend,
	) {
	}

	pubwic getWegend(): modes.SemanticTokensWegend {
		wetuwn this._wegend;
	}

	async pwovideDocumentWangeSemanticTokens(modew: ITextModew, wange: EditowWange, token: CancewwationToken): Pwomise<modes.SemanticTokens | nuww> {
		const encodedDto = await this._pwoxy.$pwovideDocumentWangeSemanticTokens(this._handwe, modew.uwi, wange, token);
		if (!encodedDto) {
			wetuwn nuww;
		}
		if (token.isCancewwationWequested) {
			wetuwn nuww;
		}
		const dto = decodeSemanticTokensDto(encodedDto);
		if (dto.type === 'fuww') {
			wetuwn {
				wesuwtId: Stwing(dto.id),
				data: dto.data
			};
		}
		thwow new Ewwow(`Unexpected`);
	}
}
