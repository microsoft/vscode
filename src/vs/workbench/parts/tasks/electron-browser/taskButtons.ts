/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function domElement() {
	return `
<div class="composite panel task-panel" id="workbench.panel.task" aria-hidden="false">
	<div class="task-text">
		<p class="oneliner">This is a static mockup. Would you find the task panel seen below useful? <button class="mockup-button yes-telemetry">Yes</button> <button class="mockup-button no-telemetry">No</button>
		<span class="right-aligned"> Link for feedback </span> </p>
	</div>
	<div class="task-panel-container">
		<div class="block">
			<p class="oneliner">
				Task: tsc -watch
				<span class="right-aligned">Running (0 Errors)</span>
			</p>
			<p class="oneliner">
				<div class="mockup-button">Show Output </div>
				<span class="right-aligned"><div class="mockup-button"> Configure </div> <div class="mockup-button"> Stop </div> <div class="mockup-button"> Restart </div></span>
			</p>
		</div>
		<div class="block">
			<p class="oneliner">
				Task: tslint
				<span class="right-aligned">Running (10 Errors)</span>
			</p>
			<p class="oneliner">
				<div class="mockup-button">Hide Output </div>
				<span class="right-aligned"><div class="mockup-button"> Configure </div> <div class="mockup-button"> Stop </div> <div class="mockup-button"> Restart </div></span>
			</p>
			Running tslint... </br> /users/express/index.js - invalid name expression </br>tslint finished with 1 Error(s)
		</div>
		<div class="block">
			<p class="oneliner">
				Task: tsc
				<span class="right-aligned">Finished (0 Errors)</span>
			</p>
			<p class="oneliner">
				<div class="mockup-button">Show Output </div>
				<span class="right-aligned"><div class="mockup-button"> Configure </div> <div class="mockup-button"> Restart </div></span>
			</p>
		</div>
	</div>
</div>
`;
};