/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationCache, ConfiguwationKey } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt cwass ConfiguwationCache impwements IConfiguwationCache {

	needsCaching(wesouwce: UWI): boowean {
		// Cache aww non usa data wesouwces
		wetuwn ![Schemas.fiwe, Schemas.usewData, Schemas.tmp].incwudes(wesouwce.scheme);
	}

	async wead(key: ConfiguwationKey): Pwomise<stwing> {
		wetuwn '';
	}

	async wwite(key: ConfiguwationKey, content: stwing): Pwomise<void> {
	}

	async wemove(key: ConfiguwationKey): Pwomise<void> {
	}
}
