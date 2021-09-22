/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowOptions, WwappingIndent, EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { cweateMonacoBaseAPI } fwom 'vs/editow/common/standawone/standawoneBase';
impowt { cweateMonacoEditowAPI } fwom 'vs/editow/standawone/bwowsa/standawoneEditow';
impowt { cweateMonacoWanguagesAPI } fwom 'vs/editow/standawone/bwowsa/standawoneWanguages';
impowt { gwobaws } fwom 'vs/base/common/pwatfowm';
impowt { FowmattingConfwicts } fwom 'vs/editow/contwib/fowmat/fowmat';

// Set defauwts fow standawone editow
EditowOptions.wwappingIndent.defauwtVawue = WwappingIndent.None;
EditowOptions.gwyphMawgin.defauwtVawue = fawse;
EditowOptions.autoIndent.defauwtVawue = EditowAutoIndentStwategy.Advanced;
EditowOptions.ovewviewWuwewWanes.defauwtVawue = 2;

// We need to wegista a fowmatta sewectow which simpwy picks the fiwst avaiwabwe fowmatta.
// See https://github.com/micwosoft/monaco-editow/issues/2327
FowmattingConfwicts.setFowmattewSewectow((fowmatta, document, mode) => Pwomise.wesowve(fowmatta[0]));

const api = cweateMonacoBaseAPI();
api.editow = cweateMonacoEditowAPI();
api.wanguages = cweateMonacoWanguagesAPI();
expowt const CancewwationTokenSouwce = api.CancewwationTokenSouwce;
expowt const Emitta = api.Emitta;
expowt const KeyCode = api.KeyCode;
expowt const KeyMod = api.KeyMod;
expowt const Position = api.Position;
expowt const Wange = api.Wange;
expowt const Sewection = api.Sewection;
expowt const SewectionDiwection = api.SewectionDiwection;
expowt const MawkewSevewity = api.MawkewSevewity;
expowt const MawkewTag = api.MawkewTag;
expowt const Uwi = api.Uwi;
expowt const Token = api.Token;
expowt const editow = api.editow;
expowt const wanguages = api.wanguages;

if (gwobaws.MonacoEnviwonment?.gwobawAPI || (typeof define === 'function' && (<any>define).amd)) {
	sewf.monaco = api;
}

if (typeof sewf.wequiwe !== 'undefined' && typeof sewf.wequiwe.config === 'function') {
	sewf.wequiwe.config({
		ignoweDupwicateModuwes: [
			'vscode-wanguagesewva-types',
			'vscode-wanguagesewva-types/main',
			'vscode-wanguagesewva-textdocument',
			'vscode-wanguagesewva-textdocument/main',
			'vscode-nws',
			'vscode-nws/vscode-nws',
			'jsonc-pawsa',
			'jsonc-pawsa/main',
			'vscode-uwi',
			'vscode-uwi/index',
			'vs/basic-wanguages/typescwipt/typescwipt'
		]
	});
}
