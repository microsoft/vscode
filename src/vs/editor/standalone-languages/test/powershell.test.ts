/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {language} from 'vs/editor/standalone-languages/powershell';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('powershell', language, [
	// Comments - single line
	[{
	line: '#',
	tokens: null}],

	[{
	line: '    # a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.ps1' }
	]}],

	[{
	line: '# a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}],

	[{
	line: '#sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}],

	[{
	line: '##still a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}],

	[{
	line: '1 / 2 /# comment',
	tokens: [
		{ startIndex: 0, type: 'number.ps1' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.ps1' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.ps1' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.ps1' },
		{ startIndex: 7, type: 'comment.ps1' }
	]}],

	[{
	line: '$x = 1 # my comment # is a nice one',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.ps1' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'comment.ps1' }
	]}],

	// Comments - range comment, single line
	[{
	line: '<# a simple comment #>',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}],

	[{
	line: '$x = <# a simple comment #> 1',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'comment.ps1' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'number.ps1' }
	]}],

	[{
	line: '$yy = <# comment #> 14',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.ps1' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'comment.ps1' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'number.ps1' }
	]}],

	[{
	line: '$x = <##>7',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'comment.ps1' },
		{ startIndex: 9, type: 'number.ps1' }
	]}],

	[{
	line: '$x = <#<85',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'comment.ps1' }
	]}],

	// Comments - range comment, multiple lines
	[{
	line: '<# start of multiline comment',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: 'a comment between',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: 'end of multiline comment#>',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}],

	[{
	line: '$x = <# start a comment',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'comment.ps1' }
	]}, {
	line: ' a ',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: 'and end it #> 2',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'number.ps1' }
	]}],

	// Keywords
	[{
	line: 'foreach($i in $b) {if (7) continue}',
	tokens: [
		{ startIndex: 0, type: 'keyword.foreach.ps1' },
		{ startIndex: 7, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 8, type: 'variable.ps1' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.in.ps1' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'variable.ps1' },
		{ startIndex: 16, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'delimiter.curly.ps1' },
		{ startIndex: 19, type: 'keyword.if.ps1' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 23, type: 'number.ps1' },
		{ startIndex: 24, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'keyword.continue.ps1' },
		{ startIndex: 34, type: 'delimiter.curly.ps1' }
	]}],

	// Redirect operand
	[{
	line: '$i > output1.txt',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 12, type: 'delimiter.ps1' },
		{ startIndex: 13, type: '' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.ps1' }
	]}],

	[{
	line: '0.10',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '0X123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.ps1' }
	]}],

	[{
	line: '0x123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.ps1' }
	]}],

	[{
	line: '23.5e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '23.5e-3',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '23.5E3',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '23.5E-3',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '23.5',
	tokens: [
		{ startIndex: 0, type: 'number.float.ps1' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.ps1' },
		{ startIndex: 1, type: 'delimiter.ps1' },
		{ startIndex: 2, type: 'number.ps1' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.ps1' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: 'number.ps1' }
	]}],

	[{
	line: '10 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.ps1' }
	]}],

	// Strings
	[{
	line: '$s = "I am a String"',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'string.ps1' }
	]}],

	[{
	line: '\'I am also a ( String\'',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}],

	[{
	line: '$s = "concatenated" + " String"',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'string.ps1' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'delimiter.ps1' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'string.ps1' }
	]}],

	[{
	line: '"escaping `"quotes`" is cool"',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' },
		{ startIndex: 10, type: 'string.escape.ps1' },
		{ startIndex: 12, type: 'string.ps1' },
		{ startIndex: 18, type: 'string.escape.ps1' },
		{ startIndex: 20, type: 'string.ps1' }
	]}],

	[{
	line: '\'`\'end of the string',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' },
		{ startIndex: 1, type: 'string.escape.ps1' },
		{ startIndex: 3, type: 'string.ps1' }
	]}],

	[{
	line: '@"I am an expandable String"@',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}],

	[{
	line: '@\'I am also an expandable String\'@',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}],

	[{
	line: '$s = @\'I am also an expandable String\'@',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'string.ps1' }
	]}],

	[{
	line: '$s = @\'I am also an expandable String\'@+7',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'delimiter.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'string.ps1' }
	]}],

	[{
	line: '@\'I am a multiline string,',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}, {
	line: 'and this is the middle line,',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}, {
	line: 'and this is NOT the end of the string\'@foreach $i',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}, {
	line: '\'@',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}, {
	line: '${script:foo}',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' }
	]}, {
	line: 'foreach $i',
	tokens: [
		{ startIndex: 0, type: 'keyword.foreach.ps1' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'variable.ps1' }
	]}],

	// Generated from sample
	[{
	line: '$SelectedObjectNames=@();',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 20, type: 'delimiter.ps1' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 24, type: 'delimiter.ps1' }
	]}, {
	line: '$XenCenterNodeSelected = 0;',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.ps1' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'number.ps1' },
		{ startIndex: 26, type: 'delimiter.ps1' }
	]}, {
	line: '#the object info array contains hashmaps, each of which represent a parameter set and describe a target in the XenCenter resource list',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: 'foreach($parameterSet in $ObjInfoArray)',
	tokens: [
		{ startIndex: 0, type: 'keyword.foreach.ps1' },
		{ startIndex: 7, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 8, type: 'variable.ps1' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'keyword.in.ps1' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'variable.ps1' },
		{ startIndex: 38, type: 'delimiter.parenthesis.ps1' }
	]}, {
	line: '{',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.ps1' }
	]}, {
	line: '	if ($parameterSet["class"] -eq "blank")',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'keyword.if.ps1' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 5, type: 'variable.ps1' },
		{ startIndex: 18, type: 'delimiter.square.ps1' },
		{ startIndex: 19, type: 'string.ps1' },
		{ startIndex: 26, type: 'delimiter.square.ps1' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'delimiter.ps1' },
		{ startIndex: 29, type: '' },
		{ startIndex: 32, type: 'string.ps1' },
		{ startIndex: 39, type: 'delimiter.parenthesis.ps1' }
	]}, {
	line: '	{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' }
	]}, {
	line: '		#When the XenCenter node is selected a parameter set is created for each of your connected servers with the class and objUuid keys marked as blank',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'comment.ps1' }
	]}, {
	line: '		if ($XenCenterNodeSelected)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.if.ps1' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 6, type: 'variable.ps1' },
		{ startIndex: 28, type: 'delimiter.parenthesis.ps1' }
	]}, {
	line: '		{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.curly.ps1' }
	]}, {
	line: '			continue',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.continue.ps1' }
	]}, {
	line: '		}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.curly.ps1' }
	]}, {
	line: '		$XenCenterNodeSelected = 1;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'delimiter.ps1' },
		{ startIndex: 26, type: '' },
		{ startIndex: 27, type: 'number.ps1' },
		{ startIndex: 28, type: 'delimiter.ps1' }
	]}, {
	line: '		$SelectedObjectNames += "XenCenter"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.ps1' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'string.ps1' }
	]}, {
	line: '	}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' }
	]}, {
	line: '	elseif ($parameterSet["sessionRef"] -eq "null")',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'keyword.elseif.ps1' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.ps1' },
		{ startIndex: 9, type: 'variable.ps1' },
		{ startIndex: 22, type: 'delimiter.square.ps1' },
		{ startIndex: 23, type: 'string.ps1' },
		{ startIndex: 35, type: 'delimiter.square.ps1' },
		{ startIndex: 36, type: '' },
		{ startIndex: 37, type: 'delimiter.ps1' },
		{ startIndex: 38, type: '' },
		{ startIndex: 41, type: 'string.ps1' },
		{ startIndex: 47, type: 'delimiter.parenthesis.ps1' }
	]}, {
	line: '	{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' }
	]}, {
	line: '		#When a disconnected server is selected there is no session information, we get null for everything except class',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'comment.ps1' }
	]}, {
	line: '	}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' }
	]}, {
	line: '		$SelectedObjectNames += "a disconnected server"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.ps1' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'string.ps1' }
	]}, {
	line: '	else',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'keyword.else.ps1' }
	]}, {
	line: '	{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' }
	]}, {
	line: '		Connect-XenServer -url $parameterSet["url"] -opaqueref $parameterSet["sessionRef"]',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 20, type: 'delimiter.ps1' },
		{ startIndex: 21, type: '' },
		{ startIndex: 25, type: 'variable.ps1' },
		{ startIndex: 38, type: 'delimiter.square.ps1' },
		{ startIndex: 39, type: 'string.ps1' },
		{ startIndex: 44, type: 'delimiter.square.ps1' },
		{ startIndex: 45, type: '' },
		{ startIndex: 46, type: 'delimiter.ps1' },
		{ startIndex: 47, type: '' },
		{ startIndex: 57, type: 'variable.ps1' },
		{ startIndex: 70, type: 'delimiter.square.ps1' },
		{ startIndex: 71, type: 'string.ps1' },
		{ startIndex: 83, type: 'delimiter.square.ps1' }
	]}, {
	line: '		#Use $class to determine which server objects to get',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'comment.ps1' }
	]}, {
	line: '		#-properties allows us to filter the results to just include the selected object',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'comment.ps1' }
	]}, {
	line: '		$exp = "Get-XenServer:{0} -properties @{{uuid=\'{1}\'}}" -f $parameterSet["class"], $parameterSet["objUuid"]',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.ps1' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'string.ps1' },
		{ startIndex: 56, type: '' },
		{ startIndex: 57, type: 'delimiter.ps1' },
		{ startIndex: 58, type: '' },
		{ startIndex: 60, type: 'variable.ps1' },
		{ startIndex: 73, type: 'delimiter.square.ps1' },
		{ startIndex: 74, type: 'string.ps1' },
		{ startIndex: 81, type: 'delimiter.square.ps1' },
		{ startIndex: 82, type: 'delimiter.ps1' },
		{ startIndex: 83, type: '' },
		{ startIndex: 84, type: 'variable.ps1' },
		{ startIndex: 97, type: 'delimiter.square.ps1' },
		{ startIndex: 98, type: 'string.ps1' },
		{ startIndex: 107, type: 'delimiter.square.ps1' }
	]}, {
	line: '		$obj = Invoke-Expression $exp',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.ps1' },
		{ startIndex: 8, type: '' },
		{ startIndex: 27, type: 'variable.ps1' }
	]}, {
	line: '		$SelectedObjectNames += $obj.name_label;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.ps1' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.ps1' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'variable.ps1' },
		{ startIndex: 30, type: 'delimiter.ps1' },
		{ startIndex: 31, type: '' },
		{ startIndex: 41, type: 'delimiter.ps1' }
	]}, {
	line: '	} ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.ps1' },
		{ startIndex: 2, type: '' }
	]}, {
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.ps1' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '$test = "in string var$test"',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.ps1' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'string.ps1' },
		{ startIndex: 22, type: 'variable.ps1' },
		{ startIndex: 27, type: 'string.ps1' }
	]}, {
	line: '$another = \'not a $var\'',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.ps1' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.ps1' }
	]}, {
	line: '$third = "a $var and not `$var string"',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.ps1' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'string.ps1' },
		{ startIndex: 12, type: 'variable.ps1' },
		{ startIndex: 16, type: 'string.ps1' },
		{ startIndex: 25, type: 'string.escape.ps1' },
		{ startIndex: 27, type: 'string.ps1' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: ':aLabel',
	tokens: [
		{ startIndex: 0, type: 'metatag.ps1' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '<#',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: '.SYNOPSIS',
	tokens: [
		{ startIndex: 0, type: 'comment.keyword.synopsis.ps1' }
	]}, {
	line: '  some text',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: '  ',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: '.LINK',
	tokens: [
		{ startIndex: 0, type: 'comment.keyword.link.ps1' }
	]}, {
	line: '  some more text',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: '#>',
	tokens: [
		{ startIndex: 0, type: 'comment.ps1' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '',
	tokens: [

	]}, {
	line: '$hereString = @"',
	tokens: [
		{ startIndex: 0, type: 'variable.ps1' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.ps1' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'string.ps1' }
	]}, {
	line: '  a string',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' }
	]}, {
	line: '  still "@ a string $withVar',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' },
		{ startIndex: 20, type: 'variable.ps1' }
	]}, {
	line: '  still a string `$noVar',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' },
		{ startIndex: 17, type: 'string.escape.ps1' },
		{ startIndex: 19, type: 'string.ps1' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '"@ still a string',
	tokens: [
		{ startIndex: 0, type: 'string.ps1' },
		{ startIndex: 2, type: '' }
	]}]
]);

suite('powershell', () => {
	test('word definition', () => {
		var wordDefinition = language.wordDefinition;
		assert.deepEqual('a b cde'.match(wordDefinition), ['a', 'b', 'cde']);
		assert.deepEqual('if ($parameterSet["class"] -eq "blank")'.match(wordDefinition), ['if', '$parameterSet', 'class', '-eq', 'blank']);

		assert.deepEqual('Connect-XenServer -url $parameterSet["url"] <#-opaqueref trala#>")'.match(wordDefinition),
			['Connect-XenServer', '-url', '$parameterSet', 'url', '-opaqueref', 'trala']);

		assert.deepEqual('$exp = "Get-XenServer:{0} -properties @{{uuid=\'{1}\'}}" -f $parameterSet["class"], $parameterSet["objUuid"]'.match(wordDefinition),
			['$exp', 'Get-XenServer', '0', '-properties', 'uuid', '1', '-f', '$parameterSet', 'class', '$parameterSet', 'objUuid']);
	});
});
