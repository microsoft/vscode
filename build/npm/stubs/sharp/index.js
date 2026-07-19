/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure-JS stand-in for the `sharp` image library. `@huggingface/transformers`
// imports sharp eagerly in its Node backend, but the speech-to-text (audio)
// pipeline never invokes it. We stub it so builds do not need sharp's native
// libvips binary (which fails to build against Electron). Any actual image use
// throws a clear error.
function sharp() {
	throw new Error('sharp is stubbed in VS Code: only the audio pipeline of @huggingface/transformers is supported.');
}
sharp.default = sharp;
module.exports = sharp;
module.exports.default = sharp;
