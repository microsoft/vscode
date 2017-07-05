/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function domElement() {
	return `
<div class="composite panel task-panel" id="workbench.panel.task" aria-hidden="false">
	<div class="task-text">
		<p style="text-align:left;">This is an experiment. Would you find the task panel seen below useful? <button class="yes-telemetry">Yes</button> <button  class="no-telemetry">No</button>
		<span style="float:right;"> Link for feedback </span> </p>
	</div>
	<div class="task-panel-container">
		<div class="block">
			<p style="text-align:left;">
				Task: tsc -watch
				<span style="float:right;">Running (0 Errors)</span>
			</p>
			<p style="text-align:left;">
				<button>Show Output </button>
				<span style="float:right;"><button> Configure </button> <button> Stop </button> <button> Restart </button></span>
			</p>
		</div>
		<div class="block">
			<p style="text-align:left;">
				Task: tslint
				<span style="float:right;">Running (10 Errors)</span>
			</p>
			<p style="text-align:left;">
				<button>Hide Output </button>
				<span style="float:right;"><button> Configure </button> <button> Stop </button> <button> Restart </button></span>
			</p>
			Running tslint... </br> /users/express/index.js - invalid name expression </br>tslint finished with 1 Error(s)
		</div>
		<div class="block">
			<p style="text-align:left;">
				Task: tsc
				<span style="float:right;">Finished (0 Errors)</span>
			</p>
			<p style="text-align:left;">
				<button>Show Output </button>
				<span style="float:right;"><button> Configure </button> <button> Restart </button></span>
			</p>
		</div>
	</div>
</div>
`;
};