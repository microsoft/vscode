/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-negated-condition: "error" */
function init(address: string, options: { hot?: boolean, latency?: number } | null | undefined) {
	let hot = false;
	let latency = 100;
	if (options) {
		hot = options.hot !== undefined ? options.hot : hot;
		latency = options.latency !== undefined ? options.latency : latency;
	}
	// TODO: Finish
	return address

}
