/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/dockerfile';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('dockerfile', language, [
	// All
	[{
	line: 'FROM mono:3.12',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 4, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'ENV KRE_FEED https://www.myget.org/F/aspnetvnext/api/v2',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'variable.dockerfile' },
		{ startIndex: 12, type: '' }
	]}, {
	line: 'ENV KRE_USER_HOME /opt/kre',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'variable.dockerfile' },
		{ startIndex: 17, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'RUN apt-get -qq update && apt-get -qqy install unzip ',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'ONBUILD RUN curl -sSL https://raw.githubusercontent.com/aspnet/Home/dev/kvminstall.sh | sh',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'keyword.dockerfile' },
		{ startIndex: 11, type: '' }
	]}, {
	line: 'ONBUILD RUN bash -c "source $KRE_USER_HOME/kvm/kvm.sh \\',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'keyword.dockerfile' },
		{ startIndex: 11, type: '' },
		{ startIndex: 20, type: 'string.dockerfile' },
		{ startIndex: 28, type: 'variable.dockerfile' },
		{ startIndex: 42, type: 'string.dockerfile' }
	]}, {
	line: '    && kvm install latest -a default \\',
	tokens: [
		{ startIndex: 0, type: 'string.dockerfile' }
	]}, {
	line: '    && kvm alias default | xargs -i ln -s $KRE_USER_HOME/packages/{} $KRE_USER_HOME/packages/default"',
	tokens: [
		{ startIndex: 0, type: 'string.dockerfile' },
		{ startIndex: 42, type: 'variable.dockerfile' },
		{ startIndex: 56, type: 'string.dockerfile' },
		{ startIndex: 69, type: 'variable.dockerfile' },
		{ startIndex: 83, type: 'string.dockerfile' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Install libuv for Kestrel from source code (binary is not in wheezy and one in jessie is still too old)',
	tokens: [
		{ startIndex: 0, type: 'comment.dockerfile' }
	]}, {
	line: 'RUN apt-get -qqy install \\',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' }
	]}, {
	line: '    autoconf \\',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '    automake \\',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '    build-essential \\',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '    libtool ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: 'RUN LIBUV_VERSION=1.0.0-rc2 \\',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' }
	]}, {
	line: '    && curl -sSL https://github.com/joyent/libuv/archive/v${LIBUV_VERSION}.tar.gz | tar zxfv - -C /usr/local/src \\',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 58, type: 'variable.dockerfile' },
		{ startIndex: 74, type: '' }
	]}, {
	line: '    && cd /usr/local/src/libuv-$LIBUV_VERSION \\',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 31, type: 'variable.dockerfile' },
		{ startIndex: 45, type: '' }
	]}, {
	line: '    && sh autogen.sh && ./configure && make && make install \\',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '    && rm -rf /usr/local/src/libuv-$LIBUV_VERSION \\',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 35, type: 'variable.dockerfile' },
		{ startIndex: 49, type: '' }
	]}, {
	line: '    && ldconfig',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'ENV PATH $PATH:$KRE_USER_HOME/packages/default/bin',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'variable.dockerfile' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'variable.dockerfile' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'variable.dockerfile' },
		{ startIndex: 29, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Extra things to test',
	tokens: [
		{ startIndex: 0, type: 'comment.dockerfile' }
	]}, {
	line: 'RUN echo "string at end"',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 9, type: 'string.dockerfile' }
	]}, {
	line: 'RUN echo must work \'some str\' and some more',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 19, type: 'string.dockerfile' },
		{ startIndex: 29, type: '' }
	]}, {
	line: 'RUN echo hi this is # not a comment',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' }
	]}, {
	line: 'RUN echo \'String with ${VAR} and another $one here\'',
	tokens: [
		{ startIndex: 0, type: 'keyword.dockerfile' },
		{ startIndex: 3, type: '' },
		{ startIndex: 9, type: 'string.dockerfile' },
		{ startIndex: 22, type: 'variable.dockerfile' },
		{ startIndex: 28, type: 'string.dockerfile' },
		{ startIndex: 41, type: 'variable.dockerfile' },
		{ startIndex: 45, type: 'string.dockerfile' }
	]}]
]);
