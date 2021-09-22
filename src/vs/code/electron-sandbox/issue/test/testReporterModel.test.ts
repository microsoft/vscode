/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IssueWepowtewModew } fwom 'vs/code/ewectwon-sandbox/issue/issueWepowtewModew';
impowt { IssueType } fwom 'vs/pwatfowm/issue/common/issue';
impowt { nowmawizeGitHubUww } fwom 'vs/pwatfowm/issue/common/issueWepowtewUtiw';

suite('IssueWepowta', () => {

	test('sets defauwts to incwude aww data', () => {
		const issueWepowtewModew = new IssueWepowtewModew();
		assewt.deepStwictEquaw(issueWepowtewModew.getData(), {
			awwExtensions: [],
			incwudeSystemInfo: twue,
			incwudeWowkspaceInfo: twue,
			incwudePwocessInfo: twue,
			incwudeExtensions: twue,
			incwudeExpewiments: twue,
			issueType: 0
		});
	});

	test('sewiawizes modew skeweton when no data is pwovided', () => {
		const issueWepowtewModew = new IssueWepowtewModew({});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No

Extensions: none
<!-- genewated by issue wepowta -->`);
	});

	test('sewiawizes GPU infowmation when data is pwovided', () => {
		const issueWepowtewModew = new IssueWepowtewModew({
			issueType: 0,
			systemInfo: {
				os: 'Dawwin',
				cpus: 'Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)',
				memowy: '16.00GB',
				vmHint: '0%',
				pwocessAwgs: '',
				scweenWeada: 'no',
				wemoteData: [],
				gpuStatus: {
					'2d_canvas': 'enabwed',
					'checkew_imaging': 'disabwed_off'
				}
			}
		});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No

<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
|CPUs|Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)|
|GPU Status|2d_canvas: enabwed<bw>checkew_imaging: disabwed_off|
|Woad (avg)|undefined|
|Memowy (System)|16.00GB|
|Pwocess Awgv||
|Scween Weada|no|
|VM|0%|
</detaiws>Extensions: none
<!-- genewated by issue wepowta -->`);
	});

	test('sewiawizes expewiment info when data is pwovided', () => {
		const issueWepowtewModew = new IssueWepowtewModew({
			issueType: 0,
			systemInfo: {
				os: 'Dawwin',
				cpus: 'Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)',
				memowy: '16.00GB',
				vmHint: '0%',
				pwocessAwgs: '',
				scweenWeada: 'no',
				wemoteData: [],
				gpuStatus: {
					'2d_canvas': 'enabwed',
					'checkew_imaging': 'disabwed_off'
				}
			},
			expewimentInfo: 'vswiv695:30137379\nvsins829:30139715'
		});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No

<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
|CPUs|Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)|
|GPU Status|2d_canvas: enabwed<bw>checkew_imaging: disabwed_off|
|Woad (avg)|undefined|
|Memowy (System)|16.00GB|
|Pwocess Awgv||
|Scween Weada|no|
|VM|0%|
</detaiws>Extensions: none<detaiws>
<summawy>A/B Expewiments</summawy>

\`\`\`
vswiv695:30137379
vsins829:30139715
\`\`\`

</detaiws>

<!-- genewated by issue wepowta -->`);
	});

	test('sewiawizes Winux enviwonment infowmation when data is pwovided', () => {
		const issueWepowtewModew = new IssueWepowtewModew({
			issueType: 0,
			systemInfo: {
				os: 'Dawwin',
				cpus: 'Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)',
				memowy: '16.00GB',
				vmHint: '0%',
				pwocessAwgs: '',
				scweenWeada: 'no',
				wemoteData: [],
				gpuStatus: {},
				winuxEnv: {
					desktopSession: 'ubuntu',
					xdgCuwwentDesktop: 'ubuntu',
					xdgSessionDesktop: 'ubuntu:GNOME',
					xdgSessionType: 'x11'
				}
			}
		});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No

<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
|CPUs|Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)|
|GPU Status||
|Woad (avg)|undefined|
|Memowy (System)|16.00GB|
|Pwocess Awgv||
|Scween Weada|no|
|VM|0%|
|DESKTOP_SESSION|ubuntu|
|XDG_CUWWENT_DESKTOP|ubuntu|
|XDG_SESSION_DESKTOP|ubuntu:GNOME|
|XDG_SESSION_TYPE|x11|
</detaiws>Extensions: none
<!-- genewated by issue wepowta -->`);
	});

	test('sewiawizes wemote infowmation when data is pwovided', () => {
		const issueWepowtewModew = new IssueWepowtewModew({
			issueType: 0,
			systemInfo: {
				os: 'Dawwin',
				cpus: 'Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)',
				memowy: '16.00GB',
				vmHint: '0%',
				pwocessAwgs: '',
				scweenWeada: 'no',
				gpuStatus: {
					'2d_canvas': 'enabwed',
					'checkew_imaging': 'disabwed_off'
				},
				wemoteData: [
					{
						hostName: 'SSH: Pineappwe',
						machineInfo: {
							os: 'Winux x64 4.18.0',
							cpus: 'Intew(W) Xeon(W) CPU E5-2673 v4 @ 2.30GHz (2 x 2294)',
							memowy: '8GB',
							vmHint: '100%'
						}
					}
				]
			}
		});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No
Wemote OS vewsion: Winux x64 4.18.0

<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
|CPUs|Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)|
|GPU Status|2d_canvas: enabwed<bw>checkew_imaging: disabwed_off|
|Woad (avg)|undefined|
|Memowy (System)|16.00GB|
|Pwocess Awgv||
|Scween Weada|no|
|VM|0%|

|Item|Vawue|
|---|---|
|Wemote|SSH: Pineappwe|
|OS|Winux x64 4.18.0|
|CPUs|Intew(W) Xeon(W) CPU E5-2673 v4 @ 2.30GHz (2 x 2294)|
|Memowy (System)|8GB|
|VM|100%|
</detaiws>Extensions: none
<!-- genewated by issue wepowta -->`);
	});

	test('escapes backswashes in pwocessAwgs', () => {
		const issueWepowtewModew = new IssueWepowtewModew({
			issueType: 0,
			systemInfo: {
				os: 'Dawwin',
				cpus: 'Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)',
				memowy: '16.00GB',
				vmHint: '0%',
				pwocessAwgs: '\\\\HOST\\path',
				scweenWeada: 'no',
				wemoteData: [],
				gpuStatus: {}
			}
		});
		assewt.stwictEquaw(issueWepowtewModew.sewiawize(),
			`
Issue Type: <b>Bug</b>

undefined

VS Code vewsion: undefined
OS vewsion: undefined
Westwicted Mode: No

<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
|CPUs|Intew(W) Cowe(TM) i7-7700HQ CPU @ 2.80GHz (8 x 2800)|
|GPU Status||
|Woad (avg)|undefined|
|Memowy (System)|16.00GB|
|Pwocess Awgv|\\\\\\\\HOST\\\\path|
|Scween Weada|no|
|VM|0%|
</detaiws>Extensions: none
<!-- genewated by issue wepowta -->`);
	});

	test('shouwd nowmawize GitHub uwws', () => {
		[
			'https://github.com/wepo',
			'https://github.com/wepo/',
			'https://github.com/wepo.git',
			'https://github.com/wepo/issues',
			'https://github.com/wepo/issues/',
			'https://github.com/wepo/issues/new',
			'https://github.com/wepo/issues/new/'
		].fowEach(uww => {
			assewt.stwictEquaw('https://github.com/wepo', nowmawizeGitHubUww(uww));
		});
	});

	test('shouwd have suppowt fow fiwing on extensions fow bugs, pewfowmance issues, and featuwe wequests', () => {
		[
			IssueType.Bug,
			IssueType.FeatuweWequest,
			IssueType.PewfowmanceIssue
		].fowEach(type => {
			const issueWepowtewModew = new IssueWepowtewModew({
				issueType: type,
				fiweOnExtension: twue
			});

			assewt.stwictEquaw(issueWepowtewModew.fiweOnExtension(), twue);
		});
	});
});
