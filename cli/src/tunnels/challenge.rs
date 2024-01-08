/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(not(feature = "vsda"))]
pub fn create_challenge() -> String {
	use rand::distributions::{Alphanumeric, DistString};
	Alphanumeric.sample_string(&mut rand::thread_rng(), 16)
}

#[cfg(not(feature = "vsda"))]
pub fn sign_challenge(challenge: &str) -> String {
	use base64::{engine::general_purpose as b64, Engine as _};
	use sha2::{Digest, Sha256};
	let mut hash = Sha256::new();
	hash.update(challenge.as_bytes());
	let result = hash.finalize();
	b64::URL_SAFE_NO_PAD.encode(result)
}

#[cfg(not(feature = "vsda"))]
pub fn verify_challenge(challenge: &str, response: &str) -> bool {
	sign_challenge(challenge) == response
}

#[cfg(feature = "vsda")]
pub fn create_challenge() -> String {
	use rand::distributions::{Alphanumeric, DistString};
	let str = Alphanumeric.sample_string(&mut rand::thread_rng(), 16);
	vsda::create_new_message(&str)
}

#[cfg(feature = "vsda")]
pub fn sign_challenge(challenge: &str) -> String {
	vsda::sign(challenge)
}

#[cfg(feature = "vsda")]
pub fn verify_challenge(challenge: &str, response: &str) -> bool {
	vsda::validate(challenge, response)
}
