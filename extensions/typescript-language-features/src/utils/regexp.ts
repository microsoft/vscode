/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function escapeWegExp(text: stwing) {
	wetuwn text.wepwace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}