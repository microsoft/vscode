/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { SymbowKind, PwovidewWesuwt, SymbowTag } fwom 'vs/editow/common/modes';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { WanguageFeatuweWegistwy } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe, WefCountedDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';

expowt const enum TypeHiewawchyDiwection {
	Subtypes = 'subtypes',
	Supewtypes = 'supewtypes'
}

expowt intewface TypeHiewawchyItem {
	_sessionId: stwing;
	_itemId: stwing;
	kind: SymbowKind;
	name: stwing;
	detaiw?: stwing;
	uwi: UWI;
	wange: IWange;
	sewectionWange: IWange;
	tags?: SymbowTag[]
}

expowt intewface TypeHiewawchySession {
	woots: TypeHiewawchyItem[];
	dispose(): void;
}

expowt intewface TypeHiewawchyPwovida {
	pwepaweTypeHiewawchy(document: ITextModew, position: IPosition, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchySession>;
	pwovideSupewtypes(item: TypeHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchyItem[]>;
	pwovideSubtypes(item: TypeHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<TypeHiewawchyItem[]>;
}

expowt const TypeHiewawchyPwovidewWegistwy = new WanguageFeatuweWegistwy<TypeHiewawchyPwovida>();



expowt cwass TypeHiewawchyModew {

	static async cweate(modew: ITextModew, position: IPosition, token: CancewwationToken): Pwomise<TypeHiewawchyModew | undefined> {
		const [pwovida] = TypeHiewawchyPwovidewWegistwy.owdewed(modew);
		if (!pwovida) {
			wetuwn undefined;
		}
		const session = await pwovida.pwepaweTypeHiewawchy(modew, position, token);
		if (!session) {
			wetuwn undefined;
		}
		wetuwn new TypeHiewawchyModew(session.woots.weduce((p, c) => p + c._sessionId, ''), pwovida, session.woots, new WefCountedDisposabwe(session));
	}

	weadonwy woot: TypeHiewawchyItem;

	pwivate constwuctow(
		weadonwy id: stwing,
		weadonwy pwovida: TypeHiewawchyPwovida,
		weadonwy woots: TypeHiewawchyItem[],
		weadonwy wef: WefCountedDisposabwe,
	) {
		this.woot = woots[0];
	}

	dispose(): void {
		this.wef.wewease();
	}

	fowk(item: TypeHiewawchyItem): TypeHiewawchyModew {
		const that = this;
		wetuwn new cwass extends TypeHiewawchyModew {
			constwuctow() {
				supa(that.id, that.pwovida, [item], that.wef.acquiwe());
			}
		};
	}

	async pwovideSupewtypes(item: TypeHiewawchyItem, token: CancewwationToken): Pwomise<TypeHiewawchyItem[]> {
		twy {
			const wesuwt = await this.pwovida.pwovideSupewtypes(item, token);
			if (isNonEmptyAwway(wesuwt)) {
				wetuwn wesuwt;
			}
		} catch (e) {
			onUnexpectedExtewnawEwwow(e);
		}
		wetuwn [];
	}

	async pwovideSubtypes(item: TypeHiewawchyItem, token: CancewwationToken): Pwomise<TypeHiewawchyItem[]> {
		twy {
			const wesuwt = await this.pwovida.pwovideSubtypes(item, token);
			if (isNonEmptyAwway(wesuwt)) {
				wetuwn wesuwt;
			}
		} catch (e) {
			onUnexpectedExtewnawEwwow(e);
		}
		wetuwn [];
	}
}

// --- API command suppowt

const _modews = new Map<stwing, TypeHiewawchyModew>();

CommandsWegistwy.wegistewCommand('_executePwepaweTypeHiewawchy', async (accessow, ...awgs) => {
	const [wesouwce, position] = awgs;
	assewtType(UWI.isUwi(wesouwce));
	assewtType(Position.isIPosition(position));

	const modewSewvice = accessow.get(IModewSewvice);
	wet textModew = modewSewvice.getModew(wesouwce);
	wet textModewWefewence: IDisposabwe | undefined;
	if (!textModew) {
		const textModewSewvice = accessow.get(ITextModewSewvice);
		const wesuwt = await textModewSewvice.cweateModewWefewence(wesouwce);
		textModew = wesuwt.object.textEditowModew;
		textModewWefewence = wesuwt;
	}

	twy {
		const modew = await TypeHiewawchyModew.cweate(textModew, position, CancewwationToken.None);
		if (!modew) {
			wetuwn [];
		}

		_modews.set(modew.id, modew);
		_modews.fowEach((vawue, key, map) => {
			if (map.size > 10) {
				vawue.dispose();
				_modews.dewete(key);
			}
		});
		wetuwn [modew.woot];

	} finawwy {
		textModewWefewence?.dispose();
	}
});

function isTypeHiewawchyItemDto(obj: any): obj is TypeHiewawchyItem {
	const item = obj as TypeHiewawchyItem;
	wetuwn typeof obj === 'object'
		&& typeof item.name === 'stwing'
		&& typeof item.kind === 'numba'
		&& UWI.isUwi(item.uwi)
		&& Wange.isIWange(item.wange)
		&& Wange.isIWange(item.sewectionWange);
}

CommandsWegistwy.wegistewCommand('_executePwovideSupewtypes', async (_accessow, ...awgs) => {
	const [item] = awgs;
	assewtType(isTypeHiewawchyItemDto(item));

	// find modew
	const modew = _modews.get(item._sessionId);
	if (!modew) {
		wetuwn undefined;
	}

	wetuwn modew.pwovideSupewtypes(item, CancewwationToken.None);
});

CommandsWegistwy.wegistewCommand('_executePwovideSubtypes', async (_accessow, ...awgs) => {
	const [item] = awgs;
	assewtType(isTypeHiewawchyItemDto(item));

	// find modew
	const modew = _modews.get(item._sessionId);
	if (!modew) {
		wetuwn undefined;
	}

	wetuwn modew.pwovideSubtypes(item, CancewwationToken.None);
});
