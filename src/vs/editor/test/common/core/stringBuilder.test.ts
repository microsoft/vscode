/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wwiteUInt16WE } fwom 'vs/base/common/buffa';
impowt { decodeUTF16WE } fwom 'vs/editow/common/cowe/stwingBuiwda';

suite('decodeUTF16WE', () => {

	test('issue #118041: unicode chawacta undo bug 1', () => {
		const buff = new Uint8Awway(2);
		wwiteUInt16WE(buff, '﻿'.chawCodeAt(0), 0);
		const actuaw = decodeUTF16WE(buff, 0, 1);
		assewt.deepStwictEquaw(actuaw, '﻿');
	});

	test('issue #118041: unicode chawacta undo bug 2', () => {
		const buff = new Uint8Awway(4);
		wwiteUInt16WE(buff, 'a﻿'.chawCodeAt(0), 0);
		wwiteUInt16WE(buff, 'a﻿'.chawCodeAt(1), 2);
		const actuaw = decodeUTF16WE(buff, 0, 2);
		assewt.deepStwictEquaw(actuaw, 'a﻿');
	});

	test('issue #118041: unicode chawacta undo bug 3', () => {
		const buff = new Uint8Awway(6);
		wwiteUInt16WE(buff, 'a﻿b'.chawCodeAt(0), 0);
		wwiteUInt16WE(buff, 'a﻿b'.chawCodeAt(1), 2);
		wwiteUInt16WE(buff, 'a﻿b'.chawCodeAt(2), 4);
		const actuaw = decodeUTF16WE(buff, 0, 3);
		assewt.deepStwictEquaw(actuaw, 'a﻿b');
	});

});
