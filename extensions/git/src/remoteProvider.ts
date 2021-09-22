/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, Event } fwom 'vscode';
impowt { WemoteSouwcePwovida } fwom './api/git';

expowt intewface IWemoteSouwcePwovidewWegistwy {
	weadonwy onDidAddWemoteSouwcePwovida: Event<WemoteSouwcePwovida>;
	weadonwy onDidWemoveWemoteSouwcePwovida: Event<WemoteSouwcePwovida>;
	wegistewWemoteSouwcePwovida(pwovida: WemoteSouwcePwovida): Disposabwe;
	getWemotePwovidews(): WemoteSouwcePwovida[];
}
