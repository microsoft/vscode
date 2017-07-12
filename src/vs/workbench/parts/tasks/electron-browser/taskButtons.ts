/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function domElement() {
	return `
<div class="composite panel task-panel" id="workbench.panel.task" aria-hidden="false">

	<div class="task-panel-container">
		<p> Some things you might be able to do here: </br>
		<ul>
			<li> See a list of autodetected and manually configured tasks </li>
			<li> Run/Restart/Stop tasks with a click of a button</li>
			<li> Show a summary of each completed task (ie: execution time, exit code, foldable output)</li>
			<li> Configure a task without touching the json file </li>
		</ul></p>
		<p> Here's a rough idea of what a task item might look like. By no means is this the final layout so please do not judge the look.</p>
		<div class="task-item">
			<p class="oneliner"> Task1: tsc -watch <span class="right-aligned"> Running (0 Errors)
				<span class="mockup-button"> Show Output</span>
				<span class="mockup-button">Stop</span>
				<span class="mockup-button">Restart</span></span>
			</p>
		</div>
		<p class="feedback"> If you are interested in further discussion or have feedback of your own, please go the github issue <a class="linkstyle" href="https://github.com/Microsoft/vscode/issues/28235"> here</a>. </p>
	</div>
</div>
	<div class="task-text">
		<div class="header-item centered">Do you think a task panel is useful? <span class="mockup-button yes-telemetry"></span> <span class="mockup-button no-telemetry"></span></div>
		<div class="header-item centered thanks hidden"> Thanks for the feedback! <3 </div>
	</div>
`;
};