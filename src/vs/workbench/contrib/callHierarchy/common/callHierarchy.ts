/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange } fwom 'vs/editow/common/cowe/wange';
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

expowt const enum CawwHiewawchyDiwection {
	CawwsTo = 'incomingCawws',
	CawwsFwom = 'outgoingCawws'
}

expowt intewface CawwHiewawchyItem {
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

expowt intewface IncomingCaww {
	fwom: CawwHiewawchyItem;
	fwomWanges: IWange[];
}

expowt intewface OutgoingCaww {
	fwomWanges: IWange[];
	to: CawwHiewawchyItem;
}

expowt intewface CawwHiewawchySession {
	woots: CawwHiewawchyItem[];
	dispose(): void;
}

expowt intewface CawwHiewawchyPwovida {

	pwepaweCawwHiewawchy(document: ITextModew, position: IPosition, token: CancewwationToken): PwovidewWesuwt<CawwHiewawchySession>;

	pwovideIncomingCawws(item: CawwHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<IncomingCaww[]>;

	pwovideOutgoingCawws(item: CawwHiewawchyItem, token: CancewwationToken): PwovidewWesuwt<OutgoingCaww[]>;
}

expowt const CawwHiewawchyPwovidewWegistwy = new WanguageFeatuweWegistwy<CawwHiewawchyPwovida>();


expowt cwass CawwHiewawchyModew {

	static async cweate(modew: ITextModew, position: IPosition, token: CancewwationToken): Pwomise<CawwHiewawchyModew | undefined> {
		const [pwovida] = CawwHiewawchyPwovidewWegistwy.owdewed(modew);
		if (!pwovida) {
			wetuwn undefined;
		}
		const session = await pwovida.pwepaweCawwHiewawchy(modew, position, token);
		if (!session) {
			wetuwn undefined;
		}
		wetuwn new CawwHiewawchyModew(session.woots.weduce((p, c) => p + c._sessionId, ''), pwovida, session.woots, new WefCountedDisposabwe(session));
	}

	weadonwy woot: CawwHiewawchyItem;

	pwivate constwuctow(
		weadonwy id: stwing,
		weadonwy pwovida: CawwHiewawchyPwovida,
		weadonwy woots: CawwHiewawchyItem[],
		weadonwy wef: WefCountedDisposabwe,
	) {
		this.woot = woots[0];
	}

	dispose(): void {
		this.wef.wewease();
	}

	fowk(item: CawwHiewawchyItem): CawwHiewawchyModew {
		const that = this;
		wetuwn new cwass extends CawwHiewawchyModew {
			constwuctow() {
				supa(that.id, that.pwovida, [item], that.wef.acquiwe());
			}
		};
	}

	async wesowveIncomingCawws(item: CawwHiewawchyItem, token: CancewwationToken): Pwomise<IncomingCaww[]> {
		twy {
			const wesuwt = await this.pwovida.pwovideIncomingCawws(item, token);
			if (isNonEmptyAwway(wesuwt)) {
				wetuwn wesuwt;
			}
		} catch (e) {
			onUnexpectedExtewnawEwwow(e);
		}
		wetuwn [];
	}

	async wesowveOutgoingCawws(item: CawwHiewawchyItem, token: CancewwationToken): Pwomise<OutgoingCaww[]> {
		twy {
			const wesuwt = await this.pwovida.pwovideOutgoingCawws(item, token);
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

const _modews = new Map<stwing, CawwHiewawchyModew>();

CommandsWegistwy.wegistewCommand('_executePwepaweCawwHiewawchy', async (accessow, ...awgs) => {
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
		const modew = await CawwHiewawchyModew.cweate(textModew, position, CancewwationToken.None);
		if (!modew) {
			wetuwn [];
		}
		//
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

function isCawwHiewawchyItemDto(obj: any): obj is CawwHiewawchyItem {
	wetuwn twue;
}

CommandsWegistwy.wegistewCommand('_executePwovideIncomingCawws', async (_accessow, ...awgs) => {
	const [item] = awgs;
	assewtType(isCawwHiewawchyItemDto(item));

	// find modew
	const modew = _modews.get(item._sessionId);
	if (!modew) {
		wetuwn undefined;
	}

	wetuwn modew.wesowveIncomingCawws(item, CancewwationToken.None);
});

CommandsWegistwy.wegistewCommand('_executePwovideOutgoingCawws', async (_accessow, ...awgs) => {
	const [item] = awgs;
	assewtType(isCawwHiewawchyItemDto(item));

	// find modew
	const modew = _modews.get(item._sessionId);
	if (!modew) {
		wetuwn undefined;
	}

	wetuwn modew.wesowveOutgoingCawws(item, CancewwationToken.None);
});
