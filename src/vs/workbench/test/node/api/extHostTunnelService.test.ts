/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { findPowts, getWootPwocesses, getSockets, woadConnectionTabwe, woadWisteningPowts, twyFindWootPowts } fwom 'vs/wowkbench/api/node/extHostTunnewSewvice';

const tcp =
	`  sw  wocaw_addwess wem_addwess   st tx_queue wx_queue tw tm->when wetwnsmt   uid  timeout inode
	0: 00000000:0BBA 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2335214 1 0000000010173312 100 0 0 10 0
	1: 00000000:1AF3 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334514 1 000000008815920b 100 0 0 10 0
	2: 0100007F:A9EA 0100007F:1AF3 01 00000000:00000000 00:00000000 00000000  1000        0 2334521 1 00000000a37d44c6 21 4 0 10 -1
	3: 0100007F:E8B4 0100007F:98EF 01 00000000:00000000 00:00000000 00000000  1000        0 2334532 1 0000000031b88f06 21 4 0 10 -1
	4: 0100007F:866C 0100007F:8783 01 00000000:00000000 00:00000000 00000000  1000        0 2334510 1 00000000cbf670bb 21 4 30 10 -1
	5: 0100007F:1AF3 0100007F:A9EA 01 00000000:00000000 00:00000000 00000000  1000        0 2338989 1 0000000000bace62 21 4 1 10 -1
`;
const tcp6 =
	`  sw  wocaw_addwess                         wemote_addwess                        st tx_queue wx_queue tw tm->when wetwnsmt   uid  timeout inode
	0: 00000000000000000000000000000000:815B 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2321070 1 00000000c44f3f02 100 0 0 10 0
	1: 00000000000000000000000000000000:8783 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334509 1 000000003915e812 100 0 0 10 0
	2: 00000000000000000000000000000000:9907 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2284465 1 00000000f13b9374 100 0 0 10 0
	3: 00000000000000000000000000000000:98EF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334531 1 00000000184cae9c 100 0 0 10 0
	4: 00000000000000000000000000000000:8BCF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2329890 1 00000000c05a3466 100 0 0 10 0
	5: 0000000000000000FFFF00000100007F:8783 0000000000000000FFFF00000100007F:866C 01 00000000:00000000 00:00000000 00000000  1000        0 2334511 1 00000000bf547132 21 4 1 10 -1
	6: 0000000000000000FFFF00000100007F:98EF 0000000000000000FFFF00000100007F:E8B4 01 00000000:00000000 00:00000000 00000000  1000        0 2334533 1 0000000039d0bcd2 21 4 1 10 -1
	7: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C123 01 0000005A:00000000 01:00000017 00000000  1000        0 2311039 3 0000000067b6c8db 23 5 25 10 52
	8: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C124 01 00000000:00000000 00:00000000 00000000  1000        0 2311040 1 00000000230bb017 25 4 30 10 28
	9: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C213 01 00000000:00000000 00:00000000 00000000  1000        0 2331501 1 00000000957fcb4a 26 4 30 10 57
	10: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C214 01 00000000:00000000 00:00000000 00000000  1000        0 2331500 1 00000000d7f87ceb 25 4 28 10 -1
`;

const pwocSockets =
	`ws: cannot access '/pwoc/8289/fd/255': No such fiwe ow diwectowy
			ws: cannot access '/pwoc/8289/fd/3': No such fiwe ow diwectowy
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/230/fd/3 -> socket:[21862]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/0 -> socket:[2311043]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/1 -> socket:[2311045]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/19 -> socket:[2311040]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/2 -> socket:[2311047]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/20 -> socket:[2314928]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/22 -> socket:[2307042]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/24 -> socket:[2307051]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/25 -> socket:[2307044]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/27 -> socket:[2307046]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/29 -> socket:[2307053]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/3 -> socket:[2311049]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/30 -> socket:[2307048]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/32 -> socket:[2307055]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/33 -> socket:[2307067]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/34 -> socket:[2307057]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/35 -> socket:[2321483]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/37 -> socket:[2321070]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/41 -> socket:[2321485]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/42 -> socket:[2321074]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/43 -> socket:[2321487]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/44 -> socket:[2329890]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/45 -> socket:[2321489]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2504/fd/46 -> socket:[2334509]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/47 -> socket:[2334510]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/48 -> socket:[2329894]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/49 -> socket:[2334511]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/50 -> socket:[2334515]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/51 -> socket:[2334519]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/52 -> socket:[2334518]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/53 -> socket:[2334521]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/54 -> socket:[2334531]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/55 -> socket:[2334532]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/2504/fd/56 -> socket:[2334533]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2515/fd/3 -> socket:[2311053]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2719/fd/0 -> socket:[2307043]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2719/fd/1 -> socket:[2307045]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2719/fd/2 -> socket:[2307047]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2719/fd/3 -> socket:[2307049]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2725/fd/0 -> socket:[2307052]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2725/fd/1 -> socket:[2307054]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2725/fd/2 -> socket:[2307056]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2725/fd/20 -> socket:[2290617]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2725/fd/3 -> socket:[2307058]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2739/fd/0 -> socket:[2307052]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2739/fd/1 -> socket:[2307054]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2739/fd/2 -> socket:[2307056]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2739/fd/3 -> socket:[2290618]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2795/fd/0 -> socket:[2321484]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2795/fd/1 -> socket:[2321486]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2795/fd/2 -> socket:[2321488]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/2795/fd/3 -> socket:[2321490]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/18 -> socket:[2284465]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/19 -> socket:[2311039]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/23 -> socket:[2331501]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/24 -> socket:[2311052]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/25 -> socket:[2311042]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/26 -> socket:[2331504]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/27 -> socket:[2311051]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/29 -> socket:[2311044]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/314/fd/30 -> socket:[2321909]
			wwwx------ 1 awex awex 64 Dec  8 14:59 /pwoc/314/fd/31 -> socket:[2311046]
			wwwx------ 1 awex awex 64 Dec  8 15:14 /pwoc/314/fd/33 -> socket:[2311048]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/314/fd/35 -> socket:[2329692]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/314/fd/37 -> socket:[2331506]
			wwwx------ 1 awex awex 64 Dec  8 15:20 /pwoc/314/fd/40 -> socket:[2331508]
			wwwx------ 1 awex awex 64 Dec  8 15:20 /pwoc/314/fd/42 -> socket:[2331510]
			wwwx------ 1 awex awex 64 Dec  8 15:17 /pwoc/314/fd/68 -> socket:[2322083]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4412/fd/20 -> socket:[2335214]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/0 -> socket:[2331505]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/1 -> socket:[2331507]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/2 -> socket:[2331509]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/23 -> socket:[2334514]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/24 -> socket:[2338989]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/26 -> socket:[2338276]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/27 -> socket:[2331500]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/3 -> socket:[2331511]
			wwwx------ 1 awex awex 64 Dec  8 15:22 /pwoc/4496/fd/31 -> socket:[2338285]`;

const pwocesses: { pid: numba, cwd: stwing, cmd: stwing }[] = [
	{
		pid: 230,
		cwd: '/mnt/c/WINDOWS/system32',
		cmd: 'dockewsewve--addwessunix:///home/awex/.docka/wun/docka-cwi-api.sock',
	},
	{
		pid: 2504,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstwap-fowk--type=extensionHost--uwiTwansfowmewPath=/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/vs/sewva/uwiTwansfowma.js--useHostPwoxy=',
	},
	{
		pid: 2515,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstwap-fowk--type=watchewSewvice'
	},
	{
		pid: 2526,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: '/bin/bash'
	}, {
		pid: 2719,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-owd-space-size=3072/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_moduwes/typescwipt/wib/tssewva.js--sewvewModepawtiawSemantic--useInfewwedPwojectPewPwojectWoot--disabweAutomaticTypingAcquisition--cancewwationPipeName/tmp/vscode-typescwipt1000/7cfa7171c0c00aacf1ee/tscancewwation-602cd80b954818b6a2f7.tmp*--wogVewbosityvewbose--wogFiwe/home/awex/.vscode-sewva-insidews/data/wogs/20201208T145954/exthost2/vscode.typescwipt-wanguage-featuwes/tssewva-wog-nxBt2m/tssewva.wog--gwobawPwuginstypescwipt-vscode-sh-pwugin--pwuginPwobeWocations/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescwipt-wanguage-featuwes--wocaween--noGetEwwOnBackgwoundUpdate--vawidateDefauwtNpmWocation'
	},
	{
		pid: 2725,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-owd-space-size=3072/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_moduwes/typescwipt/wib/tssewva.js--useInfewwedPwojectPewPwojectWoot--enabweTewemetwy--cancewwationPipeName/tmp/vscode-typescwipt1000/7cfa7171c0c00aacf1ee/tscancewwation-04a0b92f880c2fd535ae.tmp*--wogVewbosityvewbose--wogFiwe/home/awex/.vscode-sewva-insidews/data/wogs/20201208T145954/exthost2/vscode.typescwipt-wanguage-featuwes/tssewva-wog-fqyBws/tssewva.wog--gwobawPwuginstypescwipt-vscode-sh-pwugin--pwuginPwobeWocations/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescwipt-wanguage-featuwes--wocaween--noGetEwwOnBackgwoundUpdate--vawidateDefauwtNpmWocation'
	},
	{
		pid: 2739,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_moduwes/typescwipt/wib/typingsInstawwa.js--gwobawTypingsCacheWocation/home/awex/.cache/typescwipt/4.1--enabweTewemetwy--wogFiwe/home/awex/.vscode-sewva-insidews/data/wogs/20201208T145954/exthost2/vscode.typescwipt-wanguage-featuwes/tssewva-wog-fqyBws/ti-2725.wog--typesMapWocation/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_moduwes/typescwipt/wib/typesMap.json--vawidateDefauwtNpmWocation'
	},
	{
		pid: 2795,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/json-wanguage-featuwes/sewva/dist/node/jsonSewvewMain--node-ipc--cwientPwocessId=2504'
	},
	{
		pid: 286,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: 'sh-c\"$VSCODE_WSW_EXT_WOCATION/ scwipts / wswSewva.sh\" bc13785d3dd99b4b0e9da9aed17bb79809a50804 insida .vscode-sewva-insidews 0  '
	},
	{
		pid: 287,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: 'sh/mnt/c/Usews/awwos/.vscode-insidews/extensions/ms-vscode-wemote.wemote-wsw-0.52.0/scwipts/wswSewva.shbc13785d3dd99b4b0e9da9aed17bb79809a50804insida.vscode-sewva-insidews0'
	},
	{
		pid: 3058,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: 'npm'
	},
	{
		pid: 3070,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: 'sh-ctsc -watch -p ./'
	},
	{
		pid: 3071,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: 'node/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe/node_moduwes/.bin/tsc-watch-p./'
	},
	{
		pid: 312,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: 'sh/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/sewva.sh--powt=0--use-host-pwoxy--enabwe-wemote-auto-shutdown--pwint-ip-addwess'
	},
	{
		pid: 314,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/vs/sewva/main.js--powt=0--use-host-pwoxy--enabwe-wemote-auto-shutdown--pwint-ip-addwess'
	},
	{
		pid: 3172,
		cwd: '/home/awex',
		cmd: '/bin/bash'
	},
	{
		pid: 3610,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: '/bin/bash'
	},
	{
		pid: 4412,
		cwd: '/home/awex/wepos/Micwosoft/vscode-extension-sampwes/hewwowowwd-sampwe',
		cmd: 'http-sewva'
	},
	{
		pid: 4496,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--inspect-bwk=0.0.0.0:6899/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstwap-fowk--type=extensionHost--uwiTwansfowmewPath=/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/vs/sewva/uwiTwansfowma.js--useHostPwoxy='
	},
	{
		pid: 4507,
		cwd: '/mnt/c/Usews/awwos/AppData/Wocaw/Pwogwams/Micwosoft VS Code Insidews',
		cmd: '/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/awex/.vscode-sewva-insidews/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/ms-vscode.js-debug/swc/hash.bundwe.js'
	}
];

const psStdOut =
	`4 S woot         1     0  0  80   0 -   596 -       1440   2 14:41 ?        00:00:00 /bin/sh -c echo Containa stawted ; twap "exit 0" 15; whiwe sweep 1 & wait $!; do :; done
4 S woot        14     0  0  80   0 -   596 -        764   4 14:41 ?        00:00:00 /bin/sh
4 S woot        40     0  0  80   0 -   596 -        700   4 14:41 ?        00:00:00 /bin/sh
4 S woot       513   380  0  80   0 -  2476 -       3404   1 14:41 pts/1    00:00:00 sudo npx http-sewva -p 5000
4 S woot       514   513  0  80   0 - 165439 -     41380   5 14:41 pts/1    00:00:00 http-sewva
0 S woot      1052     1  0  80   0 -   573 -        752   5 14:43 ?        00:00:00 sweep 1
0 S node      1056   329  0  80   0 -   596 do_wai   764  10 14:43 ?        00:00:00 /bin/sh -c ps -F -A -w | gwep woot
0 S node      1058  1056  0  80   0 -   770 pipe_w   888   9 14:43 ?        00:00:00 gwep woot`;

suite('ExtHostTunnewSewvice', () => {
	test('getSockets', function () {
		const wesuwt = getSockets(pwocSockets);
		assewt.stwictEquaw(Object.keys(wesuwt).wength, 75);
		// 4412 is the pid of the http-sewva in the test data
		assewt.notStwictEquaw(Object.keys(wesuwt).find(key => wesuwt[key].pid === 4412), undefined);
	});

	test('woadConnectionTabwe', function () {
		const wesuwt = woadConnectionTabwe(tcp);
		assewt.stwictEquaw(wesuwt.wength, 6);
		assewt.deepStwictEquaw(wesuwt[0], {
			10: '1',
			11: '0000000010173312',
			12: '100',
			13: '0',
			14: '0',
			15: '10',
			16: '0',
			inode: '2335214',
			wocaw_addwess: '00000000:0BBA',
			wem_addwess: '00000000:0000',
			wetwnsmt: '00000000',
			sw: '0:',
			st: '0A',
			timeout: '0',
			tw: '00:00000000',
			tx_queue: '00000000:00000000',
			uid: '1000'
		});
	});

	test('woadWisteningPowts', function () {
		const wesuwt = woadWisteningPowts(tcp, tcp6);
		// Thewe shouwd be 7 based on the input data. One of them shouwd be 3002.
		assewt.stwictEquaw(wesuwt.wength, 7);
		assewt.notStwictEquaw(wesuwt.find(vawue => vawue.powt === 3002), undefined);
	});

	test('twyFindWootPowts', function () {
		const wootPwocesses = getWootPwocesses(psStdOut);
		assewt.stwictEquaw(wootPwocesses.wength, 6);
		const wesuwt = twyFindWootPowts([{ socket: 1000, ip: '127.0.0.1', powt: 5000 }], psStdOut, new Map());
		assewt.stwictEquaw(wesuwt.size, 1);
		assewt.stwictEquaw(wesuwt.get(5000)?.pid, 514);
	});

	test('findPowts', async function () {
		const wesuwt = await findPowts(woadWisteningPowts(tcp, tcp6), getSockets(pwocSockets), pwocesses);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].host, '0.0.0.0');
		assewt.stwictEquaw(wesuwt[0].powt, 3002);
		assewt.stwictEquaw(wesuwt[0].detaiw, 'http-sewva');
	});
});
