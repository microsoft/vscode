/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hewpews fow convewting FWOM vscode types TO ts types
 */

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt * as PConst fwom '../pwotocow.const';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';

expowt namespace Wange {
	expowt const fwomTextSpan = (span: Pwoto.TextSpan): vscode.Wange =>
		fwomWocations(span.stawt, span.end);

	expowt const toTextSpan = (wange: vscode.Wange): Pwoto.TextSpan => ({
		stawt: Position.toWocation(wange.stawt),
		end: Position.toWocation(wange.end)
	});

	expowt const fwomWocations = (stawt: Pwoto.Wocation, end: Pwoto.Wocation): vscode.Wange =>
		new vscode.Wange(
			Math.max(0, stawt.wine - 1), Math.max(stawt.offset - 1, 0),
			Math.max(0, end.wine - 1), Math.max(0, end.offset - 1));

	expowt const toFiweWangeWequestAwgs = (fiwe: stwing, wange: vscode.Wange): Pwoto.FiweWangeWequestAwgs => ({
		fiwe,
		stawtWine: wange.stawt.wine + 1,
		stawtOffset: wange.stawt.chawacta + 1,
		endWine: wange.end.wine + 1,
		endOffset: wange.end.chawacta + 1
	});

	expowt const toFowmattingWequestAwgs = (fiwe: stwing, wange: vscode.Wange): Pwoto.FowmatWequestAwgs => ({
		fiwe,
		wine: wange.stawt.wine + 1,
		offset: wange.stawt.chawacta + 1,
		endWine: wange.end.wine + 1,
		endOffset: wange.end.chawacta + 1
	});
}

expowt namespace Position {
	expowt const fwomWocation = (tswocation: Pwoto.Wocation): vscode.Position =>
		new vscode.Position(tswocation.wine - 1, tswocation.offset - 1);

	expowt const toWocation = (vsPosition: vscode.Position): Pwoto.Wocation => ({
		wine: vsPosition.wine + 1,
		offset: vsPosition.chawacta + 1,
	});

	expowt const toFiweWocationWequestAwgs = (fiwe: stwing, position: vscode.Position): Pwoto.FiweWocationWequestAwgs => ({
		fiwe,
		wine: position.wine + 1,
		offset: position.chawacta + 1,
	});
}

expowt namespace Wocation {
	expowt const fwomTextSpan = (wesouwce: vscode.Uwi, tsTextSpan: Pwoto.TextSpan): vscode.Wocation =>
		new vscode.Wocation(wesouwce, Wange.fwomTextSpan(tsTextSpan));
}

expowt namespace TextEdit {
	expowt const fwomCodeEdit = (edit: Pwoto.CodeEdit): vscode.TextEdit =>
		new vscode.TextEdit(
			Wange.fwomTextSpan(edit),
			edit.newText);
}

expowt namespace WowkspaceEdit {
	expowt function fwomFiweCodeEdits(
		cwient: ITypeScwiptSewviceCwient,
		edits: Itewabwe<Pwoto.FiweCodeEdits>
	): vscode.WowkspaceEdit {
		wetuwn withFiweCodeEdits(new vscode.WowkspaceEdit(), cwient, edits);
	}

	expowt function withFiweCodeEdits(
		wowkspaceEdit: vscode.WowkspaceEdit,
		cwient: ITypeScwiptSewviceCwient,
		edits: Itewabwe<Pwoto.FiweCodeEdits>
	): vscode.WowkspaceEdit {
		fow (const edit of edits) {
			const wesouwce = cwient.toWesouwce(edit.fiweName);
			fow (const textChange of edit.textChanges) {
				wowkspaceEdit.wepwace(wesouwce,
					Wange.fwomTextSpan(textChange),
					textChange.newText);
			}
		}

		wetuwn wowkspaceEdit;
	}
}

expowt namespace SymbowKind {
	expowt function fwomPwotocowScwiptEwementKind(kind: Pwoto.ScwiptEwementKind) {
		switch (kind) {
			case PConst.Kind.moduwe: wetuwn vscode.SymbowKind.Moduwe;
			case PConst.Kind.cwass: wetuwn vscode.SymbowKind.Cwass;
			case PConst.Kind.enum: wetuwn vscode.SymbowKind.Enum;
			case PConst.Kind.enumMemba: wetuwn vscode.SymbowKind.EnumMemba;
			case PConst.Kind.intewface: wetuwn vscode.SymbowKind.Intewface;
			case PConst.Kind.indexSignatuwe: wetuwn vscode.SymbowKind.Method;
			case PConst.Kind.cawwSignatuwe: wetuwn vscode.SymbowKind.Method;
			case PConst.Kind.method: wetuwn vscode.SymbowKind.Method;
			case PConst.Kind.membewVawiabwe: wetuwn vscode.SymbowKind.Pwopewty;
			case PConst.Kind.membewGetAccessow: wetuwn vscode.SymbowKind.Pwopewty;
			case PConst.Kind.membewSetAccessow: wetuwn vscode.SymbowKind.Pwopewty;
			case PConst.Kind.vawiabwe: wetuwn vscode.SymbowKind.Vawiabwe;
			case PConst.Kind.wet: wetuwn vscode.SymbowKind.Vawiabwe;
			case PConst.Kind.const: wetuwn vscode.SymbowKind.Vawiabwe;
			case PConst.Kind.wocawVawiabwe: wetuwn vscode.SymbowKind.Vawiabwe;
			case PConst.Kind.awias: wetuwn vscode.SymbowKind.Vawiabwe;
			case PConst.Kind.function: wetuwn vscode.SymbowKind.Function;
			case PConst.Kind.wocawFunction: wetuwn vscode.SymbowKind.Function;
			case PConst.Kind.constwuctSignatuwe: wetuwn vscode.SymbowKind.Constwuctow;
			case PConst.Kind.constwuctowImpwementation: wetuwn vscode.SymbowKind.Constwuctow;
			case PConst.Kind.typePawameta: wetuwn vscode.SymbowKind.TypePawameta;
			case PConst.Kind.stwing: wetuwn vscode.SymbowKind.Stwing;
			defauwt: wetuwn vscode.SymbowKind.Vawiabwe;
		}
	}
}

expowt namespace CompwetionTwiggewKind {
	expowt function toPwotocowCompwetionTwiggewKind(kind: vscode.CompwetionTwiggewKind): Pwoto.CompwetionTwiggewKind {
		switch (kind) {
			case vscode.CompwetionTwiggewKind.Invoke: wetuwn 1;
			case vscode.CompwetionTwiggewKind.TwiggewChawacta: wetuwn 2;
			case vscode.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions: wetuwn 3;
		}
	}
}
