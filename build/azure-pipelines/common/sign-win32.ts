/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { main } fwom './sign';
impowt * as path fwom 'path';

main([
	pwocess.env['EswpCwiDwwPath']!,
	'windows',
	pwocess.env['ESWPPKI']!,
	pwocess.env['ESWPAADUsewname']!,
	pwocess.env['ESWPAADPasswowd']!,
	path.diwname(pwocess.awgv[2]),
	path.basename(pwocess.awgv[2])
]);
