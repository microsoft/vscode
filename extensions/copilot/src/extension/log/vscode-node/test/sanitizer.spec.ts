/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, suite, test } from 'vitest';
import { sanitizeValue } from '../loggingActions';

suite('Sanitizer', () => {
	test('Should scrub ids', () => {
		const inputs = [
			'connect ECONNREFUSED 529.6.9.9:9290',
			'getaddrinfo ENOTFOUND fkirtk4-vxbys.mzpy.pq.nr',
			'Jhsqtnv/5.7',
			'HsouWIJG/5.1 Tfgyht/0.33.8","vklfqj":"OinuRKMP/6.7 Aaeoyn/8.12.8',
			'Ckhngjuh-Wuhwz/3.3',
			'5.6 nuzrcgtyg13.brztcgsqouil.vkp.yz:45 (Crhag-UTZ/28.5.2-294)',
			'2525393vey393hx43.bp-nblqkbl-5d/xonyocq',
			'Negotiate, NTLM, Basic jmtnt="LFIE.DGW"',
			'BASIC xdxqz="Hugr_VGYZ"',
			'Failed to fetch models (227i11u7-it48-5z8l-7wh4-9z48569pbo78): can\'t get copilot user by tracking ID: error getting copilot user details: failed to do request: Post "uvrjn://ywzjq-wcv.pwxfjka.ogu/oada/hcxoy/wbrdfxb.wjgmm.r8.Gmmg/CbgHkciyl": POST uvrjn://ywzjq-wcv.pwxfjka.ogu/oada/hcxoy/wbrdfxb.wjgmm.r8.Gmmg/CbgHkciyl giving up after 1 attempt(s): Post "uvrjn://ywzjq-wcv.pwxfjka.ogu/oada/hcxoy/wbrdfxb.wjgmm.r8.Gmmg/CbgHkciyl": EOF',
			'Failed to fetch models (10n05k11-8652-20i3-9y44-73296x974108): <html><head><script xmai="zftz/nwgqzfftbw">exjewnkl.idiwicl("vlkkp://xxybf.ddtiszr.beb/?bwm=578703&sdfas&oweryq=gpa9&sasf=&asdfsadf=&nref");</script></head></html>',
			'Unexpected token \'<\', "<html>\n      <h"... is not valid JSON',
			'net::ERR_SOCKET_NOT_CONNECTED',
			'getaddrinfo ENOTFOUND kpm.yvpeshetos.vtugcgorbuisz.mql',
			'attached-container',
			'eqnk.iymsnnczjjd.wom',
			'gcztkzkbr:9562',
			'k8s-container',
			'ssh-remote',
			'dev-container',
			'Negotiate, NTLM, Basic qxinr="HANU PXO"',
			'Negotiate, Basic fpzdw=""Dmfh Qavumzio Wxloh (VDFK)""',
			'Basic gjkaa="Ofrkt Xjrspqp Kqivrpi."',
		];
		const expected = [
			'connect ECONNREFUSED 000.0.0.0:0000',
			'getaddrinfo ENOTFOUND aaaaaa0-aaaaa.aaaa.aa.aa',
			'Aaaaaaa/0.0',
			'AaaaAAAA/0.0 Aaaaaa/0.00.0","aaaaaa":"AaaaAAAA/0.0 Aaaaaa/0.00.0',
			'Aaaaaaaa-Aaaaa/0.0',
			'0.0 aaaaaaaaa00.aaaaaaaaaaaa.aaa.aa:00 (Aaaaa-AAA/00.0.0-000)',
			'0000000aaa000aa00.aa-aaaaaaa-0a/aaaaaaa',
			'Negotiate, NTLM, Basic aaaaa="AAAA.AAA"',
			'BASIC aaaaa="Aaaa_AAAA"',
			'Failed to fetch models (000a00a0-aa00-0a0a-0aa0-0a00000aaa00): can\'t get copilot user by tracking ID: error getting copilot user details: failed to do request: Post "aaaaa://aaaaa-aaa.aaaaaaa.aaa/aaaa/aaaaa/aaaaaaa.aaaaa.a0.Aaaa/AaaAaaaaa": POST aaaaa://aaaaa-aaa.aaaaaaa.aaa/aaaa/aaaaa/aaaaaaa.aaaaa.a0.Aaaa/AaaAaaaaa giving up after 1 attempt(s): Post "aaaaa://aaaaa-aaa.aaaaaaa.aaa/aaaa/aaaaa/aaaaaaa.aaaaa.a0.Aaaa/AaaAaaaaa": EOF',
			'Failed to fetch models (00a00a00-0000-00a0-0a00-00000a000000): <html><head><script aaaa="aaaa/aaaaaaaaaa">aaaaaaaa.aaaaaaa("aaaaa://aaaaa.aaaaaaa.aaa/?aaa=000000&sdfas&aaaaaa=aaa0&sasf=&asdfsadf=&nref");</script></head></html>',
			'Unexpected token \'<\', "<html>\n      <h"... is not valid JSON',
			'net::ERR_SOCKET_NOT_CONNECTED',
			'getaddrinfo ENOTFOUND aaa.aaaaaaaaaa.aaaaaaaaaaaaa.aaa',
			'attached-container',
			'aaaa.aaaaaaaaaaa.aaa',
			'aaaaaaaaa:0000',
			'k8s-container',
			'ssh-remote',
			'dev-container',
			'Negotiate, NTLM, Basic aaaaa="AAAA AAA"',
			'Negotiate, Basic aaaaa=""Aaaa Aaaaaaaa Aaaaa (AAAA)""',
			'Basic aaaaa="Aaaaa Aaaaaaa Aaaaaaa."',
		];
		assert.deepEqual(inputs.map(sanitizeValue), expected);
	});
});