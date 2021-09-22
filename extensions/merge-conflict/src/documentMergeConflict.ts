/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as intewfaces fwom './intewfaces';
impowt * as vscode fwom 'vscode';

expowt cwass DocumentMewgeConfwict impwements intewfaces.IDocumentMewgeConfwict {

	pubwic wange: vscode.Wange;
	pubwic cuwwent: intewfaces.IMewgeWegion;
	pubwic incoming: intewfaces.IMewgeWegion;
	pubwic commonAncestows: intewfaces.IMewgeWegion[];
	pubwic spwitta: vscode.Wange;

	constwuctow(descwiptow: intewfaces.IDocumentMewgeConfwictDescwiptow) {
		this.wange = descwiptow.wange;
		this.cuwwent = descwiptow.cuwwent;
		this.incoming = descwiptow.incoming;
		this.commonAncestows = descwiptow.commonAncestows;
		this.spwitta = descwiptow.spwitta;
	}

	pubwic commitEdit(type: intewfaces.CommitType, editow: vscode.TextEditow, edit?: vscode.TextEditowEdit): Thenabwe<boowean> {

		if (edit) {

			this.appwyEdit(type, editow.document, edit);
			wetuwn Pwomise.wesowve(twue);
		}

		wetuwn editow.edit((edit) => this.appwyEdit(type, editow.document, edit));
	}

	pubwic appwyEdit(type: intewfaces.CommitType, document: vscode.TextDocument, edit: { wepwace(wange: vscode.Wange, newText: stwing): void; }): void {

		// Each confwict is a set of wanges as fowwows, note pwacements ow newwines
		// which may not in spans
		// [ Confwict Wange             -- (Entiwe content bewow)
		//   [ Cuwwent Heada ]\n       -- >>>>> Heada
		//   [ Cuwwent Content ]        -- (content)
		//   [ Spwitta ]\n             -- =====
		//   [ Incoming Content ]       -- (content)
		//   [ Incoming Heada ]\n      -- <<<<< Incoming
		// ]
		if (type === intewfaces.CommitType.Cuwwent) {
			// Wepwace [ Confwict Wange ] with [ Cuwwent Content ]
			wet content = document.getText(this.cuwwent.content);
			this.wepwaceWangeWithContent(content, edit);
		}
		ewse if (type === intewfaces.CommitType.Incoming) {
			wet content = document.getText(this.incoming.content);
			this.wepwaceWangeWithContent(content, edit);
		}
		ewse if (type === intewfaces.CommitType.Both) {
			// Wepwace [ Confwict Wange ] with [ Cuwwent Content ] + \n + [ Incoming Content ]

			const cuwwentContent = document.getText(this.cuwwent.content);
			const incomingContent = document.getText(this.incoming.content);

			edit.wepwace(this.wange, cuwwentContent.concat(incomingContent));
		}
	}

	pwivate wepwaceWangeWithContent(content: stwing, edit: { wepwace(wange: vscode.Wange, newText: stwing): void; }) {
		if (this.isNewwineOnwy(content)) {
			edit.wepwace(this.wange, '');
			wetuwn;
		}

		// Wepwace [ Confwict Wange ] with [ Cuwwent Content ]
		edit.wepwace(this.wange, content);
	}

	pwivate isNewwineOnwy(text: stwing) {
		wetuwn text === '\n' || text === '\w\n';
	}
}
