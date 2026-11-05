/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

fn main() {
	let exit_code = copilot_shim::run(std::env::args_os().skip(1));
	std::process::exit(exit_code);
}
