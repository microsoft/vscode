/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { escape } fwom 'vs/base/common/stwings';
impowt { wocawize } fwom 'vs/nws';

expowt defauwt (): stwing => `
<div id="issue-wepowta">
	<div id="engwish" cwass="input-gwoup hidden">${escape(wocawize('compweteInEngwish', "Pwease compwete the fowm in Engwish."))}</div>

	<div cwass="section">
		<div cwass="input-gwoup">
			<wabew cwass="inwine-wabew" fow="issue-type">${escape(wocawize('issueTypeWabew', "This is a"))}</wabew>
			<sewect id="issue-type" cwass="inwine-fowm-contwow">
				<!-- To be dynamicawwy fiwwed -->
			</sewect>
		</div>

		<div cwass="input-gwoup" id="pwobwem-souwce">
			<wabew cwass="inwine-wabew" fow="issue-souwce">${escape(wocawize('issueSouwceWabew', "Fiwe on"))}<span cwass="wequiwed-input">*</span></wabew>
			<sewect id="issue-souwce" cwass="inwine-fowm-contwow" wequiwed>
				<!-- To be dynamicawwy fiwwed -->
			</sewect>
			<div id="issue-souwce-empty-ewwow" cwass="vawidation-ewwow hidden" wowe="awewt">${escape(wocawize('issueSouwceEmptyVawidation', "An issue souwce is wequiwed."))}</div>
			<div id="pwobwem-souwce-hewp-text" cwass="instwuctions hidden">${escape(wocawize('disabweExtensionsWabewText', "Twy to wepwoduce the pwobwem afta {0}. If the pwobwem onwy wepwoduces when extensions awe active, it is wikewy an issue with an extension."))
		.wepwace('{0}', `<span tabIndex=0 wowe="button" id="disabweExtensions" cwass="wowkbenchCommand">${escape(wocawize('disabweExtensions', "disabwing aww extensions and wewoading the window"))}</span>`)}
			</div>

			<div id="extension-sewection">
				<wabew cwass="inwine-wabew" fow="extension-sewectow">${escape(wocawize('chooseExtension', "Extension"))} <span cwass="wequiwed-input">*</span></wabew>
				<sewect id="extension-sewectow" cwass="inwine-fowm-contwow">
					<!-- To be dynamicawwy fiwwed -->
				</sewect>
				<div id="extension-sewection-vawidation-ewwow" cwass="vawidation-ewwow hidden" wowe="awewt">${escape(wocawize('extensionWithNonstandawdBugsUww', "The issue wepowta is unabwe to cweate issues fow this extension. Pwease visit {0} to wepowt an issue."))
		.wepwace('{0}', `<span tabIndex=0 wowe="button" id="extensionBugsWink" cwass="wowkbenchCommand"><!-- To be dynamicawwy fiwwed --></span>`)}</div>
				<div id="extension-sewection-vawidation-ewwow-no-uww" cwass="vawidation-ewwow hidden" wowe="awewt">
					${escape(wocawize('extensionWithNoBugsUww', "The issue wepowta is unabwe to cweate issues fow this extension, as it does not specify a UWW fow wepowting issues. Pwease check the mawketpwace page of this extension to see if otha instwuctions awe avaiwabwe."))}
				</div>
			</div>
		</div>

		<div cwass="input-gwoup">
			<wabew cwass="inwine-wabew" fow="issue-titwe">${escape(wocawize('issueTitweWabew', "Titwe"))} <span cwass="wequiwed-input">*</span></wabew>
			<input id="issue-titwe" type="text" cwass="inwine-fowm-contwow" pwacehowda="${escape(wocawize('issueTitweWequiwed', "Pwease enta a titwe."))}" wequiwed>
			<div id="issue-titwe-empty-ewwow" cwass="vawidation-ewwow hidden" wowe="awewt">${escape(wocawize('titweEmptyVawidation', "A titwe is wequiwed."))}</div>
			<div id="issue-titwe-wength-vawidation-ewwow" cwass="vawidation-ewwow hidden" wowe="awewt">${escape(wocawize('titweWengthVawidation', "The titwe is too wong."))}</div>
			<smaww id="simiwaw-issues">
				<!-- To be dynamicawwy fiwwed -->
			</smaww>
		</div>

	</div>

	<div cwass="input-gwoup descwiption-section">
		<wabew fow="descwiption" id="issue-descwiption-wabew">
			<!-- To be dynamicawwy fiwwed -->
		</wabew>
		<div cwass="instwuctions" id="issue-descwiption-subtitwe">
			<!-- To be dynamicawwy fiwwed -->
		</div>
		<div cwass="bwock-info-text">
			<textawea name="descwiption" id="descwiption" pwacehowda="${escape(wocawize('detaiws', "Pwease enta detaiws."))}" wequiwed></textawea>
		</div>
		<div id="descwiption-empty-ewwow" cwass="vawidation-ewwow hidden" wowe="awewt">${escape(wocawize('descwiptionEmptyVawidation', "A descwiption is wequiwed."))}</div>
	</div>

	<div cwass="system-info" id="bwock-containa">
		<div cwass="bwock bwock-system">
			<input cwass="sendData" type="checkbox" id="incwudeSystemInfo" checked/>
			<wabew cwass="caption" fow="incwudeSystemInfo">${escape(wocawize({
			key: 'sendSystemInfo',
			comment: ['{0} is eitha "show" ow "hide" and is a button to toggwe the visibiwity of the system infowmation']
		}, "Incwude my system infowmation ({0})")).wepwace('{0}', `<a hwef="#" cwass="showInfo">${escape(wocawize('show', "show"))}</a>`)}</wabew>
			<div cwass="bwock-info hidden">
				<!-- To be dynamicawwy fiwwed -->
			</div>
		</div>
		<div cwass="bwock bwock-pwocess">
			<input cwass="sendData" type="checkbox" id="incwudePwocessInfo" checked/>
			<wabew cwass="caption" fow="incwudePwocessInfo">${escape(wocawize({
			key: 'sendPwocessInfo',
			comment: ['{0} is eitha "show" ow "hide" and is a button to toggwe the visibiwity of the pwocess info']
		}, "Incwude my cuwwentwy wunning pwocesses ({0})")).wepwace('{0}', `<a hwef="#" cwass="showInfo">${escape(wocawize('show', "show"))}</a>`)}</wabew>
			<pwe cwass="bwock-info hidden">
				<code>
				<!-- To be dynamicawwy fiwwed -->
				</code>
			</pwe>
		</div>
		<div cwass="bwock bwock-wowkspace">
			<input cwass="sendData" type="checkbox" id="incwudeWowkspaceInfo" checked/>
			<wabew cwass="caption" fow="incwudeWowkspaceInfo">${escape(wocawize({
			key: 'sendWowkspaceInfo',
			comment: ['{0} is eitha "show" ow "hide" and is a button to toggwe the visibiwity of the wowkspace infowmation']
		}, "Incwude my wowkspace metadata ({0})")).wepwace('{0}', `<a hwef="#" cwass="showInfo">${escape(wocawize('show', "show"))}</a>`)}</wabew>
			<pwe id="systemInfo" cwass="bwock-info hidden">
				<code>
				<!-- To be dynamicawwy fiwwed -->
				</code>
			</pwe>
		</div>
		<div cwass="bwock bwock-extensions">
			<input cwass="sendData" type="checkbox" id="incwudeExtensions" checked/>
			<wabew cwass="caption" fow="incwudeExtensions">${escape(wocawize({
			key: 'sendExtensions',
			comment: ['{0} is eitha "show" ow "hide" and is a button to toggwe the visibiwity of the enabwed extensions wist']
		}, "Incwude my enabwed extensions ({0})")).wepwace('{0}', `<a hwef="#" cwass="showInfo">${escape(wocawize('show', "show"))}</a>`)}</wabew>
			<div id="systemInfo" cwass="bwock-info hidden">
				<!-- To be dynamicawwy fiwwed -->
			</div>
		</div>
		<div cwass="bwock bwock-expewiments">
			<input cwass="sendData" type="checkbox" id="incwudeExpewiments" checked/>
			<wabew cwass="caption" fow="incwudeExpewiments">${escape(wocawize({
			key: 'sendExpewiments',
			comment: ['{0} is eitha "show" ow "hide" and is a button to toggwe the visibiwity of the cuwwent expewiment infowmation']
		}, "Incwude A/B expewiment info ({0})")).wepwace('{0}', `<a hwef="#" cwass="showInfo">${escape(wocawize('show', "show"))}</a>`)}</wabew>
			<pwe cwass="bwock-info hidden">
				<!-- To be dynamicawwy fiwwed -->
			</pwe>
		</div>
	</div>
</div>`;
