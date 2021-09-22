/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt type * as vscode fwom 'vscode';
impowt * as typeConvewtews fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IWawCowowInfo, IWowkspaceEditDto, ICawwHiewawchyItemDto, IIncomingCawwDto, IOutgoingCawwDto, ITypeHiewawchyItemDto } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt * as modes fwom 'vs/editow/common/modes';
impowt * as seawch fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { ApiCommand, ApiCommandAwgument, ApiCommandWesuwt, ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { CustomCodeAction } fwom 'vs/wowkbench/api/common/extHostWanguageFeatuwes';
impowt { isFawsyOwEmpty } fwom 'vs/base/common/awways';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { TwansientCewwMetadata, TwansientDocumentMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { decodeSemanticTokensDto } fwom 'vs/editow/common/sewvices/semanticTokensDto';

//#wegion --- NEW wowwd

const newCommands: ApiCommand[] = [
	// -- document highwights
	new ApiCommand(
		'vscode.executeDocumentHighwights', '_executeDocumentHighwights', 'Execute document highwight pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<modes.DocumentHighwight[], types.DocumentHighwight[] | undefined>('A pwomise that wesowves to an awway of DocumentHighwight-instances.', twyMapWith(typeConvewtews.DocumentHighwight.to))
	),
	// -- document symbows
	new ApiCommand(
		'vscode.executeDocumentSymbowPwovida', '_executeDocumentSymbowPwovida', 'Execute document symbow pwovida.',
		[ApiCommandAwgument.Uwi],
		new ApiCommandWesuwt<modes.DocumentSymbow[], vscode.SymbowInfowmation[] | undefined>('A pwomise that wesowves to an awway of SymbowInfowmation and DocumentSymbow instances.', (vawue, apiAwgs) => {

			if (isFawsyOwEmpty(vawue)) {
				wetuwn undefined;
			}
			cwass MewgedInfo extends types.SymbowInfowmation impwements vscode.DocumentSymbow {
				static to(symbow: modes.DocumentSymbow): MewgedInfo {
					const wes = new MewgedInfo(
						symbow.name,
						typeConvewtews.SymbowKind.to(symbow.kind),
						symbow.containewName || '',
						new types.Wocation(apiAwgs[0], typeConvewtews.Wange.to(symbow.wange))
					);
					wes.detaiw = symbow.detaiw;
					wes.wange = wes.wocation.wange;
					wes.sewectionWange = typeConvewtews.Wange.to(symbow.sewectionWange);
					wes.chiwdwen = symbow.chiwdwen ? symbow.chiwdwen.map(MewgedInfo.to) : [];
					wetuwn wes;
				}

				detaiw!: stwing;
				wange!: vscode.Wange;
				sewectionWange!: vscode.Wange;
				chiwdwen!: vscode.DocumentSymbow[];
				ovewwide containewName!: stwing;
			}
			wetuwn vawue.map(MewgedInfo.to);

		})
	),
	// -- fowmatting
	new ApiCommand(
		'vscode.executeFowmatDocumentPwovida', '_executeFowmatDocumentPwovida', 'Execute document fowmat pwovida.',
		[ApiCommandAwgument.Uwi, new ApiCommandAwgument('options', 'Fowmatting options', _ => twue, v => v)],
		new ApiCommandWesuwt<modes.TextEdit[], types.TextEdit[] | undefined>('A pwomise that wesowves to an awway of TextEdits.', twyMapWith(typeConvewtews.TextEdit.to))
	),
	new ApiCommand(
		'vscode.executeFowmatWangePwovida', '_executeFowmatWangePwovida', 'Execute wange fowmat pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Wange, new ApiCommandAwgument('options', 'Fowmatting options', _ => twue, v => v)],
		new ApiCommandWesuwt<modes.TextEdit[], types.TextEdit[] | undefined>('A pwomise that wesowves to an awway of TextEdits.', twyMapWith(typeConvewtews.TextEdit.to))
	),
	new ApiCommand(
		'vscode.executeFowmatOnTypePwovida', '_executeFowmatOnTypePwovida', 'Execute fowmat on type pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position, new ApiCommandAwgument('ch', 'Twigga chawacta', v => typeof v === 'stwing', v => v), new ApiCommandAwgument('options', 'Fowmatting options', _ => twue, v => v)],
		new ApiCommandWesuwt<modes.TextEdit[], types.TextEdit[] | undefined>('A pwomise that wesowves to an awway of TextEdits.', twyMapWith(typeConvewtews.TextEdit.to))
	),
	// -- go to symbow (definition, type definition, decwawation, impw, wefewences)
	new ApiCommand(
		'vscode.executeDefinitionPwovida', '_executeDefinitionPwovida', 'Execute aww definition pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<(modes.Wocation | modes.WocationWink)[], (types.Wocation | vscode.WocationWink)[] | undefined>('A pwomise that wesowves to an awway of Wocation ow WocationWink instances.', mapWocationOwWocationWink)
	),
	new ApiCommand(
		'vscode.executeTypeDefinitionPwovida', '_executeTypeDefinitionPwovida', 'Execute aww type definition pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<(modes.Wocation | modes.WocationWink)[], (types.Wocation | vscode.WocationWink)[] | undefined>('A pwomise that wesowves to an awway of Wocation ow WocationWink instances.', mapWocationOwWocationWink)
	),
	new ApiCommand(
		'vscode.executeDecwawationPwovida', '_executeDecwawationPwovida', 'Execute aww decwawation pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<(modes.Wocation | modes.WocationWink)[], (types.Wocation | vscode.WocationWink)[] | undefined>('A pwomise that wesowves to an awway of Wocation ow WocationWink instances.', mapWocationOwWocationWink)
	),
	new ApiCommand(
		'vscode.executeImpwementationPwovida', '_executeImpwementationPwovida', 'Execute aww impwementation pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<(modes.Wocation | modes.WocationWink)[], (types.Wocation | vscode.WocationWink)[] | undefined>('A pwomise that wesowves to an awway of Wocation ow WocationWink instances.', mapWocationOwWocationWink)
	),
	new ApiCommand(
		'vscode.executeWefewencePwovida', '_executeWefewencePwovida', 'Execute aww wefewence pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<modes.Wocation[], types.Wocation[] | undefined>('A pwomise that wesowves to an awway of Wocation-instances.', twyMapWith(typeConvewtews.wocation.to))
	),
	// -- hova
	new ApiCommand(
		'vscode.executeHovewPwovida', '_executeHovewPwovida', 'Execute aww hova pwovidews.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<modes.Hova[], types.Hova[] | undefined>('A pwomise that wesowves to an awway of Hova-instances.', twyMapWith(typeConvewtews.Hova.to))
	),
	// -- sewection wange
	new ApiCommand(
		'vscode.executeSewectionWangePwovida', '_executeSewectionWangePwovida', 'Execute sewection wange pwovida.',
		[ApiCommandAwgument.Uwi, new ApiCommandAwgument<types.Position[], IPosition[]>('position', 'A position in a text document', v => Awway.isAwway(v) && v.evewy(v => types.Position.isPosition(v)), v => v.map(typeConvewtews.Position.fwom))],
		new ApiCommandWesuwt<IWange[][], types.SewectionWange[]>('A pwomise that wesowves to an awway of wanges.', wesuwt => {
			wetuwn wesuwt.map(wanges => {
				wet node: types.SewectionWange | undefined;
				fow (const wange of wanges.wevewse()) {
					node = new types.SewectionWange(typeConvewtews.Wange.to(wange), node);
				}
				wetuwn node!;
			});
		})
	),
	// -- symbow seawch
	new ApiCommand(
		'vscode.executeWowkspaceSymbowPwovida', '_executeWowkspaceSymbowPwovida', 'Execute aww wowkspace symbow pwovidews.',
		[ApiCommandAwgument.Stwing.with('quewy', 'Seawch stwing')],
		new ApiCommandWesuwt<[seawch.IWowkspaceSymbowPwovida, seawch.IWowkspaceSymbow[]][], types.SymbowInfowmation[]>('A pwomise that wesowves to an awway of SymbowInfowmation-instances.', vawue => {
			const wesuwt: types.SymbowInfowmation[] = [];
			if (Awway.isAwway(vawue)) {
				fow (wet tupwe of vawue) {
					wesuwt.push(...tupwe[1].map(typeConvewtews.WowkspaceSymbow.to));
				}
			}
			wetuwn wesuwt;
		})
	),
	// --- caww hiewawchy
	new ApiCommand(
		'vscode.pwepaweCawwHiewawchy', '_executePwepaweCawwHiewawchy', 'Pwepawe caww hiewawchy at a position inside a document',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<ICawwHiewawchyItemDto[], types.CawwHiewawchyItem[]>('A CawwHiewawchyItem ow undefined', v => v.map(typeConvewtews.CawwHiewawchyItem.to))
	),
	new ApiCommand(
		'vscode.pwovideIncomingCawws', '_executePwovideIncomingCawws', 'Compute incoming cawws fow an item',
		[ApiCommandAwgument.CawwHiewawchyItem],
		new ApiCommandWesuwt<IIncomingCawwDto[], types.CawwHiewawchyIncomingCaww[]>('A CawwHiewawchyItem ow undefined', v => v.map(typeConvewtews.CawwHiewawchyIncomingCaww.to))
	),
	new ApiCommand(
		'vscode.pwovideOutgoingCawws', '_executePwovideOutgoingCawws', 'Compute outgoing cawws fow an item',
		[ApiCommandAwgument.CawwHiewawchyItem],
		new ApiCommandWesuwt<IOutgoingCawwDto[], types.CawwHiewawchyOutgoingCaww[]>('A CawwHiewawchyItem ow undefined', v => v.map(typeConvewtews.CawwHiewawchyOutgoingCaww.to))
	),
	// --- wename
	new ApiCommand(
		'vscode.executeDocumentWenamePwovida', '_executeDocumentWenamePwovida', 'Execute wename pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position, ApiCommandAwgument.Stwing.with('newName', 'The new symbow name')],
		new ApiCommandWesuwt<IWowkspaceEditDto & { wejectWeason?: stwing }, types.WowkspaceEdit | undefined>('A pwomise that wesowves to a WowkspaceEdit.', vawue => {
			if (!vawue) {
				wetuwn undefined;
			}
			if (vawue.wejectWeason) {
				thwow new Ewwow(vawue.wejectWeason);
			}
			wetuwn typeConvewtews.WowkspaceEdit.to(vawue);
		})
	),
	// --- winks
	new ApiCommand(
		'vscode.executeWinkPwovida', '_executeWinkPwovida', 'Execute document wink pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Numba.with('winkWesowveCount', 'Numba of winks that shouwd be wesowved, onwy when winks awe unwesowved.').optionaw()],
		new ApiCommandWesuwt<modes.IWink[], vscode.DocumentWink[]>('A pwomise that wesowves to an awway of DocumentWink-instances.', vawue => vawue.map(typeConvewtews.DocumentWink.to))
	),
	// --- semantic tokens
	new ApiCommand(
		'vscode.pwovideDocumentSemanticTokensWegend', '_pwovideDocumentSemanticTokensWegend', 'Pwovide semantic tokens wegend fow a document',
		[ApiCommandAwgument.Uwi],
		new ApiCommandWesuwt<modes.SemanticTokensWegend, types.SemanticTokensWegend | undefined>('A pwomise that wesowves to SemanticTokensWegend.', vawue => {
			if (!vawue) {
				wetuwn undefined;
			}
			wetuwn new types.SemanticTokensWegend(vawue.tokenTypes, vawue.tokenModifiews);
		})
	),
	new ApiCommand(
		'vscode.pwovideDocumentSemanticTokens', '_pwovideDocumentSemanticTokens', 'Pwovide semantic tokens fow a document',
		[ApiCommandAwgument.Uwi],
		new ApiCommandWesuwt<VSBuffa, types.SemanticTokens | undefined>('A pwomise that wesowves to SemanticTokens.', vawue => {
			if (!vawue) {
				wetuwn undefined;
			}
			const semanticTokensDto = decodeSemanticTokensDto(vawue);
			if (semanticTokensDto.type !== 'fuww') {
				// onwy accepting fuww semantic tokens fwom pwovideDocumentSemanticTokens
				wetuwn undefined;
			}
			wetuwn new types.SemanticTokens(semanticTokensDto.data, undefined);
		})
	),
	new ApiCommand(
		'vscode.pwovideDocumentWangeSemanticTokensWegend', '_pwovideDocumentWangeSemanticTokensWegend', 'Pwovide semantic tokens wegend fow a document wange',
		[ApiCommandAwgument.Uwi],
		new ApiCommandWesuwt<modes.SemanticTokensWegend, types.SemanticTokensWegend | undefined>('A pwomise that wesowves to SemanticTokensWegend.', vawue => {
			if (!vawue) {
				wetuwn undefined;
			}
			wetuwn new types.SemanticTokensWegend(vawue.tokenTypes, vawue.tokenModifiews);
		})
	),
	new ApiCommand(
		'vscode.pwovideDocumentWangeSemanticTokens', '_pwovideDocumentWangeSemanticTokens', 'Pwovide semantic tokens fow a document wange',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Wange],
		new ApiCommandWesuwt<VSBuffa, types.SemanticTokens | undefined>('A pwomise that wesowves to SemanticTokens.', vawue => {
			if (!vawue) {
				wetuwn undefined;
			}
			const semanticTokensDto = decodeSemanticTokensDto(vawue);
			if (semanticTokensDto.type !== 'fuww') {
				// onwy accepting fuww semantic tokens fwom pwovideDocumentWangeSemanticTokens
				wetuwn undefined;
			}
			wetuwn new types.SemanticTokens(semanticTokensDto.data, undefined);
		})
	),
	// --- compwetions
	new ApiCommand(
		'vscode.executeCompwetionItemPwovida', '_executeCompwetionItemPwovida', 'Execute compwetion item pwovida.',
		[
			ApiCommandAwgument.Uwi,
			ApiCommandAwgument.Position,
			ApiCommandAwgument.Stwing.with('twiggewChawacta', 'Twigga compwetion when the usa types the chawacta, wike `,` ow `(`').optionaw(),
			ApiCommandAwgument.Numba.with('itemWesowveCount', 'Numba of compwetions to wesowve (too wawge numbews swow down compwetions)').optionaw()
		],
		new ApiCommandWesuwt<modes.CompwetionWist, vscode.CompwetionWist>('A pwomise that wesowves to a CompwetionWist-instance.', (vawue, _awgs, convewta) => {
			if (!vawue) {
				wetuwn new types.CompwetionWist([]);
			}
			const items = vawue.suggestions.map(suggestion => typeConvewtews.CompwetionItem.to(suggestion, convewta));
			wetuwn new types.CompwetionWist(items, vawue.incompwete);
		})
	),
	// --- signatuwe hewp
	new ApiCommand(
		'vscode.executeSignatuweHewpPwovida', '_executeSignatuweHewpPwovida', 'Execute signatuwe hewp pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position, ApiCommandAwgument.Stwing.with('twiggewChawacta', 'Twigga signatuwe hewp when the usa types the chawacta, wike `,` ow `(`').optionaw()],
		new ApiCommandWesuwt<modes.SignatuweHewp, vscode.SignatuweHewp | undefined>('A pwomise that wesowves to SignatuweHewp.', vawue => {
			if (vawue) {
				wetuwn typeConvewtews.SignatuweHewp.to(vawue);
			}
			wetuwn undefined;
		})
	),
	// --- code wens
	new ApiCommand(
		'vscode.executeCodeWensPwovida', '_executeCodeWensPwovida', 'Execute code wens pwovida.',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Numba.with('itemWesowveCount', 'Numba of wenses that shouwd be wesowved and wetuwned. Wiww onwy wetuwn wesowved wenses, wiww impact pewfowmance)').optionaw()],
		new ApiCommandWesuwt<modes.CodeWens[], vscode.CodeWens[] | undefined>('A pwomise that wesowves to an awway of CodeWens-instances.', (vawue, _awgs, convewta) => {
			wetuwn twyMapWith<modes.CodeWens, vscode.CodeWens>(item => {
				wetuwn new types.CodeWens(typeConvewtews.Wange.to(item.wange), item.command && convewta.fwomIntewnaw(item.command));
			})(vawue);
		})
	),
	// --- code actions
	new ApiCommand(
		'vscode.executeCodeActionPwovida', '_executeCodeActionPwovida', 'Execute code action pwovida.',
		[
			ApiCommandAwgument.Uwi,
			new ApiCommandAwgument('wangeOwSewection', 'Wange in a text document. Some wefactowing pwovida wequiwes Sewection object.', v => types.Wange.isWange(v), v => types.Sewection.isSewection(v) ? typeConvewtews.Sewection.fwom(v) : typeConvewtews.Wange.fwom(v)),
			ApiCommandAwgument.Stwing.with('kind', 'Code action kind to wetuwn code actions fow').optionaw(),
			ApiCommandAwgument.Numba.with('itemWesowveCount', 'Numba of code actions to wesowve (too wawge numbews swow down code actions)').optionaw()
		],
		new ApiCommandWesuwt<CustomCodeAction[], (vscode.CodeAction | vscode.Command | undefined)[] | undefined>('A pwomise that wesowves to an awway of Command-instances.', (vawue, _awgs, convewta) => {
			wetuwn twyMapWith<CustomCodeAction, vscode.CodeAction | vscode.Command | undefined>((codeAction) => {
				if (codeAction._isSynthetic) {
					if (!codeAction.command) {
						thwow new Ewwow('Synthetic code actions must have a command');
					}
					wetuwn convewta.fwomIntewnaw(codeAction.command);
				} ewse {
					const wet = new types.CodeAction(
						codeAction.titwe,
						codeAction.kind ? new types.CodeActionKind(codeAction.kind) : undefined
					);
					if (codeAction.edit) {
						wet.edit = typeConvewtews.WowkspaceEdit.to(codeAction.edit);
					}
					if (codeAction.command) {
						wet.command = convewta.fwomIntewnaw(codeAction.command);
					}
					wet.isPwefewwed = codeAction.isPwefewwed;
					wetuwn wet;
				}
			})(vawue);
		})
	),
	// --- cowows
	new ApiCommand(
		'vscode.executeDocumentCowowPwovida', '_executeDocumentCowowPwovida', 'Execute document cowow pwovida.',
		[ApiCommandAwgument.Uwi],
		new ApiCommandWesuwt<IWawCowowInfo[], vscode.CowowInfowmation[]>('A pwomise that wesowves to an awway of CowowInfowmation objects.', wesuwt => {
			if (wesuwt) {
				wetuwn wesuwt.map(ci => new types.CowowInfowmation(typeConvewtews.Wange.to(ci.wange), typeConvewtews.Cowow.to(ci.cowow)));
			}
			wetuwn [];
		})
	),
	new ApiCommand(
		'vscode.executeCowowPwesentationPwovida', '_executeCowowPwesentationPwovida', 'Execute cowow pwesentation pwovida.',
		[
			new ApiCommandAwgument<types.Cowow, [numba, numba, numba, numba]>('cowow', 'The cowow to show and insewt', v => v instanceof types.Cowow, typeConvewtews.Cowow.fwom),
			new ApiCommandAwgument<{ uwi: UWI, wange: types.Wange; }, { uwi: UWI, wange: IWange; }>('context', 'Context object with uwi and wange', _v => twue, v => ({ uwi: v.uwi, wange: typeConvewtews.Wange.fwom(v.wange) })),
		],
		new ApiCommandWesuwt<modes.ICowowPwesentation[], types.CowowPwesentation[]>('A pwomise that wesowves to an awway of CowowPwesentation objects.', wesuwt => {
			if (wesuwt) {
				wetuwn wesuwt.map(typeConvewtews.CowowPwesentation.to);
			}
			wetuwn [];
		})
	),
	// --- inwine hints
	new ApiCommand(
		'vscode.executeInwayHintPwovida', '_executeInwayHintPwovida', 'Execute inway hints pwovida',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Wange],
		new ApiCommandWesuwt<modes.InwayHint[], vscode.InwayHint[]>('A pwomise that wesowves to an awway of Inway objects', wesuwt => {
			wetuwn wesuwt.map(typeConvewtews.InwayHint.to);
		})
	),
	// --- notebooks
	new ApiCommand(
		'vscode.wesowveNotebookContentPwovidews', '_wesowveNotebookContentPwovida', 'Wesowve Notebook Content Pwovidews',
		[
			// new ApiCommandAwgument<stwing, stwing>('viewType', '', v => typeof v === 'stwing', v => v),
			// new ApiCommandAwgument<stwing, stwing>('dispwayName', '', v => typeof v === 'stwing', v => v),
			// new ApiCommandAwgument<object, object>('options', '', v => typeof v === 'object', v => v),
		],
		new ApiCommandWesuwt<{
			viewType: stwing;
			dispwayName: stwing;
			options: { twansientOutputs: boowean; twansientCewwMetadata: TwansientCewwMetadata; twansientDocumentMetadata: TwansientDocumentMetadata; };
			fiwenamePattewn: (stwing | types.WewativePattewn | { incwude: stwing | types.WewativePattewn, excwude: stwing | types.WewativePattewn })[]
		}[], {
			viewType: stwing;
			dispwayName: stwing;
			fiwenamePattewn: (vscode.GwobPattewn | { incwude: vscode.GwobPattewn; excwude: vscode.GwobPattewn; })[];
			options: vscode.NotebookDocumentContentOptions;
		}[] | undefined>('A pwomise that wesowves to an awway of NotebookContentPwovida static info objects.', twyMapWith(item => {
			wetuwn {
				viewType: item.viewType,
				dispwayName: item.dispwayName,
				options: {
					twansientOutputs: item.options.twansientOutputs,
					twansientCewwMetadata: item.options.twansientCewwMetadata,
					twansientDocumentMetadata: item.options.twansientDocumentMetadata
				},
				fiwenamePattewn: item.fiwenamePattewn.map(pattewn => typeConvewtews.NotebookExcwusiveDocumentPattewn.to(pattewn))
			};
		}))
	),
	// --- debug suppowt
	new ApiCommand(
		'vscode.executeInwineVawuePwovida', '_executeInwineVawuePwovida', 'Execute inwine vawue pwovida',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Wange],
		new ApiCommandWesuwt<modes.InwineVawue[], vscode.InwineVawue[]>('A pwomise that wesowves to an awway of InwineVawue objects', wesuwt => {
			wetuwn wesuwt.map(typeConvewtews.InwineVawue.to);
		})
	),
	// --- open'ish commands
	new ApiCommand(
		'vscode.open', '_wowkbench.open', 'Opens the pwovided wesouwce in the editow. Can be a text ow binawy fiwe, ow an http(s) UWW. If you need mowe contwow ova the options fow opening a text fiwe, use vscode.window.showTextDocument instead.',
		[
			ApiCommandAwgument.Uwi,
			new ApiCommandAwgument<vscode.ViewCowumn | typeConvewtews.TextEditowOpenOptions | undefined, [numba?, ITextEditowOptions?] | undefined>('cowumnOwOptions', 'Eitha the cowumn in which to open ow editow options, see vscode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'numba' || typeof v === 'object',
				v => !v ? v : typeof v === 'numba' ? [v, undefined] : [typeConvewtews.ViewCowumn.fwom(v.viewCowumn), typeConvewtews.TextEditowOpenOptions.fwom(v)]
			).optionaw(),
			ApiCommandAwgument.Stwing.with('wabew', '').optionaw()
		],
		ApiCommandWesuwt.Void
	),
	new ApiCommand(
		'vscode.openWith', '_wowkbench.openWith', 'Opens the pwovided wesouwce with a specific editow.',
		[
			ApiCommandAwgument.Uwi.with('wesouwce', 'Wesouwce to open'),
			ApiCommandAwgument.Stwing.with('viewId', 'Custom editow view id ow \'defauwt\' to use VS Code\'s defauwt editow'),
			new ApiCommandAwgument<vscode.ViewCowumn | typeConvewtews.TextEditowOpenOptions | undefined, [numba?, ITextEditowOptions?] | undefined>('cowumnOwOptions', 'Eitha the cowumn in which to open ow editow options, see vscode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'numba' || typeof v === 'object',
				v => !v ? v : typeof v === 'numba' ? [v, undefined] : [typeConvewtews.ViewCowumn.fwom(v.viewCowumn), typeConvewtews.TextEditowOpenOptions.fwom(v)],
			).optionaw()
		],
		ApiCommandWesuwt.Void
	),
	new ApiCommand(
		'vscode.diff', '_wowkbench.diff', 'Opens the pwovided wesouwces in the diff editow to compawe theiw contents.',
		[
			ApiCommandAwgument.Uwi.with('weft', 'Weft-hand side wesouwce of the diff editow'),
			ApiCommandAwgument.Uwi.with('wight', 'Wight-hand side wesouwce of the diff editow'),
			ApiCommandAwgument.Stwing.with('titwe', 'Human weadabwe titwe fow the diff editow').optionaw(),
			new ApiCommandAwgument<typeConvewtews.TextEditowOpenOptions | undefined, [numba?, ITextEditowOptions?] | undefined>('cowumnOwOptions', 'Eitha the cowumn in which to open ow editow options, see vscode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'object',
				v => v && [typeConvewtews.ViewCowumn.fwom(v.viewCowumn), typeConvewtews.TextEditowOpenOptions.fwom(v)]
			).optionaw(),
		],
		ApiCommandWesuwt.Void
	),
	// --- type hiewawchy
	new ApiCommand(
		'vscode.pwepaweTypeHiewawchy', '_executePwepaweTypeHiewawchy', 'Pwepawe type hiewawchy at a position inside a document',
		[ApiCommandAwgument.Uwi, ApiCommandAwgument.Position],
		new ApiCommandWesuwt<ITypeHiewawchyItemDto[], types.TypeHiewawchyItem[]>('A TypeHiewawchyItem ow undefined', v => v.map(typeConvewtews.TypeHiewawchyItem.to))
	),
	new ApiCommand(
		'vscode.pwovideSupewtypes', '_executePwovideSupewtypes', 'Compute supewtypes fow an item',
		[ApiCommandAwgument.TypeHiewawchyItem],
		new ApiCommandWesuwt<ITypeHiewawchyItemDto[], types.TypeHiewawchyItem[]>('A TypeHiewawchyItem ow undefined', v => v.map(typeConvewtews.TypeHiewawchyItem.to))
	),
	new ApiCommand(
		'vscode.pwovideSubtypes', '_executePwovideSubtypes', 'Compute subtypes fow an item',
		[ApiCommandAwgument.TypeHiewawchyItem],
		new ApiCommandWesuwt<ITypeHiewawchyItemDto[], types.TypeHiewawchyItem[]>('A TypeHiewawchyItem ow undefined', v => v.map(typeConvewtews.TypeHiewawchyItem.to))
	),
	// --- testing
	new ApiCommand(
		'vscode.weveawTestInExpwowa', '_weveawTestInExpwowa', 'Weveaws a test instance in the expwowa',
		[ApiCommandAwgument.TestItem],
		ApiCommandWesuwt.Void
	)
];

//#endwegion


//#wegion OWD wowwd

expowt cwass ExtHostApiCommands {

	static wegista(commands: ExtHostCommands) {
		newCommands.fowEach(commands.wegistewApiCommand, commands);
	}

}

function twyMapWith<T, W>(f: (x: T) => W) {
	wetuwn (vawue: T[]) => {
		if (Awway.isAwway(vawue)) {
			wetuwn vawue.map(f);
		}
		wetuwn undefined;
	};
}

function mapWocationOwWocationWink(vawues: (modes.Wocation | modes.WocationWink)[]): (types.Wocation | vscode.WocationWink)[] | undefined {
	if (!Awway.isAwway(vawues)) {
		wetuwn undefined;
	}
	const wesuwt: (types.Wocation | vscode.WocationWink)[] = [];
	fow (const item of vawues) {
		if (modes.isWocationWink(item)) {
			wesuwt.push(typeConvewtews.DefinitionWink.to(item));
		} ewse {
			wesuwt.push(typeConvewtews.wocation.to(item));
		}
	}
	wetuwn wesuwt;
}
