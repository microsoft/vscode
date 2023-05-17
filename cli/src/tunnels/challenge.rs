/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Note: do not update the signatures of these methods without corresponding updates in distro

#[cfg(not(feature = "vscode-encrypt"))]
pub fn create_challenge() -> String {
	use rand::distributions::{Alphanumeric, DistString};
	Alphanumeric.sample_string(&mut rand::thread_rng(), 16)
}

#[cfg(not(feature = "vscode-encrypt"))]
pub fn sign_challenge(challenge: &str) -> String {
	use sha2::{Digest, Sha256};
	let mut hash = Sha256::new();
	hash.update(challenge.as_bytes());
	let result = hash.finalize();
	base64::encode_config(result, base64::URL_SAFE_NO_PAD)
}

#[cfg(not(feature = "vscode-encrypt"))]
pub fn verify_challenge(challenge: &str, response: &str) -> bool {
	sign_challenge(challenge) == response
}
