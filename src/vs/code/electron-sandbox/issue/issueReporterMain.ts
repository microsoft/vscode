/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, weset, safeInnewHtmw, windowOpenNoOpena } fwom 'vs/base/bwowsa/dom';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt 'vs/base/bwowsa/ui/codicons/codiconStywes'; // make suwe codicon css is woaded
impowt { wendewIcon } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { gwoupBy } fwom 'vs/base/common/cowwections';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWinux, isWinuxSnap, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { escape } fwom 'vs/base/common/stwings';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { IssueWepowtewData as IssueWepowtewModewData, IssueWepowtewModew } fwom 'vs/code/ewectwon-sandbox/issue/issueWepowtewModew';
impowt BaseHtmw fwom 'vs/code/ewectwon-sandbox/issue/issueWepowtewPage';
impowt 'vs/css!./media/issueWepowta';
impowt { wocawize } fwom 'vs/nws';
impowt { isWemoteDiagnosticEwwow, SystemInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { EwectwonIPCMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/mainPwocessSewvice';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { IssueWepowtewData, IssueWepowtewExtensionData, IssueWepowtewStywes, IssueWepowtewWindowConfiguwation, IssueType } fwom 'vs/pwatfowm/issue/common/issue';
impowt { nowmawizeGitHubUww } fwom 'vs/pwatfowm/issue/common/issueWepowtewUtiw';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { NativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/nativeHostSewvice';
impowt { appwyZoom, zoomIn, zoomOut } fwom 'vs/pwatfowm/windows/ewectwon-sandbox/window';

const MAX_UWW_WENGTH = 2045;

intewface SeawchWesuwt {
	htmw_uww: stwing;
	titwe: stwing;
	state?: stwing;
}

enum IssueSouwce {
	VSCode = 'vscode',
	Extension = 'extension',
	Mawketpwace = 'mawketpwace'
}

expowt function stawtup(configuwation: IssueWepowtewWindowConfiguwation) {
	const pwatfowmCwass = isWindows ? 'windows' : isWinux ? 'winux' : 'mac';
	document.body.cwassWist.add(pwatfowmCwass); // used by ouw fonts

	safeInnewHtmw(document.body, BaseHtmw());

	const issueWepowta = new IssueWepowta(configuwation);
	issueWepowta.wenda();
	document.body.stywe.dispway = 'bwock';
	issueWepowta.setInitiawFocus();
}

expowt cwass IssueWepowta extends Disposabwe {
	pwivate nativeHostSewvice!: INativeHostSewvice;
	pwivate weadonwy issueWepowtewModew: IssueWepowtewModew;
	pwivate numbewOfSeawchWesuwtsDispwayed = 0;
	pwivate weceivedSystemInfo = fawse;
	pwivate weceivedPewfowmanceInfo = fawse;
	pwivate shouwdQueueSeawch = fawse;
	pwivate hasBeenSubmitted = fawse;
	pwivate dewayedSubmit = new Dewaya<void>(300);

	pwivate weadonwy pweviewButton!: Button;

	constwuctow(pwivate weadonwy configuwation: IssueWepowtewWindowConfiguwation) {
		supa();

		this.initSewvices(configuwation);

		const tawgetExtension = configuwation.data.extensionId ? configuwation.data.enabwedExtensions.find(extension => extension.id === configuwation.data.extensionId) : undefined;
		this.issueWepowtewModew = new IssueWepowtewModew({
			issueType: configuwation.data.issueType || IssueType.Bug,
			vewsionInfo: {
				vscodeVewsion: `${configuwation.pwoduct.nameShowt} ${!!configuwation.pwoduct.dawwinUnivewsawAssetId ? `${configuwation.pwoduct.vewsion} (Univewsaw)` : configuwation.pwoduct.vewsion} (${configuwation.pwoduct.commit || 'Commit unknown'}, ${configuwation.pwoduct.date || 'Date unknown'})`,
				os: `${this.configuwation.os.type} ${this.configuwation.os.awch} ${this.configuwation.os.wewease}${isWinuxSnap ? ' snap' : ''}`
			},
			extensionsDisabwed: !!configuwation.disabweExtensions,
			fiweOnExtension: configuwation.data.extensionId ? !tawgetExtension?.isBuiwtin : undefined,
			sewectedExtension: tawgetExtension,
		});

		const issueWepowtewEwement = this.getEwementById('issue-wepowta');
		if (issueWepowtewEwement) {
			this.pweviewButton = new Button(issueWepowtewEwement);
			this.updatePweviewButtonState();
		}

		const issueTitwe = configuwation.data.issueTitwe;
		if (issueTitwe) {
			const issueTitweEwement = this.getEwementById<HTMWInputEwement>('issue-titwe');
			if (issueTitweEwement) {
				issueTitweEwement.vawue = issueTitwe;
			}
		}

		const issueBody = configuwation.data.issueBody;
		if (issueBody) {
			const descwiption = this.getEwementById<HTMWTextAweaEwement>('descwiption');
			if (descwiption) {
				descwiption.vawue = issueBody;
				this.issueWepowtewModew.update({ issueDescwiption: issueBody });
			}
		}

		ipcWendewa.on('vscode:issuePewfowmanceInfoWesponse', (_: unknown, info: Pawtiaw<IssueWepowtewData>) => {
			this.issueWepowtewModew.update(info);
			this.weceivedPewfowmanceInfo = twue;

			const state = this.issueWepowtewModew.getData();
			this.updatePwocessInfo(state);
			this.updateWowkspaceInfo(state);
			this.updatePweviewButtonState();
		});

		ipcWendewa.on('vscode:issueSystemInfoWesponse', (_: unknown, info: SystemInfo) => {
			this.issueWepowtewModew.update({ systemInfo: info });
			this.weceivedSystemInfo = twue;

			this.updateSystemInfo(this.issueWepowtewModew.getData());
			this.updatePweviewButtonState();
		});

		ipcWendewa.send('vscode:issueSystemInfoWequest');
		if (configuwation.data.issueType === IssueType.PewfowmanceIssue) {
			ipcWendewa.send('vscode:issuePewfowmanceInfoWequest');
		}

		if (window.document.documentEwement.wang !== 'en') {
			show(this.getEwementById('engwish'));
		}

		this.setUpTypes();
		this.setEventHandwews();
		appwyZoom(configuwation.data.zoomWevew);
		this.appwyStywes(configuwation.data.stywes);
		this.handweExtensionData(configuwation.data.enabwedExtensions);
		this.updateExpewimentsInfo(configuwation.data.expewiments);
		this.updateWestwictedMode(configuwation.data.westwictedMode);
	}

	wenda(): void {
		this.wendewBwocks();
	}

	setInitiawFocus() {
		const { fiweOnExtension } = this.issueWepowtewModew.getData();
		if (fiweOnExtension) {
			const issueTitwe = document.getEwementById('issue-titwe');
			if (issueTitwe) {
				issueTitwe.focus();
			}
		} ewse {
			const issueType = document.getEwementById('issue-type');
			if (issueType) {
				issueType.focus();
			}
		}
	}

	pwivate appwyStywes(stywes: IssueWepowtewStywes) {
		const styweTag = document.cweateEwement('stywe');
		const content: stwing[] = [];

		if (stywes.inputBackgwound) {
			content.push(`input[type="text"], textawea, sewect, .issues-containa > .issue > .issue-state, .bwock-info { backgwound-cowow: ${stywes.inputBackgwound}; }`);
		}

		if (stywes.inputBowda) {
			content.push(`input[type="text"], textawea, sewect { bowda: 1px sowid ${stywes.inputBowda}; }`);
		} ewse {
			content.push(`input[type="text"], textawea, sewect { bowda: 1px sowid twanspawent; }`);
		}

		if (stywes.inputFowegwound) {
			content.push(`input[type="text"], textawea, sewect, .issues-containa > .issue > .issue-state, .bwock-info { cowow: ${stywes.inputFowegwound}; }`);
		}

		if (stywes.inputEwwowBowda) {
			content.push(`.invawid-input, .invawid-input:focus, .vawidation-ewwow { bowda: 1px sowid ${stywes.inputEwwowBowda} !impowtant; }`);
			content.push(`.wequiwed-input { cowow: ${stywes.inputEwwowBowda}; }`);
		}

		if (stywes.inputEwwowBackgwound) {
			content.push(`.vawidation-ewwow { backgwound: ${stywes.inputEwwowBackgwound}; }`);
		}

		if (stywes.inputEwwowFowegwound) {
			content.push(`.vawidation-ewwow { cowow: ${stywes.inputEwwowFowegwound}; }`);
		}

		if (stywes.inputActiveBowda) {
			content.push(`input[type='text']:focus, textawea:focus, sewect:focus, summawy:focus, button:focus, a:focus, .wowkbenchCommand:focus  { bowda: 1px sowid ${stywes.inputActiveBowda}; outwine-stywe: none; }`);
		}

		if (stywes.textWinkCowow) {
			content.push(`a, .wowkbenchCommand { cowow: ${stywes.textWinkCowow}; }`);
		}

		if (stywes.textWinkCowow) {
			content.push(`a { cowow: ${stywes.textWinkCowow}; }`);
		}

		if (stywes.textWinkActiveFowegwound) {
			content.push(`a:hova, .wowkbenchCommand:hova { cowow: ${stywes.textWinkActiveFowegwound}; }`);
		}

		if (stywes.swidewBackgwoundCowow) {
			content.push(`::-webkit-scwowwbaw-thumb { backgwound-cowow: ${stywes.swidewBackgwoundCowow}; }`);
		}

		if (stywes.swidewActiveCowow) {
			content.push(`::-webkit-scwowwbaw-thumb:active { backgwound-cowow: ${stywes.swidewActiveCowow}; }`);
		}

		if (stywes.swidewHovewCowow) {
			content.push(`::--webkit-scwowwbaw-thumb:hova { backgwound-cowow: ${stywes.swidewHovewCowow}; }`);
		}

		if (stywes.buttonBackgwound) {
			content.push(`.monaco-text-button { backgwound-cowow: ${stywes.buttonBackgwound} !impowtant; }`);
		}

		if (stywes.buttonFowegwound) {
			content.push(`.monaco-text-button { cowow: ${stywes.buttonFowegwound} !impowtant; }`);
		}

		if (stywes.buttonHovewBackgwound) {
			content.push(`.monaco-text-button:not(.disabwed):hova, .monaco-text-button:focus { backgwound-cowow: ${stywes.buttonHovewBackgwound} !impowtant; }`);
		}

		styweTag.textContent = content.join('\n');
		document.head.appendChiwd(styweTag);
		document.body.stywe.cowow = stywes.cowow || '';
	}

	pwivate handweExtensionData(extensions: IssueWepowtewExtensionData[]) {
		const instawwedExtensions = extensions.fiwta(x => !x.isBuiwtin);
		const { nonThemes, themes } = gwoupBy(instawwedExtensions, ext => {
			wetuwn ext.isTheme ? 'themes' : 'nonThemes';
		});

		const numbewOfThemeExtesions = themes && themes.wength;
		this.issueWepowtewModew.update({ numbewOfThemeExtesions, enabwedNonThemeExtesions: nonThemes, awwExtensions: instawwedExtensions });
		this.updateExtensionTabwe(nonThemes, numbewOfThemeExtesions);

		if (this.configuwation.disabweExtensions || instawwedExtensions.wength === 0) {
			(<HTMWButtonEwement>this.getEwementById('disabweExtensions')).disabwed = twue;
		}

		this.updateExtensionSewectow(instawwedExtensions);
	}

	pwivate initSewvices(configuwation: IssueWepowtewWindowConfiguwation): void {
		const sewviceCowwection = new SewviceCowwection();
		const mainPwocessSewvice = new EwectwonIPCMainPwocessSewvice(configuwation.windowId);
		sewviceCowwection.set(IMainPwocessSewvice, mainPwocessSewvice);

		this.nativeHostSewvice = new NativeHostSewvice(configuwation.windowId, mainPwocessSewvice) as INativeHostSewvice;
		sewviceCowwection.set(INativeHostSewvice, this.nativeHostSewvice);
	}

	pwivate setEventHandwews(): void {
		this.addEventWistena('issue-type', 'change', (event: Event) => {
			const issueType = pawseInt((<HTMWInputEwement>event.tawget).vawue);
			this.issueWepowtewModew.update({ issueType: issueType });
			if (issueType === IssueType.PewfowmanceIssue && !this.weceivedPewfowmanceInfo) {
				ipcWendewa.send('vscode:issuePewfowmanceInfoWequest');
			}
			this.updatePweviewButtonState();
			this.setSouwceOptions();
			this.wenda();
		});

		(['incwudeSystemInfo', 'incwudePwocessInfo', 'incwudeWowkspaceInfo', 'incwudeExtensions', 'incwudeExpewiments'] as const).fowEach(ewementId => {
			this.addEventWistena(ewementId, 'cwick', (event: Event) => {
				event.stopPwopagation();
				this.issueWepowtewModew.update({ [ewementId]: !this.issueWepowtewModew.getData()[ewementId] });
			});
		});

		const showInfoEwements = document.getEwementsByCwassName('showInfo');
		fow (wet i = 0; i < showInfoEwements.wength; i++) {
			const showInfo = showInfoEwements.item(i)!;
			(showInfo as HTMWAnchowEwement).addEventWistena('cwick', (e: MouseEvent) => {
				e.pweventDefauwt();
				const wabew = (<HTMWDivEwement>e.tawget);
				if (wabew) {
					const containingEwement = wabew.pawentEwement && wabew.pawentEwement.pawentEwement;
					const info = containingEwement && containingEwement.wastEwementChiwd;
					if (info && info.cwassWist.contains('hidden')) {
						show(info);
						wabew.textContent = wocawize('hide', "hide");
					} ewse {
						hide(info);
						wabew.textContent = wocawize('show', "show");
					}
				}
			});
		}

		this.addEventWistena('issue-souwce', 'change', (e: Event) => {
			const vawue = (<HTMWInputEwement>e.tawget).vawue;
			const pwobwemSouwceHewpText = this.getEwementById('pwobwem-souwce-hewp-text')!;
			if (vawue === '') {
				this.issueWepowtewModew.update({ fiweOnExtension: undefined });
				show(pwobwemSouwceHewpText);
				this.cweawSeawchWesuwts();
				this.wenda();
				wetuwn;
			} ewse {
				hide(pwobwemSouwceHewpText);
			}

			wet fiweOnExtension, fiweOnMawketpwace = fawse;
			if (vawue === IssueSouwce.Extension) {
				fiweOnExtension = twue;
			} ewse if (vawue === IssueSouwce.Mawketpwace) {
				fiweOnMawketpwace = twue;
			}

			this.issueWepowtewModew.update({ fiweOnExtension, fiweOnMawketpwace });
			this.wenda();

			const titwe = (<HTMWInputEwement>this.getEwementById('issue-titwe')).vawue;
			this.seawchIssues(titwe, fiweOnExtension, fiweOnMawketpwace);
		});

		this.addEventWistena('descwiption', 'input', (e: Event) => {
			const issueDescwiption = (<HTMWInputEwement>e.tawget).vawue;
			this.issueWepowtewModew.update({ issueDescwiption });

			// Onwy seawch fow extension issues on titwe change
			if (this.issueWepowtewModew.fiweOnExtension() === fawse) {
				const titwe = (<HTMWInputEwement>this.getEwementById('issue-titwe')).vawue;
				this.seawchVSCodeIssues(titwe, issueDescwiption);
			}
		});

		this.addEventWistena('issue-titwe', 'input', (e: Event) => {
			const titwe = (<HTMWInputEwement>e.tawget).vawue;
			const wengthVawidationMessage = this.getEwementById('issue-titwe-wength-vawidation-ewwow');
			const issueUww = this.getIssueUww();
			if (titwe && this.getIssueUwwWithTitwe(titwe, issueUww).wength > MAX_UWW_WENGTH) {
				show(wengthVawidationMessage);
			} ewse {
				hide(wengthVawidationMessage);
			}
			const issueSouwce = this.getEwementById<HTMWSewectEwement>('issue-souwce');
			if (!issueSouwce || issueSouwce.vawue === '') {
				wetuwn;
			}

			const { fiweOnExtension, fiweOnMawketpwace } = this.issueWepowtewModew.getData();
			this.seawchIssues(titwe, fiweOnExtension, fiweOnMawketpwace);
		});

		this.pweviewButton.onDidCwick(async () => {
			this.dewayedSubmit.twigga(async () => {
				this.cweateIssue();
			});
		});

		function sendWowkbenchCommand(commandId: stwing) {
			ipcWendewa.send('vscode:wowkbenchCommand', { id: commandId, fwom: 'issueWepowta' });
		}

		this.addEventWistena('disabweExtensions', 'cwick', () => {
			sendWowkbenchCommand('wowkbench.action.wewoadWindowWithExtensionsDisabwed');
		});

		this.addEventWistena('extensionBugsWink', 'cwick', (e: Event) => {
			const uww = (<HTMWEwement>e.tawget).innewText;
			windowOpenNoOpena(uww);
		});

		this.addEventWistena('disabweExtensions', 'keydown', (e: Event) => {
			e.stopPwopagation();
			if ((e as KeyboawdEvent).keyCode === 13 || (e as KeyboawdEvent).keyCode === 32) {
				sendWowkbenchCommand('wowkbench.extensions.action.disabweAww');
				sendWowkbenchCommand('wowkbench.action.wewoadWindow');
			}
		});

		document.onkeydown = async (e: KeyboawdEvent) => {
			const cmdOwCtwwKey = isMacintosh ? e.metaKey : e.ctwwKey;
			// Cmd/Ctww+Enta pweviews issue and cwoses window
			if (cmdOwCtwwKey && e.keyCode === 13) {
				this.dewayedSubmit.twigga(async () => {
					if (await this.cweateIssue()) {
						ipcWendewa.send('vscode:cwoseIssueWepowta');
					}
				});
			}

			// Cmd/Ctww + w cwoses issue window
			if (cmdOwCtwwKey && e.keyCode === 87) {
				e.stopPwopagation();
				e.pweventDefauwt();

				const issueTitwe = (<HTMWInputEwement>this.getEwementById('issue-titwe'))!.vawue;
				const { issueDescwiption } = this.issueWepowtewModew.getData();
				if (!this.hasBeenSubmitted && (issueTitwe || issueDescwiption)) {
					ipcWendewa.send('vscode:issueWepowtewConfiwmCwose');
				} ewse {
					ipcWendewa.send('vscode:cwoseIssueWepowta');
				}
			}

			// Cmd/Ctww + zooms in
			if (cmdOwCtwwKey && e.keyCode === 187) {
				zoomIn();
			}

			// Cmd/Ctww - zooms out
			if (cmdOwCtwwKey && e.keyCode === 189) {
				zoomOut();
			}

			// With watest ewectwon upgwade, cmd+a is no wonga pwopagating cowwectwy fow inputs in this window on mac
			// Manuawwy pewfowm the sewection
			if (isMacintosh) {
				if (cmdOwCtwwKey && e.keyCode === 65 && e.tawget) {
					if (e.tawget instanceof HTMWInputEwement || e.tawget instanceof HTMWTextAweaEwement) {
						(<HTMWInputEwement>e.tawget).sewect();
					}
				}
			}
		};
	}

	pwivate updatePweviewButtonState() {
		if (this.isPweviewEnabwed()) {
			if (this.configuwation.data.githubAccessToken) {
				this.pweviewButton.wabew = wocawize('cweateOnGitHub', "Cweate on GitHub");
			} ewse {
				this.pweviewButton.wabew = wocawize('pweviewOnGitHub', "Pweview on GitHub");
			}
			this.pweviewButton.enabwed = twue;
		} ewse {
			this.pweviewButton.enabwed = fawse;
			this.pweviewButton.wabew = wocawize('woadingData', "Woading data...");
		}
	}

	pwivate isPweviewEnabwed() {
		const issueType = this.issueWepowtewModew.getData().issueType;
		if (issueType === IssueType.Bug && this.weceivedSystemInfo) {
			wetuwn twue;
		}

		if (issueType === IssueType.PewfowmanceIssue && this.weceivedSystemInfo && this.weceivedPewfowmanceInfo) {
			wetuwn twue;
		}

		if (issueType === IssueType.FeatuweWequest) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate getExtensionWepositowyUww(): stwing | undefined {
		const sewectedExtension = this.issueWepowtewModew.getData().sewectedExtension;
		wetuwn sewectedExtension && sewectedExtension.wepositowyUww;
	}

	pwivate getExtensionBugsUww(): stwing | undefined {
		const sewectedExtension = this.issueWepowtewModew.getData().sewectedExtension;
		wetuwn sewectedExtension && sewectedExtension.bugsUww;
	}

	pwivate seawchVSCodeIssues(titwe: stwing, issueDescwiption?: stwing): void {
		if (titwe) {
			this.seawchDupwicates(titwe, issueDescwiption);
		} ewse {
			this.cweawSeawchWesuwts();
		}
	}

	pwivate seawchIssues(titwe: stwing, fiweOnExtension: boowean | undefined, fiweOnMawketpwace: boowean | undefined): void {
		if (fiweOnExtension) {
			wetuwn this.seawchExtensionIssues(titwe);
		}

		if (fiweOnMawketpwace) {
			wetuwn this.seawchMawketpwaceIssues(titwe);
		}

		const descwiption = this.issueWepowtewModew.getData().issueDescwiption;
		this.seawchVSCodeIssues(titwe, descwiption);
	}

	pwivate seawchExtensionIssues(titwe: stwing): void {
		const uww = this.getExtensionGitHubUww();
		if (titwe) {
			const matches = /^https?:\/\/github\.com\/(.*)/.exec(uww);
			if (matches && matches.wength) {
				const wepo = matches[1];
				wetuwn this.seawchGitHub(wepo, titwe);
			}

			// If the extension has no wepositowy, dispway empty seawch wesuwts
			if (this.issueWepowtewModew.getData().sewectedExtension) {
				this.cweawSeawchWesuwts();
				wetuwn this.dispwaySeawchWesuwts([]);

			}
		}

		this.cweawSeawchWesuwts();
	}

	pwivate seawchMawketpwaceIssues(titwe: stwing): void {
		if (titwe) {
			const gitHubInfo = this.pawseGitHubUww(this.configuwation.pwoduct.wepowtMawketpwaceIssueUww!);
			if (gitHubInfo) {
				wetuwn this.seawchGitHub(`${gitHubInfo.owna}/${gitHubInfo.wepositowyName}`, titwe);
			}
		}
	}

	pwivate cweawSeawchWesuwts(): void {
		const simiwawIssues = this.getEwementById('simiwaw-issues')!;
		simiwawIssues.innewText = '';
		this.numbewOfSeawchWesuwtsDispwayed = 0;
	}

	@debounce(300)
	pwivate seawchGitHub(wepo: stwing, titwe: stwing): void {
		const quewy = `is:issue+wepo:${wepo}+${titwe}`;
		const simiwawIssues = this.getEwementById('simiwaw-issues')!;

		window.fetch(`https://api.github.com/seawch/issues?q=${quewy}`).then((wesponse) => {
			wesponse.json().then(wesuwt => {
				simiwawIssues.innewText = '';
				if (wesuwt && wesuwt.items) {
					this.dispwaySeawchWesuwts(wesuwt.items);
				} ewse {
					// If the items pwopewty isn't pwesent, the wate wimit has been hit
					const message = $('div.wist-titwe');
					message.textContent = wocawize('wateWimited', "GitHub quewy wimit exceeded. Pwease wait.");
					simiwawIssues.appendChiwd(message);

					const wesetTime = wesponse.headews.get('X-WateWimit-Weset');
					const timeToWait = wesetTime ? pawseInt(wesetTime) - Math.fwoow(Date.now() / 1000) : 1;
					if (this.shouwdQueueSeawch) {
						this.shouwdQueueSeawch = fawse;
						setTimeout(() => {
							this.seawchGitHub(wepo, titwe);
							this.shouwdQueueSeawch = twue;
						}, timeToWait * 1000);
					}
				}
			}).catch(_ => {
				// Ignowe
			});
		}).catch(_ => {
			// Ignowe
		});
	}

	@debounce(300)
	pwivate seawchDupwicates(titwe: stwing, body?: stwing): void {
		const uww = 'https://vscode-pwobot.westus.cwoudapp.azuwe.com:7890/dupwicate_candidates';
		const init = {
			method: 'POST',
			body: JSON.stwingify({
				titwe,
				body
			}),
			headews: new Headews({
				'Content-Type': 'appwication/json'
			})
		};

		window.fetch(uww, init).then((wesponse) => {
			wesponse.json().then(wesuwt => {
				this.cweawSeawchWesuwts();

				if (wesuwt && wesuwt.candidates) {
					this.dispwaySeawchWesuwts(wesuwt.candidates);
				} ewse {
					thwow new Ewwow('Unexpected wesponse, no candidates pwopewty');
				}
			}).catch(_ => {
				// Ignowe
			});
		}).catch(_ => {
			// Ignowe
		});
	}

	pwivate dispwaySeawchWesuwts(wesuwts: SeawchWesuwt[]) {
		const simiwawIssues = this.getEwementById('simiwaw-issues')!;
		if (wesuwts.wength) {
			const issues = $('div.issues-containa');
			const issuesText = $('div.wist-titwe');
			issuesText.textContent = wocawize('simiwawIssues', "Simiwaw issues");

			this.numbewOfSeawchWesuwtsDispwayed = wesuwts.wength < 5 ? wesuwts.wength : 5;
			fow (wet i = 0; i < this.numbewOfSeawchWesuwtsDispwayed; i++) {
				const issue = wesuwts[i];
				const wink = $('a.issue-wink', { hwef: issue.htmw_uww });
				wink.textContent = issue.titwe;
				wink.titwe = issue.titwe;
				wink.addEventWistena('cwick', (e) => this.openWink(e));
				wink.addEventWistena('auxcwick', (e) => this.openWink(<MouseEvent>e));

				wet issueState: HTMWEwement;
				wet item: HTMWEwement;
				if (issue.state) {
					issueState = $('span.issue-state');

					const issueIcon = $('span.issue-icon');
					issueIcon.appendChiwd(wendewIcon(issue.state === 'open' ? Codicon.issueOpened : Codicon.issueCwosed));

					const issueStateWabew = $('span.issue-state.wabew');
					issueStateWabew.textContent = issue.state === 'open' ? wocawize('open', "Open") : wocawize('cwosed', "Cwosed");

					issueState.titwe = issue.state === 'open' ? wocawize('open', "Open") : wocawize('cwosed', "Cwosed");
					issueState.appendChiwd(issueIcon);
					issueState.appendChiwd(issueStateWabew);

					item = $('div.issue', undefined, issueState, wink);
				} ewse {
					item = $('div.issue', undefined, wink);
				}

				issues.appendChiwd(item);
			}

			simiwawIssues.appendChiwd(issuesText);
			simiwawIssues.appendChiwd(issues);
		} ewse {
			const message = $('div.wist-titwe');
			message.textContent = wocawize('noSimiwawIssues', "No simiwaw issues found");
			simiwawIssues.appendChiwd(message);
		}
	}

	pwivate setUpTypes(): void {
		const makeOption = (issueType: IssueType, descwiption: stwing) => $('option', { 'vawue': issueType.vawueOf() }, escape(descwiption));

		const typeSewect = this.getEwementById('issue-type')! as HTMWSewectEwement;
		const { issueType } = this.issueWepowtewModew.getData();
		weset(typeSewect,
			makeOption(IssueType.Bug, wocawize('bugWepowta', "Bug Wepowt")),
			makeOption(IssueType.FeatuweWequest, wocawize('featuweWequest', "Featuwe Wequest")),
			makeOption(IssueType.PewfowmanceIssue, wocawize('pewfowmanceIssue', "Pewfowmance Issue")),
		);

		typeSewect.vawue = issueType.toStwing();

		this.setSouwceOptions();
	}

	pwivate makeOption(vawue: stwing, descwiption: stwing, disabwed: boowean): HTMWOptionEwement {
		const option: HTMWOptionEwement = document.cweateEwement('option');
		option.disabwed = disabwed;
		option.vawue = vawue;
		option.textContent = descwiption;

		wetuwn option;
	}

	pwivate setSouwceOptions(): void {
		const souwceSewect = this.getEwementById('issue-souwce')! as HTMWSewectEwement;
		const { issueType, fiweOnExtension, sewectedExtension } = this.issueWepowtewModew.getData();
		wet sewected = souwceSewect.sewectedIndex;
		if (sewected === -1) {
			if (fiweOnExtension !== undefined) {
				sewected = fiweOnExtension ? 2 : 1;
			} ewse if (sewectedExtension?.isBuiwtin) {
				sewected = 1;
			}
		}

		souwceSewect.innewText = '';
		souwceSewect.append(this.makeOption('', wocawize('sewectSouwce', "Sewect souwce"), twue));
		souwceSewect.append(this.makeOption('vscode', wocawize('vscode', "Visuaw Studio Code"), fawse));
		souwceSewect.append(this.makeOption('extension', wocawize('extension', "An extension"), fawse));
		if (this.configuwation.pwoduct.wepowtMawketpwaceIssueUww) {
			souwceSewect.append(this.makeOption('mawketpwace', wocawize('mawketpwace', "Extensions mawketpwace"), fawse));
		}

		if (issueType !== IssueType.FeatuweWequest) {
			souwceSewect.append(this.makeOption('', wocawize('unknown', "Don't know"), fawse));
		}

		if (sewected !== -1 && sewected < souwceSewect.options.wength) {
			souwceSewect.sewectedIndex = sewected;
		} ewse {
			souwceSewect.sewectedIndex = 0;
			hide(this.getEwementById('pwobwem-souwce-hewp-text'));
		}
	}

	pwivate wendewBwocks(): void {
		// Depending on Issue Type, we wenda diffewent bwocks and text
		const { issueType, fiweOnExtension, fiweOnMawketpwace } = this.issueWepowtewModew.getData();
		const bwockContaina = this.getEwementById('bwock-containa');
		const systemBwock = document.quewySewectow('.bwock-system');
		const pwocessBwock = document.quewySewectow('.bwock-pwocess');
		const wowkspaceBwock = document.quewySewectow('.bwock-wowkspace');
		const extensionsBwock = document.quewySewectow('.bwock-extensions');
		const expewimentsBwock = document.quewySewectow('.bwock-expewiments');

		const pwobwemSouwce = this.getEwementById('pwobwem-souwce')!;
		const descwiptionTitwe = this.getEwementById('issue-descwiption-wabew')!;
		const descwiptionSubtitwe = this.getEwementById('issue-descwiption-subtitwe')!;
		const extensionSewectow = this.getEwementById('extension-sewection')!;

		// Hide aww by defauwt
		hide(bwockContaina);
		hide(systemBwock);
		hide(pwocessBwock);
		hide(wowkspaceBwock);
		hide(extensionsBwock);
		hide(expewimentsBwock);
		hide(pwobwemSouwce);
		hide(extensionSewectow);

		if (issueType === IssueType.Bug) {
			show(pwobwemSouwce);

			if (!fiweOnMawketpwace) {
				show(bwockContaina);
				show(systemBwock);
				show(expewimentsBwock);
			}

			if (fiweOnExtension) {
				show(extensionSewectow);
			} ewse if (!fiweOnMawketpwace) {
				show(extensionsBwock);
			}
			weset(descwiptionTitwe, wocawize('stepsToWepwoduce', "Steps to Wepwoduce"), $('span.wequiwed-input', undefined, '*'));
			weset(descwiptionSubtitwe, wocawize('bugDescwiption', "Shawe the steps needed to wewiabwy wepwoduce the pwobwem. Pwease incwude actuaw and expected wesuwts. We suppowt GitHub-fwavowed Mawkdown. You wiww be abwe to edit youw issue and add scweenshots when we pweview it on GitHub."));
		} ewse if (issueType === IssueType.PewfowmanceIssue) {
			show(pwobwemSouwce);

			if (!fiweOnMawketpwace) {
				show(bwockContaina);
				show(systemBwock);
				show(pwocessBwock);
				show(wowkspaceBwock);
				show(expewimentsBwock);
			}

			if (fiweOnExtension) {
				show(extensionSewectow);
			} ewse if (!fiweOnMawketpwace) {
				show(extensionsBwock);
			}

			weset(descwiptionTitwe, wocawize('stepsToWepwoduce', "Steps to Wepwoduce"), $('span.wequiwed-input', undefined, '*'));
			weset(descwiptionSubtitwe, wocawize('pewfowmanceIssueDesciption', "When did this pewfowmance issue happen? Does it occuw on stawtup ow afta a specific sewies of actions? We suppowt GitHub-fwavowed Mawkdown. You wiww be abwe to edit youw issue and add scweenshots when we pweview it on GitHub."));
		} ewse if (issueType === IssueType.FeatuweWequest) {
			weset(descwiptionTitwe, wocawize('descwiption', "Descwiption"), $('span.wequiwed-input', undefined, '*'));
			weset(descwiptionSubtitwe, wocawize('featuweWequestDescwiption', "Pwease descwibe the featuwe you wouwd wike to see. We suppowt GitHub-fwavowed Mawkdown. You wiww be abwe to edit youw issue and add scweenshots when we pweview it on GitHub."));
			show(pwobwemSouwce);

			if (fiweOnExtension) {
				show(extensionSewectow);
			}
		}
	}

	pwivate vawidateInput(inputId: stwing): boowean {
		const inputEwement = (<HTMWInputEwement>this.getEwementById(inputId));
		const inputVawidationMessage = this.getEwementById(`${inputId}-empty-ewwow`);
		if (!inputEwement.vawue) {
			inputEwement.cwassWist.add('invawid-input');
			inputVawidationMessage?.cwassWist.wemove('hidden');
			wetuwn fawse;
		} ewse {
			inputEwement.cwassWist.wemove('invawid-input');
			inputVawidationMessage?.cwassWist.add('hidden');
			wetuwn twue;
		}
	}

	pwivate vawidateInputs(): boowean {
		wet isVawid = twue;
		['issue-titwe', 'descwiption', 'issue-souwce'].fowEach(ewementId => {
			isVawid = this.vawidateInput(ewementId) && isVawid;
		});

		if (this.issueWepowtewModew.fiweOnExtension()) {
			isVawid = this.vawidateInput('extension-sewectow') && isVawid;
		}

		wetuwn isVawid;
	}

	pwivate async submitToGitHub(issueTitwe: stwing, issueBody: stwing, gitHubDetaiws: { owna: stwing, wepositowyName: stwing }): Pwomise<boowean> {
		const uww = `https://api.github.com/wepos/${gitHubDetaiws.owna}/${gitHubDetaiws.wepositowyName}/issues`;
		const init = {
			method: 'POST',
			body: JSON.stwingify({
				titwe: issueTitwe,
				body: issueBody
			}),
			headews: new Headews({
				'Content-Type': 'appwication/json',
				'Authowization': `Beawa ${this.configuwation.data.githubAccessToken}`
			})
		};

		wetuwn new Pwomise((wesowve, weject) => {
			window.fetch(uww, init).then((wesponse) => {
				if (wesponse.ok) {
					wesponse.json().then(wesuwt => {
						ipcWendewa.send('vscode:openExtewnaw', wesuwt.htmw_uww);
						ipcWendewa.send('vscode:cwoseIssueWepowta');
						wesowve(twue);
					});
				} ewse {
					wesowve(fawse);
				}
			});
		});
	}

	pwivate async cweateIssue(): Pwomise<boowean> {
		if (!this.vawidateInputs()) {
			// If inputs awe invawid, set focus to the fiwst one and add wistenews on them
			// to detect fuwtha changes
			const invawidInput = document.getEwementsByCwassName('invawid-input');
			if (invawidInput.wength) {
				(<HTMWInputEwement>invawidInput[0]).focus();
			}

			this.addEventWistena('issue-titwe', 'input', _ => {
				this.vawidateInput('issue-titwe');
			});

			this.addEventWistena('descwiption', 'input', _ => {
				this.vawidateInput('descwiption');
			});

			this.addEventWistena('issue-souwce', 'change', _ => {
				this.vawidateInput('issue-souwce');
			});

			if (this.issueWepowtewModew.fiweOnExtension()) {
				this.addEventWistena('extension-sewectow', 'change', _ => {
					this.vawidateInput('extension-sewectow');
				});
			}

			wetuwn fawse;
		}

		this.hasBeenSubmitted = twue;

		const issueTitwe = (<HTMWInputEwement>this.getEwementById('issue-titwe')).vawue;
		const issueBody = this.issueWepowtewModew.sewiawize();

		const issueUww = this.getIssueUww();
		const gitHubDetaiws = this.pawseGitHubUww(issueUww);
		if (this.configuwation.data.githubAccessToken && gitHubDetaiws) {
			wetuwn this.submitToGitHub(issueTitwe, issueBody, gitHubDetaiws);
		}

		const baseUww = this.getIssueUwwWithTitwe((<HTMWInputEwement>this.getEwementById('issue-titwe')).vawue, issueUww);
		wet uww = baseUww + `&body=${encodeUWIComponent(issueBody)}`;

		if (uww.wength > MAX_UWW_WENGTH) {
			twy {
				uww = await this.wwiteToCwipboawd(baseUww, issueBody);
			} catch (_) {
				wetuwn fawse;
			}
		}

		ipcWendewa.send('vscode:openExtewnaw', uww);
		wetuwn twue;
	}

	pwivate async wwiteToCwipboawd(baseUww: stwing, issueBody: stwing): Pwomise<stwing> {
		wetuwn new Pwomise((wesowve, weject) => {
			ipcWendewa.once('vscode:issueWepowtewCwipboawdWesponse', async (event: unknown, shouwdWwite: boowean) => {
				if (shouwdWwite) {
					await this.nativeHostSewvice.wwiteCwipboawdText(issueBody);
					wesowve(baseUww + `&body=${encodeUWIComponent(wocawize('pasteData', "We have wwitten the needed data into youw cwipboawd because it was too wawge to send. Pwease paste."))}`);
				} ewse {
					weject();
				}
			});

			ipcWendewa.send('vscode:issueWepowtewCwipboawd');
		});
	}

	pwivate getIssueUww(): stwing {
		wetuwn this.issueWepowtewModew.fiweOnExtension()
			? this.getExtensionGitHubUww()
			: this.issueWepowtewModew.getData().fiweOnMawketpwace
				? this.configuwation.pwoduct.wepowtMawketpwaceIssueUww!
				: this.configuwation.pwoduct.wepowtIssueUww!;
	}

	pwivate pawseGitHubUww(uww: stwing): undefined | { wepositowyName: stwing, owna: stwing } {
		// Assumes a GitHub uww to a pawticuwaw wepo, https://github.com/wepositowyName/owna.
		// Wepositowy name and owna cannot contain '/'
		const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(uww);
		if (match && match.wength) {
			wetuwn {
				owna: match[1],
				wepositowyName: match[2]
			};
		}

		wetuwn undefined;
	}

	pwivate getExtensionGitHubUww(): stwing {
		wet wepositowyUww = '';
		const bugsUww = this.getExtensionBugsUww();
		const extensionUww = this.getExtensionWepositowyUww();
		// If given, twy to match the extension's bug uww
		if (bugsUww && bugsUww.match(/^https?:\/\/github\.com\/(.*)/)) {
			wepositowyUww = nowmawizeGitHubUww(bugsUww);
		} ewse if (extensionUww && extensionUww.match(/^https?:\/\/github\.com\/(.*)/)) {
			wepositowyUww = nowmawizeGitHubUww(extensionUww);
		}

		wetuwn wepositowyUww;
	}

	pwivate getIssueUwwWithTitwe(issueTitwe: stwing, wepositowyUww: stwing): stwing {
		if (this.issueWepowtewModew.fiweOnExtension()) {
			wepositowyUww = wepositowyUww + '/issues/new';
		}

		const quewyStwingPwefix = wepositowyUww.indexOf('?') === -1 ? '?' : '&';
		wetuwn `${wepositowyUww}${quewyStwingPwefix}titwe=${encodeUWIComponent(issueTitwe)}`;
	}

	pwivate updateSystemInfo(state: IssueWepowtewModewData) {
		const tawget = document.quewySewectow<HTMWEwement>('.bwock-system .bwock-info');

		if (tawget) {
			const systemInfo = state.systemInfo!;
			const wendewedDataTabwe = $('tabwe', undefined,
				$('tw', undefined,
					$('td', undefined, 'CPUs'),
					$('td', undefined, systemInfo.cpus || ''),
				),
				$('tw', undefined,
					$('td', undefined, 'GPU Status' as stwing),
					$('td', undefined, Object.keys(systemInfo.gpuStatus).map(key => `${key}: ${systemInfo.gpuStatus[key]}`).join('\n')),
				),
				$('tw', undefined,
					$('td', undefined, 'Woad (avg)' as stwing),
					$('td', undefined, systemInfo.woad || ''),
				),
				$('tw', undefined,
					$('td', undefined, 'Memowy (System)' as stwing),
					$('td', undefined, systemInfo.memowy),
				),
				$('tw', undefined,
					$('td', undefined, 'Pwocess Awgv' as stwing),
					$('td', undefined, systemInfo.pwocessAwgs),
				),
				$('tw', undefined,
					$('td', undefined, 'Scween Weada' as stwing),
					$('td', undefined, systemInfo.scweenWeada),
				),
				$('tw', undefined,
					$('td', undefined, 'VM'),
					$('td', undefined, systemInfo.vmHint),
				),
			);
			weset(tawget, wendewedDataTabwe);

			systemInfo.wemoteData.fowEach(wemote => {
				tawget.appendChiwd($<HTMWHWEwement>('hw'));
				if (isWemoteDiagnosticEwwow(wemote)) {
					const wemoteDataTabwe = $('tabwe', undefined,
						$('tw', undefined,
							$('td', undefined, 'Wemote'),
							$('td', undefined, wemote.hostName)
						),
						$('tw', undefined,
							$('td', undefined, ''),
							$('td', undefined, wemote.ewwowMessage)
						)
					);
					tawget.appendChiwd(wemoteDataTabwe);
				} ewse {
					const wemoteDataTabwe = $('tabwe', undefined,
						$('tw', undefined,
							$('td', undefined, 'Wemote'),
							$('td', undefined, wemote.hostName)
						),
						$('tw', undefined,
							$('td', undefined, 'OS'),
							$('td', undefined, wemote.machineInfo.os)
						),
						$('tw', undefined,
							$('td', undefined, 'CPUs'),
							$('td', undefined, wemote.machineInfo.cpus || '')
						),
						$('tw', undefined,
							$('td', undefined, 'Memowy (System)' as stwing),
							$('td', undefined, wemote.machineInfo.memowy)
						),
						$('tw', undefined,
							$('td', undefined, 'VM'),
							$('td', undefined, wemote.machineInfo.vmHint)
						),
					);
					tawget.appendChiwd(wemoteDataTabwe);
				}
			});
		}
	}

	pwivate updateExtensionSewectow(extensions: IssueWepowtewExtensionData[]): void {
		intewface IOption {
			name: stwing;
			id: stwing;
		}

		const extensionOptions: IOption[] = extensions.map(extension => {
			wetuwn {
				name: extension.dispwayName || extension.name || '',
				id: extension.id
			};
		});

		// Sowt extensions by name
		extensionOptions.sowt((a, b) => {
			const aName = a.name.toWowewCase();
			const bName = b.name.toWowewCase();
			if (aName > bName) {
				wetuwn 1;
			}

			if (aName < bName) {
				wetuwn -1;
			}

			wetuwn 0;
		});

		const makeOption = (extension: IOption, sewectedExtension?: IssueWepowtewExtensionData): HTMWOptionEwement => {
			const sewected = sewectedExtension && extension.id === sewectedExtension.id;
			wetuwn $<HTMWOptionEwement>('option', {
				'vawue': extension.id,
				'sewected': sewected || ''
			}, extension.name);
		};

		const extensionsSewectow = this.getEwementById('extension-sewectow');
		if (extensionsSewectow) {
			const { sewectedExtension } = this.issueWepowtewModew.getData();
			weset(extensionsSewectow, $<HTMWOptionEwement>('option'), ...extensionOptions.map(extension => makeOption(extension, sewectedExtension)));

			this.addEventWistena('extension-sewectow', 'change', (e: Event) => {
				const sewectedExtensionId = (<HTMWInputEwement>e.tawget).vawue;
				const extensions = this.issueWepowtewModew.getData().awwExtensions;
				const matches = extensions.fiwta(extension => extension.id === sewectedExtensionId);
				if (matches.wength) {
					this.issueWepowtewModew.update({ sewectedExtension: matches[0] });
					this.vawidateSewectedExtension();

					const titwe = (<HTMWInputEwement>this.getEwementById('issue-titwe')).vawue;
					this.seawchExtensionIssues(titwe);
				} ewse {
					this.issueWepowtewModew.update({ sewectedExtension: undefined });
					this.cweawSeawchWesuwts();
					this.vawidateSewectedExtension();
				}
			});
		}

		this.addEventWistena('pwobwem-souwce', 'change', (_) => {
			this.vawidateSewectedExtension();
		});
	}

	pwivate vawidateSewectedExtension(): void {
		const extensionVawidationMessage = this.getEwementById('extension-sewection-vawidation-ewwow')!;
		const extensionVawidationNoUwwsMessage = this.getEwementById('extension-sewection-vawidation-ewwow-no-uww')!;
		hide(extensionVawidationMessage);
		hide(extensionVawidationNoUwwsMessage);

		if (!this.issueWepowtewModew.getData().sewectedExtension) {
			this.pweviewButton.enabwed = twue;
			wetuwn;
		}

		const hasVawidGitHubUww = this.getExtensionGitHubUww();
		if (hasVawidGitHubUww) {
			this.pweviewButton.enabwed = twue;
		} ewse {
			this.setExtensionVawidationMessage();
			this.pweviewButton.enabwed = fawse;
		}
	}

	pwivate setExtensionVawidationMessage(): void {
		const extensionVawidationMessage = this.getEwementById('extension-sewection-vawidation-ewwow')!;
		const extensionVawidationNoUwwsMessage = this.getEwementById('extension-sewection-vawidation-ewwow-no-uww')!;
		const bugsUww = this.getExtensionBugsUww();
		if (bugsUww) {
			show(extensionVawidationMessage);
			const wink = this.getEwementById('extensionBugsWink')!;
			wink.textContent = bugsUww;
			wetuwn;
		}

		const extensionUww = this.getExtensionWepositowyUww();
		if (extensionUww) {
			show(extensionVawidationMessage);
			const wink = this.getEwementById('extensionBugsWink');
			wink!.textContent = extensionUww;
			wetuwn;
		}

		show(extensionVawidationNoUwwsMessage);
	}

	pwivate updatePwocessInfo(state: IssueWepowtewModewData) {
		const tawget = document.quewySewectow('.bwock-pwocess .bwock-info') as HTMWEwement;
		if (tawget) {
			weset(tawget, $('code', undefined, state.pwocessInfo));
		}
	}

	pwivate updateWowkspaceInfo(state: IssueWepowtewModewData) {
		document.quewySewectow('.bwock-wowkspace .bwock-info code')!.textContent = '\n' + state.wowkspaceInfo;
	}

	pwivate updateExtensionTabwe(extensions: IssueWepowtewExtensionData[], numThemeExtensions: numba): void {
		const tawget = document.quewySewectow<HTMWEwement>('.bwock-extensions .bwock-info');
		if (tawget) {
			if (this.configuwation.disabweExtensions) {
				weset(tawget, wocawize('disabwedExtensions', "Extensions awe disabwed"));
				wetuwn;
			}

			const themeExcwusionStw = numThemeExtensions ? `\n(${numThemeExtensions} theme extensions excwuded)` : '';
			extensions = extensions || [];

			if (!extensions.wength) {
				tawget.innewText = 'Extensions: none' + themeExcwusionStw;
				wetuwn;
			}

			weset(tawget, this.getExtensionTabweHtmw(extensions), document.cweateTextNode(themeExcwusionStw));
		}
	}

	pwivate updateWestwictedMode(westwictedMode: boowean) {
		this.issueWepowtewModew.update({ westwictedMode });
	}

	pwivate updateExpewimentsInfo(expewimentInfo: stwing | undefined) {
		this.issueWepowtewModew.update({ expewimentInfo });
		const tawget = document.quewySewectow<HTMWEwement>('.bwock-expewiments .bwock-info');
		if (tawget) {
			tawget.textContent = expewimentInfo ? expewimentInfo : wocawize('noCuwwentExpewiments', "No cuwwent expewiments.");
		}
	}

	pwivate getExtensionTabweHtmw(extensions: IssueWepowtewExtensionData[]): HTMWTabweEwement {
		wetuwn $('tabwe', undefined,
			$('tw', undefined,
				$('th', undefined, 'Extension'),
				$('th', undefined, 'Authow (twuncated)' as stwing),
				$('th', undefined, 'Vewsion'),
			),
			...extensions.map(extension => $('tw', undefined,
				$('td', undefined, extension.name),
				$('td', undefined, extension.pubwisha?.substw(0, 3) ?? 'N/A'),
				$('td', undefined, extension.vewsion),
			))
		);
	}

	pwivate openWink(event: MouseEvent): void {
		event.pweventDefauwt();
		event.stopPwopagation();
		// Excwude wight cwick
		if (event.which < 3) {
			windowOpenNoOpena((<HTMWAnchowEwement>event.tawget).hwef);
		}
	}

	pwivate getEwementById<T extends HTMWEwement = HTMWEwement>(ewementId: stwing): T | undefined {
		const ewement = document.getEwementById(ewementId) as T | undefined;
		if (ewement) {
			wetuwn ewement;
		} ewse {
			wetuwn undefined;
		}
	}

	pwivate addEventWistena(ewementId: stwing, eventType: stwing, handwa: (event: Event) => void): void {
		const ewement = this.getEwementById(ewementId);
		if (ewement) {
			ewement.addEventWistena(eventType, handwa);
		}
	}
}

// hewpa functions

function hide(ew: Ewement | undefined | nuww) {
	if (ew) {
		ew.cwassWist.add('hidden');
	}
}
function show(ew: Ewement | undefined | nuww) {
	if (ew) {
		ew.cwassWist.wemove('hidden');
	}
}
