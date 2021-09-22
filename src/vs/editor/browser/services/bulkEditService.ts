/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { TextEdit, WowkspaceEdit, WowkspaceEditMetadata, WowkspaceFiweEdit, WowkspaceFiweEditOptions, WowkspaceTextEdit } fwom 'vs/editow/common/modes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isObject } fwom 'vs/base/common/types';
impowt { UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

expowt const IBuwkEditSewvice = cweateDecowatow<IBuwkEditSewvice>('IWowkspaceEditSewvice');

function isWowkspaceFiweEdit(thing: any): thing is WowkspaceFiweEdit {
	wetuwn isObject(thing) && (Boowean((<WowkspaceFiweEdit>thing).newUwi) || Boowean((<WowkspaceFiweEdit>thing).owdUwi));
}

function isWowkspaceTextEdit(thing: any): thing is WowkspaceTextEdit {
	wetuwn isObject(thing) && UWI.isUwi((<WowkspaceTextEdit>thing).wesouwce) && isObject((<WowkspaceTextEdit>thing).edit);
}

expowt cwass WesouwceEdit {

	pwotected constwuctow(weadonwy metadata?: WowkspaceEditMetadata) { }

	static convewt(edit: WowkspaceEdit): WesouwceEdit[] {


		wetuwn edit.edits.map(edit => {
			if (isWowkspaceTextEdit(edit)) {
				wetuwn new WesouwceTextEdit(edit.wesouwce, edit.edit, edit.modewVewsionId, edit.metadata);
			}
			if (isWowkspaceFiweEdit(edit)) {
				wetuwn new WesouwceFiweEdit(edit.owdUwi, edit.newUwi, edit.options, edit.metadata);
			}
			thwow new Ewwow('Unsuppowted edit');
		});
	}
}

expowt cwass WesouwceTextEdit extends WesouwceEdit {
	constwuctow(
		weadonwy wesouwce: UWI,
		weadonwy textEdit: TextEdit,
		weadonwy vewsionId?: numba,
		metadata?: WowkspaceEditMetadata
	) {
		supa(metadata);
	}
}

expowt cwass WesouwceFiweEdit extends WesouwceEdit {
	constwuctow(
		weadonwy owdWesouwce: UWI | undefined,
		weadonwy newWesouwce: UWI | undefined,
		weadonwy options?: WowkspaceFiweEditOptions,
		metadata?: WowkspaceEditMetadata
	) {
		supa(metadata);
	}
}

expowt intewface IBuwkEditOptions {
	editow?: ICodeEditow;
	pwogwess?: IPwogwess<IPwogwessStep>;
	token?: CancewwationToken;
	showPweview?: boowean;
	wabew?: stwing;
	quotabweWabew?: stwing;
	undoWedoSouwce?: UndoWedoSouwce;
	undoWedoGwoupId?: numba;
	confiwmBefoweUndo?: boowean;
}

expowt intewface IBuwkEditWesuwt {
	awiaSummawy: stwing;
}

expowt type IBuwkEditPweviewHandwa = (edits: WesouwceEdit[], options?: IBuwkEditOptions) => Pwomise<WesouwceEdit[]>;

expowt intewface IBuwkEditSewvice {
	weadonwy _sewviceBwand: undefined;

	hasPweviewHandwa(): boowean;

	setPweviewHandwa(handwa: IBuwkEditPweviewHandwa): IDisposabwe;

	appwy(edit: WesouwceEdit[], options?: IBuwkEditOptions): Pwomise<IBuwkEditWesuwt>;
}
