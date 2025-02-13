/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use rand::distributions::{Alphanumeric, DistString};
use rand::rngs::OsRng;

#[cfg(not(feature = "vsda"))]
pub fn create_challenge() -> String {
    Alphanumeric.sample_string(&mut OsRng, 16)
}

#[cfg(not(feature = "vsda"))]
pub fn sign_challenge(challenge: &str) -> String {
    use base64::{engine::general_purpose as b64, Engine as _};
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(challenge.as_bytes());
    let hash = hasher.finalize();

    b64::URL_SAFE_NO_PAD.encode(hash)
}

#[cfg(not(feature = "vsda"))]
pub fn verify_challenge(challenge: &str, response: &str) -> bool {
    constant_time_eq::constant_time_eq(sign_challenge(challenge).as_bytes(), response.as_bytes())
}

#[cfg(feature = "vsda")]
pub fn create_challenge() -> String {
    let str = Alphanumeric.sample_string(&mut OsRng, 16);
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
