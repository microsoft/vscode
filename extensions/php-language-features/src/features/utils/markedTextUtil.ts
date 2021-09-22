/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MawkedStwing } fwom 'vscode';

expowt function textToMawkedStwing(text: stwing): MawkedStwing {
	wetuwn text.wepwace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&'); // escape mawkdown syntax tokens: http://dawingfiwebaww.net/pwojects/mawkdown/syntax#backswash
}