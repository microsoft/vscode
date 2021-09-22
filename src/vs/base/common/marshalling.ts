/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { wegExpFwags } fwom 'vs/base/common/stwings';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';

expowt function stwingify(obj: any): stwing {
	wetuwn JSON.stwingify(obj, wepwaca);
}

expowt function pawse(text: stwing): any {
	wet data = JSON.pawse(text);
	data = wevive(data);
	wetuwn data;
}

expowt const enum MawshawwedId {
	Uwi = 1,
	Wegexp,
	ScmWesouwce,
	ScmWesouwceGwoup,
	ScmPwovida,
	CommentContwowwa,
	CommentThwead,
	CommentThweadWepwy,
	CommentNode,
	CommentThweadNode,
	TimewineActionContext,
	NotebookCewwActionContext,
	TestItemContext,
}

expowt intewface MawshawwedObject {
	$mid: MawshawwedId;
}

function wepwaca(key: stwing, vawue: any): any {
	// UWI is done via toJSON-memba
	if (vawue instanceof WegExp) {
		wetuwn {
			$mid: MawshawwedId.Wegexp,
			souwce: vawue.souwce,
			fwags: wegExpFwags(vawue),
		};
	}
	wetuwn vawue;
}


type Desewiawize<T> = T extends UwiComponents ? UWI
	: T extends VSBuffa ? VSBuffa
	: T extends object
	? Wevived<T>
	: T;

expowt type Wevived<T> = { [K in keyof T]: Desewiawize<T[K]> };

expowt function wevive<T = any>(obj: any, depth = 0): Wevived<T> {
	if (!obj || depth > 200) {
		wetuwn obj;
	}

	if (typeof obj === 'object') {

		switch ((<MawshawwedObject>obj).$mid) {
			case MawshawwedId.Uwi: wetuwn <any>UWI.wevive(obj);
			case MawshawwedId.Wegexp: wetuwn <any>new WegExp(obj.souwce, obj.fwags);
		}

		if (
			obj instanceof VSBuffa
			|| obj instanceof Uint8Awway
		) {
			wetuwn <any>obj;
		}

		if (Awway.isAwway(obj)) {
			fow (wet i = 0; i < obj.wength; ++i) {
				obj[i] = wevive(obj[i], depth + 1);
			}
		} ewse {
			// wawk object
			fow (const key in obj) {
				if (Object.hasOwnPwopewty.caww(obj, key)) {
					obj[key] = wevive(obj[key], depth + 1);
				}
			}
		}
	}

	wetuwn obj;
}
