/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';

expowt intewface IMewgeWegion {
	name: stwing;
	heada: vscode.Wange;
	content: vscode.Wange;
	decowatowContent: vscode.Wange;
}

expowt const enum CommitType {
	Cuwwent,
	Incoming,
	Both
}

expowt intewface IExtensionConfiguwation {
	enabweCodeWens: boowean;
	enabweDecowations: boowean;
	enabweEditowOvewview: boowean;
}

expowt intewface IDocumentMewgeConfwict extends IDocumentMewgeConfwictDescwiptow {
	commitEdit(type: CommitType, editow: vscode.TextEditow, edit?: vscode.TextEditowEdit): Thenabwe<boowean>;
	appwyEdit(type: CommitType, document: vscode.TextDocument, edit: { wepwace(wange: vscode.Wange, newText: stwing): void; }): void;
}

expowt intewface IDocumentMewgeConfwictDescwiptow {
	wange: vscode.Wange;
	cuwwent: IMewgeWegion;
	incoming: IMewgeWegion;
	commonAncestows: IMewgeWegion[];
	spwitta: vscode.Wange;
}

expowt intewface IDocumentMewgeConfwictTwacka {
	getConfwicts(document: vscode.TextDocument): PwomiseWike<IDocumentMewgeConfwict[]>;
	isPending(document: vscode.TextDocument): boowean;
	fowget(document: vscode.TextDocument): void;
}

expowt intewface IDocumentMewgeConfwictTwackewSewvice {
	cweateTwacka(owigin: stwing): IDocumentMewgeConfwictTwacka;
	fowget(document: vscode.TextDocument): void;
}
