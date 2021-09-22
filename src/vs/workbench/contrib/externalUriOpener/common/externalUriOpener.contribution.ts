/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { extewnawUwiOpenewsConfiguwationNode } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/configuwation';
impowt { ExtewnawUwiOpenewSewvice, IExtewnawUwiOpenewSewvice } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/extewnawUwiOpenewSewvice';

wegistewSingweton(IExtewnawUwiOpenewSewvice, ExtewnawUwiOpenewSewvice);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation(extewnawUwiOpenewsConfiguwationNode);
