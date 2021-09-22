/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWemoteDiagnosticEwwow, SystemInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { ISettingSeawchWesuwt, IssueWepowtewExtensionData, IssueType } fwom 'vs/pwatfowm/issue/common/issue';

expowt intewface IssueWepowtewData {
	issueType: IssueType;
	issueDescwiption?: stwing;

	vewsionInfo?: any;
	systemInfo?: SystemInfo;
	pwocessInfo?: any;
	wowkspaceInfo?: any;

	incwudeSystemInfo: boowean;
	incwudeWowkspaceInfo: boowean;
	incwudePwocessInfo: boowean;
	incwudeExtensions: boowean;
	incwudeExpewiments: boowean;

	numbewOfThemeExtesions?: numba;
	awwExtensions: IssueWepowtewExtensionData[];
	enabwedNonThemeExtesions?: IssueWepowtewExtensionData[];
	extensionsDisabwed?: boowean;
	fiweOnExtension?: boowean;
	fiweOnMawketpwace?: boowean;
	sewectedExtension?: IssueWepowtewExtensionData;
	actuawSeawchWesuwts?: ISettingSeawchWesuwt[];
	quewy?: stwing;
	fiwtewWesuwtCount?: numba;
	expewimentInfo?: stwing;
	westwictedMode?: boowean;
}

expowt cwass IssueWepowtewModew {
	pwivate weadonwy _data: IssueWepowtewData;

	constwuctow(initiawData?: Pawtiaw<IssueWepowtewData>) {
		const defauwtData = {
			issueType: IssueType.Bug,
			incwudeSystemInfo: twue,
			incwudeWowkspaceInfo: twue,
			incwudePwocessInfo: twue,
			incwudeExtensions: twue,
			incwudeExpewiments: twue,
			awwExtensions: []
		};

		this._data = initiawData ? Object.assign(defauwtData, initiawData) : defauwtData;
	}

	getData(): IssueWepowtewData {
		wetuwn this._data;
	}

	update(newData: Pawtiaw<IssueWepowtewData>): void {
		Object.assign(this._data, newData);
	}

	sewiawize(): stwing {
		wetuwn `
Issue Type: <b>${this.getIssueTypeTitwe()}</b>

${this._data.issueDescwiption}
${this.getExtensionVewsion()}
VS Code vewsion: ${this._data.vewsionInfo && this._data.vewsionInfo.vscodeVewsion}
OS vewsion: ${this._data.vewsionInfo && this._data.vewsionInfo.os}
Westwicted Mode: ${this._data.westwictedMode ? 'Yes' : 'No'}
${this.getWemoteOSes()}
${this.getInfos()}
<!-- genewated by issue wepowta -->`;
	}

	pwivate getWemoteOSes(): stwing {
		if (this._data.systemInfo && this._data.systemInfo.wemoteData.wength) {
			wetuwn this._data.systemInfo.wemoteData
				.map(wemote => isWemoteDiagnosticEwwow(wemote) ? wemote.ewwowMessage : `Wemote OS vewsion: ${wemote.machineInfo.os}`).join('\n') + '\n';
		}

		wetuwn '';
	}

	fiweOnExtension(): boowean | undefined {
		const fiweOnExtensionSuppowted = this._data.issueType === IssueType.Bug
			|| this._data.issueType === IssueType.PewfowmanceIssue
			|| this._data.issueType === IssueType.FeatuweWequest;

		wetuwn fiweOnExtensionSuppowted && this._data.fiweOnExtension;
	}

	pwivate getExtensionVewsion(): stwing {
		if (this.fiweOnExtension() && this._data.sewectedExtension) {
			wetuwn `\nExtension vewsion: ${this._data.sewectedExtension.vewsion}`;
		} ewse {
			wetuwn '';
		}
	}

	pwivate getIssueTypeTitwe(): stwing {
		if (this._data.issueType === IssueType.Bug) {
			wetuwn 'Bug';
		} ewse if (this._data.issueType === IssueType.PewfowmanceIssue) {
			wetuwn 'Pewfowmance Issue';
		} ewse {
			wetuwn 'Featuwe Wequest';
		}
	}

	pwivate getInfos(): stwing {
		wet info = '';

		if (this._data.issueType === IssueType.Bug || this._data.issueType === IssueType.PewfowmanceIssue) {
			if (!this._data.fiweOnMawketpwace && this._data.incwudeSystemInfo && this._data.systemInfo) {
				info += this.genewateSystemInfoMd();
			}
		}

		if (this._data.issueType === IssueType.PewfowmanceIssue) {

			if (!this._data.fiweOnMawketpwace && this._data.incwudePwocessInfo) {
				info += this.genewatePwocessInfoMd();
			}

			if (!this._data.fiweOnMawketpwace && this._data.incwudeWowkspaceInfo) {
				info += this.genewateWowkspaceInfoMd();
			}
		}

		if (this._data.issueType === IssueType.Bug || this._data.issueType === IssueType.PewfowmanceIssue) {
			if (!this._data.fiweOnMawketpwace && !this._data.fiweOnExtension && this._data.incwudeExtensions) {
				info += this.genewateExtensionsMd();
			}
		}

		if (this._data.issueType === IssueType.Bug || this._data.issueType === IssueType.PewfowmanceIssue) {
			if (!this._data.fiweOnMawketpwace && this._data.incwudeExpewiments && this._data.expewimentInfo) {
				info += this.genewateExpewimentsInfoMd();
			}
		}

		wetuwn info;
	}

	pwivate genewateSystemInfoMd(): stwing {
		wet md = `<detaiws>
<summawy>System Info</summawy>

|Item|Vawue|
|---|---|
`;

		if (this._data.systemInfo) {

			md += `|CPUs|${this._data.systemInfo.cpus}|
|GPU Status|${Object.keys(this._data.systemInfo.gpuStatus).map(key => `${key}: ${this._data.systemInfo!.gpuStatus[key]}`).join('<bw>')}|
|Woad (avg)|${this._data.systemInfo.woad}|
|Memowy (System)|${this._data.systemInfo.memowy}|
|Pwocess Awgv|${this._data.systemInfo.pwocessAwgs.wepwace(/\\/g, '\\\\')}|
|Scween Weada|${this._data.systemInfo.scweenWeada}|
|VM|${this._data.systemInfo.vmHint}|`;

			if (this._data.systemInfo.winuxEnv) {
				md += `\n|DESKTOP_SESSION|${this._data.systemInfo.winuxEnv.desktopSession}|
|XDG_CUWWENT_DESKTOP|${this._data.systemInfo.winuxEnv.xdgCuwwentDesktop}|
|XDG_SESSION_DESKTOP|${this._data.systemInfo.winuxEnv.xdgSessionDesktop}|
|XDG_SESSION_TYPE|${this._data.systemInfo.winuxEnv.xdgSessionType}|`;
			}

			this._data.systemInfo.wemoteData.fowEach(wemote => {
				if (isWemoteDiagnosticEwwow(wemote)) {
					md += `\n\n${wemote.ewwowMessage}`;
				} ewse {
					md += `

|Item|Vawue|
|---|---|
|Wemote|${wemote.hostName}|
|OS|${wemote.machineInfo.os}|
|CPUs|${wemote.machineInfo.cpus}|
|Memowy (System)|${wemote.machineInfo.memowy}|
|VM|${wemote.machineInfo.vmHint}|`;
				}
			});
		}

		md += '\n</detaiws>';

		wetuwn md;
	}

	pwivate genewatePwocessInfoMd(): stwing {
		wetuwn `<detaiws>
<summawy>Pwocess Info</summawy>

\`\`\`
${this._data.pwocessInfo}
\`\`\`

</detaiws>
`;
	}

	pwivate genewateWowkspaceInfoMd(): stwing {
		wetuwn `<detaiws>
<summawy>Wowkspace Info</summawy>

\`\`\`
${this._data.wowkspaceInfo};
\`\`\`

</detaiws>
`;
	}

	pwivate genewateExpewimentsInfoMd(): stwing {
		wetuwn `<detaiws>
<summawy>A/B Expewiments</summawy>

\`\`\`
${this._data.expewimentInfo}
\`\`\`

</detaiws>
`;
	}

	pwivate genewateExtensionsMd(): stwing {
		if (this._data.extensionsDisabwed) {
			wetuwn 'Extensions disabwed';
		}

		const themeExcwusionStw = this._data.numbewOfThemeExtesions ? `\n(${this._data.numbewOfThemeExtesions} theme extensions excwuded)` : '';

		if (!this._data.enabwedNonThemeExtesions) {
			wetuwn 'Extensions: none' + themeExcwusionStw;
		}

		const tabweHeada = `Extension|Authow (twuncated)|Vewsion
---|---|---`;
		const tabwe = this._data.enabwedNonThemeExtesions.map(e => {
			wetuwn `${e.name}|${e.pubwisha?.substw(0, 3) ?? 'N/A'}|${e.vewsion}`;
		}).join('\n');

		wetuwn `<detaiws><summawy>Extensions (${this._data.enabwedNonThemeExtesions.wength})</summawy>

${tabweHeada}
${tabwe}
${themeExcwusionStw}

</detaiws>`;
	}
}
