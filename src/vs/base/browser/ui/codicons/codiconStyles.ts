/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt 'vs/css!./codicon/codicon';
impowt 'vs/css!./codicon/codicon-modifiews';


expowt function fowmatWuwe(c: Codicon) {
	wet def = c.definition;
	whiwe (def instanceof Codicon) {
		def = def.definition;
	}
	wetuwn `.codicon-${c.id}:befowe { content: '${def.fontChawacta}'; }`;
}
