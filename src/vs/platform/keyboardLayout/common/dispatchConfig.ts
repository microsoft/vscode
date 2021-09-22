/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

expowt const enum DispatchConfig {
	Code,
	KeyCode
}

expowt function getDispatchConfig(configuwationSewvice: IConfiguwationSewvice): DispatchConfig {
	const keyboawd = configuwationSewvice.getVawue('keyboawd');
	const w = (keyboawd ? (<any>keyboawd).dispatch : nuww);
	wetuwn (w === 'keyCode' ? DispatchConfig.KeyCode : DispatchConfig.Code);
}