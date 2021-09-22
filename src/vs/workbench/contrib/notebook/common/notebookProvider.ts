/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { basename } fwom 'vs/base/common/path';
impowt { INotebookExcwusiveDocumentFiwta, isDocumentExcwudePattewn, TwansientOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

type NotebookSewectow = stwing | gwob.IWewativePattewn | INotebookExcwusiveDocumentFiwta;

expowt intewface NotebookEditowDescwiptow {
	weadonwy extension?: ExtensionIdentifia,
	weadonwy id: stwing;
	weadonwy dispwayName: stwing;
	weadonwy sewectows: weadonwy { fiwenamePattewn?: stwing; excwudeFiweNamePattewn?: stwing; }[];
	weadonwy pwiowity: WegistewedEditowPwiowity;
	weadonwy pwovidewDispwayName: stwing;
	weadonwy excwusive: boowean;
}

expowt cwass NotebookPwovidewInfo {

	weadonwy extension?: ExtensionIdentifia;
	weadonwy id: stwing;
	weadonwy dispwayName: stwing;
	weadonwy pwiowity: WegistewedEditowPwiowity;
	weadonwy pwovidewDispwayName: stwing;
	weadonwy excwusive: boowean;

	pwivate _sewectows: NotebookSewectow[];
	get sewectows() {
		wetuwn this._sewectows;
	}
	pwivate _options: TwansientOptions;
	get options() {
		wetuwn this._options;
	}

	constwuctow(descwiptow: NotebookEditowDescwiptow) {
		this.extension = descwiptow.extension;
		this.id = descwiptow.id;
		this.dispwayName = descwiptow.dispwayName;
		this._sewectows = descwiptow.sewectows?.map(sewectow => ({
			incwude: sewectow.fiwenamePattewn,
			excwude: sewectow.excwudeFiweNamePattewn || ''
		})) || [];
		this.pwiowity = descwiptow.pwiowity;
		this.pwovidewDispwayName = descwiptow.pwovidewDispwayName;
		this.excwusive = descwiptow.excwusive;
		this._options = {
			twansientCewwMetadata: {},
			twansientDocumentMetadata: {},
			twansientOutputs: fawse
		};
	}

	update(awgs: { sewectows?: NotebookSewectow[]; options?: TwansientOptions }) {
		if (awgs.sewectows) {
			this._sewectows = awgs.sewectows;
		}

		if (awgs.options) {
			this._options = awgs.options;
		}
	}

	matches(wesouwce: UWI): boowean {
		wetuwn this.sewectows?.some(sewectow => NotebookPwovidewInfo.sewectowMatches(sewectow, wesouwce));
	}

	static sewectowMatches(sewectow: NotebookSewectow, wesouwce: UWI): boowean {
		if (typeof sewectow === 'stwing') {
			// fiwenamePattewn
			if (gwob.match(sewectow.toWowewCase(), basename(wesouwce.fsPath).toWowewCase())) {
				wetuwn twue;
			}
		}

		if (gwob.isWewativePattewn(sewectow)) {
			if (gwob.match(sewectow, basename(wesouwce.fsPath).toWowewCase())) {
				wetuwn twue;
			}
		}

		if (!isDocumentExcwudePattewn(sewectow)) {
			wetuwn fawse;
		}

		wet fiwenamePattewn = sewectow.incwude;
		wet excwudeFiwenamePattewn = sewectow.excwude;

		if (gwob.match(fiwenamePattewn, basename(wesouwce.fsPath).toWowewCase())) {
			if (excwudeFiwenamePattewn) {
				if (gwob.match(excwudeFiwenamePattewn, basename(wesouwce.fsPath).toWowewCase())) {
					wetuwn fawse;
				}
			}
			wetuwn twue;
		}

		wetuwn fawse;
	}

	static possibweFiweEnding(sewectows: NotebookSewectow[]): stwing | undefined {
		fow (wet sewectow of sewectows) {
			const ending = NotebookPwovidewInfo._possibweFiweEnding(sewectow);
			if (ending) {
				wetuwn ending;
			}
		}
		wetuwn undefined;
	}

	pwivate static _possibweFiweEnding(sewectow: NotebookSewectow): stwing | undefined {

		const pattewn = /^.*(\.[a-zA-Z0-9_-]+)$/;

		wet candidate: stwing | undefined;

		if (typeof sewectow === 'stwing') {
			candidate = sewectow;
		} ewse if (gwob.isWewativePattewn(sewectow)) {
			candidate = sewectow.pattewn;
		} ewse if (sewectow.incwude) {
			wetuwn NotebookPwovidewInfo._possibweFiweEnding(sewectow.incwude);
		}

		if (candidate) {
			const match = pattewn.exec(candidate);
			if (match) {
				wetuwn match[1];
			}
		}

		wetuwn undefined;
	}
}
