# Russh Vulnerabilities

## OOM Denial of Service due to allocation of untrusted amount (High #3)

*   **CVE:** CVE-2024-43410
*   **Affected Component:** `russh` (Rust)
*   **Location:** `cli/Cargo.lock`
*   **Severity:** High
*   **Description:** An unauthenticated user can trigger a Denial of Service (DoS) attack by causing an Out Of Memory (OOM) error on a russh server. The issue stems from the way russh handles SSH packets. An SSH packet includes a 4-byte length field. Russh, as a performance optimization, allocates memory for the incoming byte stream based on this length. However, this length value is untrusted and can be manipulated by a client to request an excessively large memory allocation, leading to the server process running out of memory.
*   **Patched Version:** `0.44.1`

## Missing overflow checks during channel windows adjust (Moderate #4)

*   **CVE:** CVE-2025-54804
*   **Affected Component:** `russh` (Rust)
*   **Location:** `cli/Cargo.lock`
*   **Severity:** Moderate
*   **Description:** The `russh` implementation handles the channel window adjust message of the SSH protocol by adding the message's value to an internal state value without sufficient overflow checks. This can lead to an integer overflow. If the Rust code is compiled with overflow checks, this condition will cause the program to panic.
*   **Patched Version:** `0.54.1`

## Prefix Truncation Attack against ChaCha20-Poly1305 and Encrypt-then-MAC aka Terrapin (Moderate #2)

*   **CVE:** CVE-2023-48795
*   **Affected Component:** `russh` (Rust)
*   **Location:** `cli/Cargo.lock`
*   **Severity:** Moderate
*   **Description:** A prefix truncation attack that allows a Man-in-the-Middle (MITM) attacker to bypass integrity checks during the SSH handshake. This can lead to the omission of certain packets, potentially downgrading or disabling security features of the SSH connection.
*   **Patched Version:** `0.40.2`
