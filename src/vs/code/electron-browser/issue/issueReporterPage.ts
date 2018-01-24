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

	<div class="input-group">
		<label for="issue-type">${escape(localize('issueTypeLabel', "I want to submit a"))}</label>
		<select id="issue-type" class="form-control">
			<option value="0">${escape(localize('bugReporter', "Bug Report"))}</option>
			<option value="1">${escape(localize('performanceIssue', "Performance Issue"))}</option>
			<option value="2">${escape(localize('featureRequest', "Feature Request"))}</option>
		</select>
	</div>

	<div class="input-group">
		<label for="issue-title">${escape(localize('issueTitleLabel', "Title"))} <span class="required-input">*</span></label>
		<div id="issue-title-validation-error" class="validation-error hidden">${escape(localize('issueTitleRequired', "Please enter a title."))}</div>
		<input id="issue-title" type="text" required>
		<small id="similar-issues">
			<!-- To be dynamically filled -->
		</small>
	</div>

	<div class="input-group">
		<div class="two-col">
			<label for="vscode-version">${escape(localize('vscodeVersion', "VS Code Version"))} <span class="required-input">*</span></label>
			<input id="vscode-version" type="text" value="${escape(localize('loading', "Loading..."))}" disabled/>
		</div>
		<div class="two-col">
			<label for="os">${escape(localize('osVersion', "OS Version"))} <span class="required-input">*</span></label>
			<input id="os" type="text" value="${escape(localize('loading', "Loading..."))}" disabled/>
		</div>
	</div>

	<div id="block-container" class="input-group">
		<div class="block block-system">
			<details>
				<summary>${escape(localize('systemInfo', "My System Info"))}
					<input type="checkbox" id="includeSystemInfo" checked>
						<label class="caption" for="includeSystemInfo">${escape(localize('sendData', "Send my data"))}</label>
					</input>
				</summary>
				<div class="block-info">
					<!-- To be dynamically filled -->
				</div>
			</details>
		</div>
		<div class="block block-process">
			<details>
				<summary>${escape(localize('processes', "Currently Running Processes"))}
					<input type="checkbox" id="includeProcessInfo" checked>
						<label class="caption" for="includeProcessInfo">${escape(localize('sendData', "Send my data"))}</label>
					</input>
				</summary>
				<div class="block-info">
					<!-- To be dynamically filled -->
				</div>
			</details>
		</div>
		<div class="block block-workspace">
			<details>
				<summary>${escape(localize('workspaceStats', "My Workspace Stats"))}
					<input type="checkbox" id="includeWorkspaceInfo" checked>
						<label class="caption" for="includeWorkspaceInfo">${escape(localize('sendData', "Send my data"))}</label>
					</input>
				</summary>
				<pre class="block-info">
					<code>
						<!-- To be dynamically filled -->
					</code>
				</pre>
			</details>
		</div>
	</div>

	<div class="input-group">
		<label for="description" id="issue-description-label">
			<!-- To be dynamically filled -->
		</label>
		<small id="issue-description-subtitle">
			<!-- To be dynamically filled -->
		</small>
		<div class="block-info-text">
			<small>${escape(localize('githubMarkdown', "We support GitHub-flavored Markdown. You will still be able to edit your issue when we preview it on GitHub."))}</small>
			<div id="description-validation-error" class="validation-error hidden">${escape(localize('issueDescriptionRequired', "Please enter a description."))}</div>
			<textarea name="description" id="description" cols="100" rows="15" required></textarea>
		</div>
	</div>

	<button id="github-submit-btn" disabled>${escape(localize('loadingData', "Loading data..."))}</button>
</div>`;