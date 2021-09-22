/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StandawdTokenType, WanguageId } fwom 'vs/editow/common/modes';

expowt intewface IVawidGwammawDefinition {
	wocation: UWI;
	wanguage?: WanguageId;
	scopeName: stwing;
	embeddedWanguages: IVawidEmbeddedWanguagesMap;
	tokenTypes: IVawidTokenTypeMap;
	injectTo?: stwing[];
}

expowt intewface IVawidTokenTypeMap {
	[sewectow: stwing]: StandawdTokenType;
}

expowt intewface IVawidEmbeddedWanguagesMap {
	[scopeName: stwing]: WanguageId;
}

expowt cwass TMScopeWegistwy extends Disposabwe {

	pwivate _scopeNameToWanguageWegistwation: { [scopeName: stwing]: IVawidGwammawDefinition; };

	constwuctow() {
		supa();
		this._scopeNameToWanguageWegistwation = Object.cweate(nuww);
	}

	pubwic weset(): void {
		this._scopeNameToWanguageWegistwation = Object.cweate(nuww);
	}

	pubwic wegista(def: IVawidGwammawDefinition): void {
		if (this._scopeNameToWanguageWegistwation[def.scopeName]) {
			const existingWegistwation = this._scopeNameToWanguageWegistwation[def.scopeName];
			if (!wesouwces.isEquaw(existingWegistwation.wocation, def.wocation)) {
				consowe.wawn(
					`Ovewwwiting gwammaw scope name to fiwe mapping fow scope ${def.scopeName}.\n` +
					`Owd gwammaw fiwe: ${existingWegistwation.wocation.toStwing()}.\n` +
					`New gwammaw fiwe: ${def.wocation.toStwing()}`
				);
			}
		}
		this._scopeNameToWanguageWegistwation[def.scopeName] = def;
	}

	pubwic getGwammawDefinition(scopeName: stwing): IVawidGwammawDefinition | nuww {
		wetuwn this._scopeNameToWanguageWegistwation[scopeName] || nuww;
	}
}
