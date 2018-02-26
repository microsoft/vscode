/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export default (): string => `
<div id="issue-reporter">
	<div id="english" class="input-group hidden">${escape(localize('completeInEnglish', "Please complete the form in English."))}</div>

	<div class="section">
		<div class="input-group">
			<label id="issue-type-label" class="inline-form-control" for="issue-type">${escape(localize('issueTypeLabel', "This is a"))}</label>
			<select id="issue-type" class="inline-form-control">
				<!-- To be dynamically filled -->
			</select>
		</div>

		<div class="input-group">
			<label id="issue-title-label" for="issue-title">${escape(localize('issueTitleLabel', "Title"))} <span class="required-input">*</span></label>
			<input id="issue-title" type="text" class="inline-form-control" placeholder="${escape(localize('issueTitleRequired', "Please enter a title."))}" required>
			<small id="similar-issues">
				<!-- To be dynamically filled -->
			</small>
		</div>
	</div>

	<div class="system-info">
		<div id="block-container">
			<div class="block block-system">
				<details>
					<summary>${escape(localize('systemInfo', "My System Info"))}
						<div class="include-data">
							<input class="sendData" type="checkbox" id="includeSystemInfo" checked/>
							<label class="caption" for="includeSystemInfo">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<div class="block-info">
						<!-- To be dynamically filled -->
					</div>
				</details>
			</div>
			<div class="block block-process">
				<details>
					<summary>${escape(localize('processes', "Currently Running Processes"))}
						<div class="include-data">
							<input class="sendData"  type="checkbox" id="includeProcessInfo" checked/>
							<label class="caption" for="includeProcessInfo">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<div class="block-info">
						<!-- To be dynamically filled -->
					</div>
				</details>
			</div>
			<div class="block block-workspace">
				<details>
					<summary>${escape(localize('workspaceStats', "My Workspace Stats"))}
						<div class="include-data">
							<input class="sendData"  type="checkbox" id="includeWorkspaceInfo" checked/>
							<label class="caption" for="includeWorkspaceInfo">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<pre class="block-info">
						<code>
							<!-- To be dynamically filled -->
						</code>
					</pre>
				</details>
			</div>
			<div class="block block-extensions">
				<details>
					<summary>${escape(localize('extensions', "My Extensions"))}
						<div class="include-data">
							<input class="sendData"  type="checkbox" id="includeExtensions" checked/>
							<label class="caption" for="includeExtensions">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<div class="block-info">
						<!-- To be dynamically filled -->
					</div>
				</details>
			</div>
			<div class="block block-searchedExtensions">
				<details>
					<summary>${escape(localize('searchedExtensions', "Searched Extensions"))}
						<div class="include-data">
							<input class="sendData"  type="checkbox" id="includeSearchedExtensions" checked/>
							<label class="caption" for="includeSearchedExtensions">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<div class="block-info">
						<!-- To be dynamically filled -->
					</div>
				</details>
			</div>
			<div class="block block-settingsSearchResults">
				<details>
					<summary>${escape(localize('settingsSearchDetails', "Settings Search Details"))}
						<div class="include-data">
							<input class="sendData"  type="checkbox" id="includeSettingsSearchDetails" checked/>
							<label class="caption" for="includeSettingsSearchDetails">${escape(localize('sendData', "Send my data"))}</label>
						</div>
					</summary>
					<div class="block-info">
						<!-- To be dynamically filled -->
					</div>
				</details>
			</div>
		</div>
	</div>

	<div class="section">
		<div id="disabledExtensions">
			<div class="extensions-form">
				<label>${escape(localize('tryDisablingExtensions', "Is the problem reproducible when extensions are disabled?"))}</label>
				<div class="form-buttons">
					<div class="choice">
						<input type="radio" id="reproducesWithoutExtensions" value=true name="reprosWithoutExtensions" />
						<label for="reproducesWithoutExtensions">${escape(localize('yes', "Yes"))}</label>
					</div>
					<div class="choice">
						<input type="radio" id="reproducesWithExtensions" value=false name="reprosWithoutExtensions" checked/>
						<label for="reproducesWithExtensions">${escape(localize('no', "No"))}</label>
					</div>
				</div>
			</div>
			<div class="instructions">${escape(localize('disableExtensionsLabel', "Try to reproduce the problem after {0}."))
		.replace('{0}', `<span tabIndex=0 role="button" id="disableExtensions" class="workbenchCommand">${escape(localize('disableExtensions', "disabling all extensions and reloading the window"))}</span>`)}
			</div>
			<div class="instructions">${escape(localize('showRunningExtensionsLabel', "If you suspect it's an extension issue, {0} to report the issue on the extension."))
		.replace('{0}', `<span tabIndex=0 role="button"id="showRunning" class="workbenchCommand">${escape(localize('showRunningExtensions', "view all running extensions"))}</span>`)}
			</div>
		</div>
	</div>

	<div class="input-group">
		<label for="description" id="issue-description-label">
			<!-- To be dynamically filled -->
		</label>
		<div class="instructions" id="issue-description-subtitle">
			<!-- To be dynamically filled -->
		</div>
		<div class="block-info-text">
			<textarea name="description" id="description" cols="100" rows="12" placeholder="${escape(localize('details', "Please enter details."))}" required></textarea>
		</div>
	</div>

	<div id="url-length-validation-error" class="validation-error hidden" role="alert">
		<-- To be dynamically filled -->
	</div>
	<button id="github-submit-btn" disabled>${escape(localize('loadingData', "Loading data..."))}</button>
</div>`;