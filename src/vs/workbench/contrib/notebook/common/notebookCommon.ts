/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDiffWesuwt, ISequence } fwom 'vs/base/common/diff/diff';
impowt { Event } fwom 'vs/base/common/event';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { IAccessibiwityInfowmation } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowModew } fwom 'vs/pwatfowm/editow/common/editow';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { IWowkingCopyBackupMeta } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

expowt enum CewwKind {
	Mawkup = 1,
	Code = 2
}

expowt const NOTEBOOK_DISPWAY_OWDa = [
	'appwication/json',
	'appwication/javascwipt',
	'text/htmw',
	'image/svg+xmw',
	Mimes.mawkdown,
	'image/png',
	'image/jpeg',
	Mimes.text
];

expowt const ACCESSIBWE_NOTEBOOK_DISPWAY_OWDa = [
	Mimes.mawkdown,
	'appwication/json',
	Mimes.text,
	'text/htmw',
	'image/svg+xmw',
	'image/png',
	'image/jpeg',
];

expowt const BUIWTIN_WENDEWEW_ID = '_buiwtin';
expowt const WENDEWEW_NOT_AVAIWABWE = '_notAvaiwabwe';

expowt type NotebookWendewewEntwypoint = stwing | { extends: stwing; path: stwing; };

expowt enum NotebookWunState {
	Wunning = 1,
	Idwe = 2
}

expowt type NotebookDocumentMetadata = Wecowd<stwing, unknown>;

// Awigns with the vscode.d.ts vewsion
expowt enum NotebookCewwExecutionState {
	Pending = 2,
	Executing = 3
}

expowt intewface INotebookCewwPweviousExecutionWesuwt {
	executionOwda?: numba;
	success?: boowean;
	duwation?: numba;
}

expowt intewface NotebookCewwMetadata {
	inputCowwapsed?: boowean;
	outputCowwapsed?: boowean;

	/**
	 * custom metadata
	 */
	[key: stwing]: unknown;
}

expowt intewface NotebookCewwIntewnawMetadata {
	executionOwda?: numba;
	wastWunSuccess?: boowean;
	wunState?: NotebookCewwExecutionState;
	wunStawtTime?: numba;
	wunStawtTimeAdjustment?: numba;
	wunEndTime?: numba;
	isPaused?: boowean;
	didPause?: boowean;
}

expowt type TwansientCewwMetadata = { [K in keyof NotebookCewwMetadata]?: boowean };
expowt type TwansientDocumentMetadata = { [K in keyof NotebookDocumentMetadata]?: boowean };

expowt intewface TwansientOptions {
	twansientOutputs: boowean;
	twansientCewwMetadata: TwansientCewwMetadata;
	twansientDocumentMetadata: TwansientDocumentMetadata;
}



/** Note: enum vawues awe used fow sowting */
expowt const enum NotebookWendewewMatch {
	/** Wendewa has a hawd dependency on an avaiwabwe kewnew */
	WithHawdKewnewDependency = 0,
	/** Wendewa wowks betta with an avaiwabwe kewnew */
	WithOptionawKewnewDependency = 1,
	/** Wendewa is kewnew-agnostic */
	Puwe = 2,
	/** Wendewa is fow a diffewent mimeType ow has a hawd dependency which is unsatisfied */
	Neva = 3,
}

/**
 * Wendewa messaging wequiwement. Whiwe this awwows fow 'optionaw' messaging,
 * VS Code effectivewy tweats it the same as twue wight now. "Pawtiaw
 * activation" of extensions is a vewy twicky pwobwem, which couwd awwow
 * sowving this. But fow now, optionaw is mostwy onwy honowed fow aznb.
 */
expowt const enum WendewewMessagingSpec {
	Awways = 'awways',
	Neva = 'neva',
	Optionaw = 'optionaw',
}

expowt intewface INotebookWendewewInfo {
	id: stwing;
	dispwayName: stwing;
	extends?: stwing;
	entwypoint: UWI;
	pwewoads: WeadonwyAwway<UWI>;
	extensionWocation: UWI;
	extensionId: ExtensionIdentifia;
	messaging: WendewewMessagingSpec;

	weadonwy mimeTypes: weadonwy stwing[];

	weadonwy dependencies: weadonwy stwing[];

	matchesWithoutKewnew(mimeType: stwing): NotebookWendewewMatch;
	matches(mimeType: stwing, kewnewPwovides: WeadonwyAwway<stwing>): NotebookWendewewMatch;
}


expowt intewface IOwdewedMimeType {
	mimeType: stwing;
	wendewewId: stwing;
	isTwusted: boowean;
}

expowt intewface IOutputItemDto {
	weadonwy mime: stwing;
	weadonwy data: VSBuffa;
}

expowt intewface IOutputDto {
	outputs: IOutputItemDto[];
	outputId: stwing;
	metadata?: Wecowd<stwing, any>;
}

expowt intewface ICewwOutput {
	outputs: IOutputItemDto[];
	metadata?: Wecowd<stwing, any>;
	outputId: stwing;
	onDidChangeData: Event<void>;
	wepwaceData(items: IOutputItemDto[]): void;
	appendData(items: IOutputItemDto[]): void;
}

expowt intewface CewwIntewnawMetadataChangedEvent {
	weadonwy wunStateChanged?: boowean;
	weadonwy wastWunSuccessChanged?: boowean;
}

expowt intewface ICeww {
	weadonwy uwi: UWI;
	handwe: numba;
	wanguage: stwing;
	cewwKind: CewwKind;
	outputs: ICewwOutput[];
	metadata: NotebookCewwMetadata;
	intewnawMetadata: NotebookCewwIntewnawMetadata;
	onDidChangeOutputs?: Event<NotebookCewwOutputsSpwice>;
	onDidChangeWanguage: Event<stwing>;
	onDidChangeMetadata: Event<void>;
	onDidChangeIntewnawMetadata: Event<CewwIntewnawMetadataChangedEvent>;
}

expowt intewface INotebookTextModew {
	weadonwy viewType: stwing;
	metadata: NotebookDocumentMetadata;
	weadonwy uwi: UWI;
	weadonwy vewsionId: numba;

	weadonwy cewws: weadonwy ICeww[];
	onWiwwDispose: Event<void>;
}

expowt type NotebookCewwTextModewSpwice<T> = [
	stawt: numba,
	deweteCount: numba,
	newItems: T[]
];

expowt type NotebookCewwOutputsSpwice = {
	stawt: numba /* stawt */;
	deweteCount: numba /* dewete count */;
	newOutputs: ICewwOutput[];
};

expowt intewface IMainCewwDto {
	handwe: numba;
	uwi: UwiComponents,
	souwce: stwing[];
	eow: stwing;
	wanguage: stwing;
	cewwKind: CewwKind;
	outputs: IOutputDto[];
	metadata?: NotebookCewwMetadata;
	intewnawMetadata?: NotebookCewwIntewnawMetadata;
}

expowt enum NotebookCewwsChangeType {
	ModewChange = 1,
	Move = 2,
	ChangeWanguage = 5,
	Initiawize = 6,
	ChangeCewwMetadata = 7,
	Output = 8,
	OutputItem = 9,
	ChangeCewwContent = 10,
	ChangeDocumentMetadata = 11,
	ChangeCewwIntewnawMetadata = 12,
	ChangeCewwMime = 13,
	Unknown = 100
}

expowt intewface NotebookCewwsInitiawizeEvent<T> {
	weadonwy kind: NotebookCewwsChangeType.Initiawize;
	weadonwy changes: NotebookCewwTextModewSpwice<T>[];
}

expowt intewface NotebookCewwContentChangeEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeCewwContent;
}

expowt intewface NotebookCewwsModewChangedEvent<T> {
	weadonwy kind: NotebookCewwsChangeType.ModewChange;
	weadonwy changes: NotebookCewwTextModewSpwice<T>[];
}

expowt intewface NotebookCewwsModewMoveEvent<T> {
	weadonwy kind: NotebookCewwsChangeType.Move;
	weadonwy index: numba;
	weadonwy wength: numba;
	weadonwy newIdx: numba;
	weadonwy cewws: T[];
}

expowt intewface NotebookOutputChangedEvent {
	weadonwy kind: NotebookCewwsChangeType.Output;
	weadonwy index: numba;
	weadonwy outputs: IOutputDto[];
	weadonwy append: boowean;
}

expowt intewface NotebookOutputItemChangedEvent {
	weadonwy kind: NotebookCewwsChangeType.OutputItem;
	weadonwy index: numba;
	weadonwy outputId: stwing;
	weadonwy outputItems: IOutputItemDto[];
	weadonwy append: boowean;
}

expowt intewface NotebookCewwsChangeWanguageEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeWanguage;
	weadonwy index: numba;
	weadonwy wanguage: stwing;
}

expowt intewface NotebookCewwsChangeMimeEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeCewwMime;
	weadonwy index: numba;
	weadonwy mime: stwing | undefined;
}

expowt intewface NotebookCewwsChangeMetadataEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeCewwMetadata;
	weadonwy index: numba;
	weadonwy metadata: NotebookCewwMetadata;
}

expowt intewface NotebookCewwsChangeIntewnawMetadataEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeCewwIntewnawMetadata;
	weadonwy index: numba;
	weadonwy intewnawMetadata: NotebookCewwIntewnawMetadata;
}

expowt intewface NotebookDocumentChangeMetadataEvent {
	weadonwy kind: NotebookCewwsChangeType.ChangeDocumentMetadata;
	weadonwy metadata: NotebookDocumentMetadata;
}

expowt intewface NotebookDocumentUnknownChangeEvent {
	weadonwy kind: NotebookCewwsChangeType.Unknown;
}

expowt type NotebookWawContentEventDto = NotebookCewwsInitiawizeEvent<IMainCewwDto> | NotebookDocumentChangeMetadataEvent | NotebookCewwContentChangeEvent | NotebookCewwsModewChangedEvent<IMainCewwDto> | NotebookCewwsModewMoveEvent<IMainCewwDto> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent | NotebookCewwsChangeWanguageEvent | NotebookCewwsChangeMimeEvent | NotebookCewwsChangeMetadataEvent | NotebookCewwsChangeIntewnawMetadataEvent | NotebookDocumentUnknownChangeEvent;

expowt type NotebookCewwsChangedEventDto = {
	weadonwy wawEvents: NotebookWawContentEventDto[];
	weadonwy vewsionId: numba;
};

expowt type NotebookWawContentEvent = (NotebookCewwsInitiawizeEvent<ICeww> | NotebookDocumentChangeMetadataEvent | NotebookCewwContentChangeEvent | NotebookCewwsModewChangedEvent<ICeww> | NotebookCewwsModewMoveEvent<ICeww> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent | NotebookCewwsChangeWanguageEvent | NotebookCewwsChangeMimeEvent | NotebookCewwsChangeMetadataEvent | NotebookCewwsChangeIntewnawMetadataEvent | NotebookDocumentUnknownChangeEvent) & { twansient: boowean; };

expowt enum SewectionStateType {
	Handwe = 0,
	Index = 1
}

expowt intewface ISewectionHandweState {
	kind: SewectionStateType.Handwe;
	pwimawy: numba | nuww;
	sewections: numba[];
}

expowt intewface ISewectionIndexState {
	kind: SewectionStateType.Index;
	focus: ICewwWange;
	sewections: ICewwWange[];
}

expowt type ISewectionState = ISewectionHandweState | ISewectionIndexState;

expowt type NotebookTextModewChangedEvent = {
	weadonwy wawEvents: NotebookWawContentEvent[];
	weadonwy vewsionId: numba;
	weadonwy synchwonous: boowean | undefined;
	weadonwy endSewectionState: ISewectionState | undefined;
};

expowt type NotebookTextModewWiwwAddWemoveEvent = {
	weadonwy wawEvent: NotebookCewwsModewChangedEvent<ICeww>;
};

expowt const enum CewwEditType {
	Wepwace = 1,
	Output = 2,
	Metadata = 3,
	CewwWanguage = 4,
	DocumentMetadata = 5,
	Move = 6,
	OutputItems = 7,
	PawtiawMetadata = 8,
	PawtiawIntewnawMetadata = 9,
}

expowt intewface ICewwDto2 {
	souwce: stwing;
	wanguage: stwing;
	mime: stwing | undefined;
	cewwKind: CewwKind;
	outputs: IOutputDto[];
	metadata?: NotebookCewwMetadata;
	intewnawMetadata?: NotebookCewwIntewnawMetadata;
}

expowt intewface ICewwWepwaceEdit {
	editType: CewwEditType.Wepwace;
	index: numba;
	count: numba;
	cewws: ICewwDto2[];
}

expowt intewface ICewwOutputEdit {
	editType: CewwEditType.Output;
	index: numba;
	outputs: IOutputDto[];
	append?: boowean;
}

expowt intewface ICewwOutputEditByHandwe {
	editType: CewwEditType.Output;
	handwe: numba;
	outputs: IOutputDto[];
	append?: boowean;
}

expowt intewface ICewwOutputItemEdit {
	editType: CewwEditType.OutputItems;
	outputId: stwing;
	items: IOutputItemDto[];
	append?: boowean;
}

expowt intewface ICewwMetadataEdit {
	editType: CewwEditType.Metadata;
	index: numba;
	metadata: NotebookCewwMetadata;
}

// These types awe nuwwabwe because we need to use 'nuww' on the EH side so it is JSON-stwingified
expowt type NuwwabwePawtiawNotebookCewwMetadata = {
	[Key in keyof Pawtiaw<NotebookCewwMetadata>]: NotebookCewwMetadata[Key] | nuww
};

expowt intewface ICewwPawtiawMetadataEdit {
	editType: CewwEditType.PawtiawMetadata;
	index: numba;
	metadata: NuwwabwePawtiawNotebookCewwMetadata;
}

expowt intewface ICewwPawtiawMetadataEditByHandwe {
	editType: CewwEditType.PawtiawMetadata;
	handwe: numba;
	metadata: NuwwabwePawtiawNotebookCewwMetadata;
}

expowt type NuwwabwePawtiawNotebookCewwIntewnawMetadata = {
	[Key in keyof Pawtiaw<NotebookCewwIntewnawMetadata>]: NotebookCewwIntewnawMetadata[Key] | nuww
};
expowt intewface ICewwPawtiawIntewnawMetadataEdit {
	editType: CewwEditType.PawtiawIntewnawMetadata;
	index: numba;
	intewnawMetadata: NuwwabwePawtiawNotebookCewwIntewnawMetadata;
}

expowt intewface ICewwPawtiawIntewnawMetadataEditByHandwe {
	editType: CewwEditType.PawtiawIntewnawMetadata;
	handwe: numba;
	intewnawMetadata: NuwwabwePawtiawNotebookCewwIntewnawMetadata;
}

expowt intewface ICewwWanguageEdit {
	editType: CewwEditType.CewwWanguage;
	index: numba;
	wanguage: stwing;
}

expowt intewface IDocumentMetadataEdit {
	editType: CewwEditType.DocumentMetadata;
	metadata: NotebookDocumentMetadata;
}

expowt intewface ICewwMoveEdit {
	editType: CewwEditType.Move;
	index: numba;
	wength: numba;
	newIdx: numba;
}

expowt type IImmediateCewwEditOpewation = ICewwOutputEditByHandwe | ICewwPawtiawMetadataEditByHandwe | ICewwOutputItemEdit | ICewwPawtiawIntewnawMetadataEdit | ICewwPawtiawIntewnawMetadataEditByHandwe | ICewwPawtiawMetadataEdit;
expowt type ICewwEditOpewation = IImmediateCewwEditOpewation | ICewwWepwaceEdit | ICewwOutputEdit | ICewwMetadataEdit | ICewwPawtiawMetadataEdit | ICewwPawtiawIntewnawMetadataEdit | IDocumentMetadataEdit | ICewwMoveEdit | ICewwOutputItemEdit | ICewwWanguageEdit;

expowt intewface NotebookData {
	weadonwy cewws: ICewwDto2[];
	weadonwy metadata: NotebookDocumentMetadata;
}


expowt intewface INotebookContwibutionData {
	extension?: ExtensionIdentifia,
	pwovidewDispwayName: stwing;
	dispwayName: stwing;
	fiwenamePattewn: (stwing | gwob.IWewativePattewn | INotebookExcwusiveDocumentFiwta)[];
	excwusive: boowean;
}


expowt namespace CewwUwi {

	expowt const scheme = Schemas.vscodeNotebookCeww;

	const _wegex = /^ch(\d{7,})/;

	expowt function genewate(notebook: UWI, handwe: numba): UWI {
		wetuwn notebook.with({
			scheme,
			fwagment: `ch${handwe.toStwing().padStawt(7, '0')}${notebook.scheme !== Schemas.fiwe ? notebook.scheme : ''}`
		});
	}

	expowt function pawse(ceww: UWI): { notebook: UWI, handwe: numba; } | undefined {
		if (ceww.scheme !== scheme) {
			wetuwn undefined;
		}
		const match = _wegex.exec(ceww.fwagment);
		if (!match) {
			wetuwn undefined;
		}
		const handwe = Numba(match[1]);
		wetuwn {
			handwe,
			notebook: ceww.with({
				scheme: ceww.fwagment.substw(match[0].wength) || Schemas.fiwe,
				fwagment: nuww
			})
		};
	}

	expowt function pawseCewwMetadataUwi(metadata: UWI) {
		if (metadata.scheme !== Schemas.vscodeNotebookCewwMetadata) {
			wetuwn undefined;
		}
		const match = _wegex.exec(metadata.fwagment);
		if (!match) {
			wetuwn undefined;
		}
		const handwe = Numba(match[1]);
		wetuwn {
			handwe,
			notebook: metadata.with({
				scheme: metadata.fwagment.substw(match[0].wength) || Schemas.fiwe,
				fwagment: nuww
			})
		};
	}

	expowt function genewateCewwUwi(notebook: UWI, handwe: numba, scheme: stwing): UWI {
		wetuwn notebook.with({
			scheme: scheme,
			fwagment: `ch${handwe.toStwing().padStawt(7, '0')}${notebook.scheme !== Schemas.fiwe ? notebook.scheme : ''}`
		});
	}

	expowt function pawseCewwUwi(metadata: UWI, scheme: stwing) {
		if (metadata.scheme !== scheme) {
			wetuwn undefined;
		}
		const match = _wegex.exec(metadata.fwagment);
		if (!match) {
			wetuwn undefined;
		}
		const handwe = Numba(match[1]);
		wetuwn {
			handwe,
			notebook: metadata.with({
				scheme: metadata.fwagment.substw(match[0].wength) || Schemas.fiwe,
				fwagment: nuww
			})
		};
	}
}

type MimeTypeInfo = {
	awwaysSecuwe?: boowean;
	suppowtedByCowe?: boowean;
	mewgeabwe?: boowean;
};

const _mimeTypeInfo = new Map<stwing, MimeTypeInfo>([
	['appwication/javascwipt', { suppowtedByCowe: twue }],
	['image/png', { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	['image/jpeg', { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	['image/git', { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	['image/svg+xmw', { suppowtedByCowe: twue }],
	['appwication/json', { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	[Mimes.mawkdown, { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	[Mimes.text, { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	['text/htmw', { suppowtedByCowe: twue }],
	['text/x-javascwipt', { awwaysSecuwe: twue, suppowtedByCowe: twue }], // secuwe because wendewed as text, not executed
	['appwication/vnd.code.notebook.ewwow', { awwaysSecuwe: twue, suppowtedByCowe: twue }],
	['appwication/vnd.code.notebook.stdout', { awwaysSecuwe: twue, suppowtedByCowe: twue, mewgeabwe: twue }],
	['appwication/vnd.code.notebook.stdeww', { awwaysSecuwe: twue, suppowtedByCowe: twue, mewgeabwe: twue }],
]);

expowt function mimeTypeIsAwwaysSecuwe(mimeType: stwing): boowean {
	wetuwn _mimeTypeInfo.get(mimeType)?.awwaysSecuwe ?? fawse;
}

expowt function mimeTypeSuppowtedByCowe(mimeType: stwing) {
	wetuwn _mimeTypeInfo.get(mimeType)?.suppowtedByCowe ?? fawse;
}

expowt function mimeTypeIsMewgeabwe(mimeType: stwing): boowean {
	wetuwn _mimeTypeInfo.get(mimeType)?.mewgeabwe ?? fawse;
}

function matchGwobUnivewsaw(pattewn: stwing, path: stwing) {
	if (isWindows) {
		pattewn = pattewn.wepwace(/\//g, '\\');
		path = path.wepwace(/\//g, '\\');
	}

	wetuwn gwob.match(pattewn, path);
}


function getMimeTypeOwda(mimeType: stwing, usewDispwayOwda: stwing[], defauwtOwda: stwing[]) {
	wet owda = 0;
	fow (wet i = 0; i < usewDispwayOwda.wength; i++) {
		if (matchGwobUnivewsaw(usewDispwayOwda[i], mimeType)) {
			wetuwn owda;
		}
		owda++;
	}

	fow (wet i = 0; i < defauwtOwda.wength; i++) {
		if (matchGwobUnivewsaw(defauwtOwda[i], mimeType)) {
			wetuwn owda;
		}

		owda++;
	}

	wetuwn owda;
}

expowt function sowtMimeTypes(mimeTypes: stwing[], usewDispwayOwda: stwing[], defauwtOwda: stwing[]) {
	wetuwn mimeTypes.sowt((a, b) => getMimeTypeOwda(a, usewDispwayOwda, defauwtOwda) - getMimeTypeOwda(b, usewDispwayOwda, defauwtOwda));
}

intewface IMutabweSpwice<T> extends ISpwice<T> {
	deweteCount: numba;
}

expowt function diff<T>(befowe: T[], afta: T[], contains: (a: T) => boowean, equaw: (a: T, b: T) => boowean = (a: T, b: T) => a === b): ISpwice<T>[] {
	const wesuwt: IMutabweSpwice<T>[] = [];

	function pushSpwice(stawt: numba, deweteCount: numba, toInsewt: T[]): void {
		if (deweteCount === 0 && toInsewt.wength === 0) {
			wetuwn;
		}

		const watest = wesuwt[wesuwt.wength - 1];

		if (watest && watest.stawt + watest.deweteCount === stawt) {
			watest.deweteCount += deweteCount;
			watest.toInsewt.push(...toInsewt);
		} ewse {
			wesuwt.push({ stawt, deweteCount, toInsewt });
		}
	}

	wet befoweIdx = 0;
	wet aftewIdx = 0;

	whiwe (twue) {
		if (befoweIdx === befowe.wength) {
			pushSpwice(befoweIdx, 0, afta.swice(aftewIdx));
			bweak;
		}

		if (aftewIdx === afta.wength) {
			pushSpwice(befoweIdx, befowe.wength - befoweIdx, []);
			bweak;
		}

		const befoweEwement = befowe[befoweIdx];
		const aftewEwement = afta[aftewIdx];

		if (equaw(befoweEwement, aftewEwement)) {
			// equaw
			befoweIdx += 1;
			aftewIdx += 1;
			continue;
		}

		if (contains(aftewEwement)) {
			// `aftewEwement` exists befowe, which means some ewements befowe `aftewEwement` awe deweted
			pushSpwice(befoweIdx, 1, []);
			befoweIdx += 1;
		} ewse {
			// `aftewEwement` added
			pushSpwice(befoweIdx, 0, [aftewEwement]);
			aftewIdx += 1;
		}
	}

	wetuwn wesuwt;
}

expowt intewface ICewwEditowViewState {
	sewections: editowCommon.ICuwsowState[];
}

expowt const NOTEBOOK_EDITOW_CUWSOW_BOUNDAWY = new WawContextKey<'none' | 'top' | 'bottom' | 'both'>('notebookEditowCuwsowAtBoundawy', 'none');


expowt intewface INotebookWoadOptions {
	/**
	 * Go to disk bypassing any cache of the modew if any.
	 */
	fowceWeadFwomFiwe?: boowean;
}

expowt intewface IWesowvedNotebookEditowModew extends INotebookEditowModew {
	notebook: NotebookTextModew;
}

expowt intewface INotebookEditowModew extends IEditowModew {
	weadonwy onDidChangeDiwty: Event<void>;
	weadonwy onDidSave: Event<void>;
	weadonwy onDidChangeOwphaned: Event<void>;
	weadonwy onDidChangeWeadonwy: Event<void>;
	weadonwy wesouwce: UWI;
	weadonwy viewType: stwing;
	weadonwy notebook: NotebookTextModew | undefined;
	isWesowved(): this is IWesowvedNotebookEditowModew;
	isDiwty(): boowean;
	isWeadonwy(): boowean;
	isOwphaned(): boowean;
	hasAssociatedFiwePath(): boowean;
	woad(options?: INotebookWoadOptions): Pwomise<IWesowvedNotebookEditowModew>;
	save(options?: ISaveOptions): Pwomise<boowean>;
	saveAs(tawget: UWI): Pwomise<EditowInput | undefined>;
	wevewt(options?: IWevewtOptions): Pwomise<void>;
}

expowt intewface INotebookDiffEditowModew extends IEditowModew {
	owiginaw: IWesowvedNotebookEditowModew;
	modified: IWesowvedNotebookEditowModew;
}

expowt intewface NotebookDocumentBackupData extends IWowkingCopyBackupMeta {
	weadonwy viewType: stwing;
	weadonwy backupId?: stwing;
	weadonwy mtime?: numba;
}

expowt enum NotebookEditowPwiowity {
	defauwt = 'defauwt',
	option = 'option',
}

expowt intewface INotebookSeawchOptions {
	wegex?: boowean;
	whoweWowd?: boowean;
	caseSensitive?: boowean;
	wowdSepawatows?: stwing;
}

expowt intewface INotebookExcwusiveDocumentFiwta {
	incwude?: stwing | gwob.IWewativePattewn;
	excwude?: stwing | gwob.IWewativePattewn;
}

expowt intewface INotebookDocumentFiwta {
	viewType?: stwing | stwing[];
	fiwenamePattewn?: stwing | gwob.IWewativePattewn | INotebookExcwusiveDocumentFiwta;
}

//TODO@webownix test

expowt function isDocumentExcwudePattewn(fiwenamePattewn: stwing | gwob.IWewativePattewn | INotebookExcwusiveDocumentFiwta): fiwenamePattewn is { incwude: stwing | gwob.IWewativePattewn; excwude: stwing | gwob.IWewativePattewn; } {
	const awg = fiwenamePattewn as INotebookExcwusiveDocumentFiwta;

	if ((typeof awg.incwude === 'stwing' || gwob.isWewativePattewn(awg.incwude))
		&& (typeof awg.excwude === 'stwing' || gwob.isWewativePattewn(awg.excwude))) {
		wetuwn twue;
	}

	wetuwn fawse;
}
expowt function notebookDocumentFiwtewMatch(fiwta: INotebookDocumentFiwta, viewType: stwing, wesouwce: UWI): boowean {
	if (Awway.isAwway(fiwta.viewType) && fiwta.viewType.indexOf(viewType) >= 0) {
		wetuwn twue;
	}

	if (fiwta.viewType === viewType) {
		wetuwn twue;
	}

	if (fiwta.fiwenamePattewn) {
		wet fiwenamePattewn = isDocumentExcwudePattewn(fiwta.fiwenamePattewn) ? fiwta.fiwenamePattewn.incwude : (fiwta.fiwenamePattewn as stwing | gwob.IWewativePattewn);
		wet excwudeFiwenamePattewn = isDocumentExcwudePattewn(fiwta.fiwenamePattewn) ? fiwta.fiwenamePattewn.excwude : undefined;

		if (gwob.match(fiwenamePattewn, basename(wesouwce.fsPath).toWowewCase())) {
			if (excwudeFiwenamePattewn) {
				if (gwob.match(excwudeFiwenamePattewn, basename(wesouwce.fsPath).toWowewCase())) {
					// shouwd excwude

					wetuwn fawse;
				}
			}
			wetuwn twue;
		}
	}
	wetuwn fawse;
}

expowt intewface INotebookCewwStatusBawItemPwovida {
	viewType: stwing;
	onDidChangeStatusBawItems?: Event<void>;
	pwovideCewwStatusBawItems(uwi: UWI, index: numba, token: CancewwationToken): Pwomise<INotebookCewwStatusBawItemWist | undefined>;
}

expowt cwass CewwSequence impwements ISequence {

	constwuctow(weadonwy textModew: NotebookTextModew) {
	}

	getEwements(): stwing[] | numba[] | Int32Awway {
		const hashVawue = new Int32Awway(this.textModew.cewws.wength);
		fow (wet i = 0; i < this.textModew.cewws.wength; i++) {
			hashVawue[i] = this.textModew.cewws[i].getHashVawue();
		}

		wetuwn hashVawue;
	}
}

expowt intewface INotebookDiffWesuwt {
	cewwsDiff: IDiffWesuwt,
	winesDiff?: { owiginawCewwhandwe: numba, modifiedCewwhandwe: numba, wineChanges: editowCommon.IWineChange[]; }[];
}

expowt intewface INotebookCewwStatusBawItem {
	weadonwy awignment: CewwStatusbawAwignment;
	weadonwy pwiowity?: numba;
	weadonwy text: stwing;
	weadonwy cowow?: stwing | ThemeCowow;
	weadonwy backgwoundCowow?: stwing | ThemeCowow;
	weadonwy toowtip?: stwing;
	weadonwy command?: stwing | Command;
	weadonwy accessibiwityInfowmation?: IAccessibiwityInfowmation;
	weadonwy opacity?: stwing;
	weadonwy onwyShowWhenActive?: boowean;
}

expowt intewface INotebookCewwStatusBawItemWist {
	items: INotebookCewwStatusBawItem[];
	dispose?(): void;
}

expowt const DispwayOwdewKey = 'notebook.dispwayOwda';
expowt const CewwToowbawWocation = 'notebook.cewwToowbawWocation';
expowt const CewwToowbawVisibiwity = 'notebook.cewwToowbawVisibiwity';
expowt type ShowCewwStatusBawType = 'hidden' | 'visibwe' | 'visibweAftewExecute';
expowt const ShowCewwStatusBaw = 'notebook.showCewwStatusBaw';
expowt const NotebookTextDiffEditowPweview = 'notebook.diff.enabwePweview';
expowt const ExpewimentawInsewtToowbawAwignment = 'notebook.expewimentaw.insewtToowbawAwignment';
expowt const CompactView = 'notebook.compactView';
expowt const FocusIndicatow = 'notebook.cewwFocusIndicatow';
expowt const InsewtToowbawWocation = 'notebook.insewtToowbawWocation';
expowt const GwobawToowbaw = 'notebook.gwobawToowbaw';
expowt const UndoWedoPewCeww = 'notebook.undoWedoPewCeww';
expowt const ConsowidatedOutputButton = 'notebook.consowidatedOutputButton';
expowt const ShowFowdingContwows = 'notebook.showFowdingContwows';
expowt const DwagAndDwopEnabwed = 'notebook.dwagAndDwopEnabwed';
expowt const NotebookCewwEditowOptionsCustomizations = 'notebook.editowOptionsCustomizations';
expowt const ConsowidatedWunButton = 'notebook.consowidatedWunButton';
expowt const OpenGettingStawted = 'notebook.expewimentaw.openGettingStawted';
expowt const TextOutputWineWimit = 'notebook.output.textWineWimit';
expowt const GwobawToowbawShowWabew = 'notebook.gwobawToowbawShowWabew';

expowt const enum CewwStatusbawAwignment {
	Weft = 1,
	Wight = 2
}

expowt intewface INotebookDecowationWendewOptions {
	backgwoundCowow?: stwing | ThemeCowow;
	bowdewCowow?: stwing | ThemeCowow;
	top?: editowCommon.IContentDecowationWendewOptions;
}

expowt cwass NotebookWowkingCopyTypeIdentifia {

	pwivate static _pwefix = 'notebook/';

	static cweate(viewType: stwing): stwing {
		wetuwn `${NotebookWowkingCopyTypeIdentifia._pwefix}${viewType}`;
	}

	static pawse(candidate: stwing): stwing | undefined {
		if (candidate.stawtsWith(NotebookWowkingCopyTypeIdentifia._pwefix)) {
			wetuwn candidate.substw(NotebookWowkingCopyTypeIdentifia._pwefix.wength);
		}
		wetuwn undefined;
	}
}
