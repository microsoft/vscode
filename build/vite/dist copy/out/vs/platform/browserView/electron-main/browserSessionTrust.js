/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** Key used to store trusted certificate data in the application storage. */
const STORAGE_KEY = 'browserView.sessionTrustData';
/** Trust entries expire after 1 week. */
const TRUST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Centralises all certificate and trust-related security logic for a
 * browser session.  Owns the trusted-certificate store, the cert-error
 * cache, the `setCertificateVerifyProc` handler on the Electron session,
 * and the per-`WebContents` `certificate-error` handler.
 */
export class BrowserSessionTrust {
    constructor(_session) {
        this._session = _session;
        /**
         * Trusted certificates stored as host → (fingerprint → expiration epoch ms).
         * Entries are time-limited; see {@link TRUST_DURATION_MS}.
         */
        this._trustedCertificates = new Map();
        /**
         * Last known certificate per host (hostname → { fingerprint, error }).
         * Populated by `setCertificateVerifyProc` which fires for every TLS
         * handshake, not just errors. This lets us look up cert status for a
         * URL even after Chromium has cached the allow decision.
         */
        this._certErrors = new Map();
        this._installCertVerifyProc();
    }
    /**
     * Install the session-level certificate verification callback that records cert errors.
     * This does not grant any trust by itself; it just populates the `_certErrors` cache.
     */
    _installCertVerifyProc() {
        this._session.electronSession.setCertificateVerifyProc((request, callback) => {
            const { hostname, errorCode, certificate, verificationResult } = request;
            if (errorCode !== 0) {
                this._certErrors.set(hostname, { certificate, error: verificationResult });
            }
            else {
                this._certErrors.delete(hostname);
            }
            return callback(-3); // Always use default handling from Chromium
        });
    }
    /**
     * Install a `certificate-error` handler on a {@link Electron.WebContents}
     * so that user-trusted certificates are accepted at the page level.
     */
    installCertErrorHandler(webContents) {
        webContents.on('certificate-error', (event, url, _error, certificate, callback) => {
            event.preventDefault();
            const host = URL.parse(url)?.hostname;
            if (!host) {
                return callback(false);
            }
            if (this.isCertificateTrusted(host, certificate.fingerprint)) {
                return callback(true);
            }
            return callback(false);
        });
    }
    /**
     * Look up the certificate status for a URL by extracting the host and
     * checking whether we have a last-known bad cert that was user-trusted.
     * Returns the cert error info if the host has a bad cert that was trusted,
     * or `undefined` if the cert is valid or unknown.
     */
    getCertificateError(url) {
        const parsed = URL.parse(url);
        if (!parsed || parsed.protocol !== 'https:') {
            return undefined;
        }
        const host = parsed.hostname;
        if (!host) {
            return undefined;
        }
        const known = this._certErrors.get(host);
        if (!known) {
            return undefined;
        }
        const cert = known.certificate;
        return {
            host,
            fingerprint: cert.fingerprint,
            error: known.error,
            url,
            hasTrustedException: this.isCertificateTrusted(host, cert.fingerprint),
            issuerName: cert.issuerName,
            subjectName: cert.subjectName,
            validStart: cert.validStart,
            validExpiry: cert.validExpiry,
        };
    }
    /**
     * Trust a certificate identified by host and SHA-256 fingerprint.
     */
    async trustCertificate(host, fingerprint) {
        let entries = this._trustedCertificates.get(host);
        if (!entries) {
            entries = new Map();
            this._trustedCertificates.set(host, entries);
        }
        entries.set(fingerprint, Date.now() + TRUST_DURATION_MS);
        this.writeStorage();
    }
    /**
     * Revoke trust for a certificate identified by host and fingerprint.
     */
    async untrustCertificate(host, fingerprint) {
        const entries = this._trustedCertificates.get(host);
        if (entries && entries.delete(fingerprint)) {
            if (entries.size === 0) {
                this._trustedCertificates.delete(host);
            }
        }
        else {
            throw new Error(`Certificate not found: host=${host} fingerprint=${fingerprint}`);
        }
        this.writeStorage();
        // Important: close all connections since they may be using the now-untrusted cert.
        await this._session.electronSession.closeAllConnections();
    }
    /**
     * Check whether a certificate is trusted for a given host.
     */
    isCertificateTrusted(host, fingerprint) {
        const expiresAt = this._trustedCertificates.get(host)?.get(fingerprint);
        if (expiresAt === undefined) {
            return false;
        }
        if (Date.now() > expiresAt) {
            return false;
        }
        return true;
    }
    /**
     * Connect application storage so that trusted certificates are
     * persisted across restarts. Restores any previously-saved data on
     * first call; subsequent calls are no-ops.
     */
    connectStorage(storage) {
        if (this._storage) {
            return; // already connected
        }
        this._storage = storage;
        this.readStorage();
    }
    /**
     * Clear all trust state: in-memory certs, cert-error cache, persisted
     * data, and close open connections that may be using now-untrusted certs.
     */
    async clear() {
        this._trustedCertificates.clear();
        this._certErrors.clear();
        this.writeStorage();
        // Important: close all connections since they may be using now-untrusted certs.
        await this._session.electronSession.closeAllConnections();
    }
    // #region Persistence helpers
    /**
     * Restore trusted certificates from application storage.
     */
    readStorage() {
        const storage = this._storage;
        if (!storage) {
            return;
        }
        const raw = storage.get(STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (!raw) {
            return;
        }
        const now = Date.now();
        let pruned = false;
        try {
            const all = JSON.parse(raw);
            const certs = all[this._session.id]?.trustedCerts;
            if (certs) {
                for (const { host, fingerprint, expiresAt } of certs) {
                    if (expiresAt > now) {
                        let entries = this._trustedCertificates.get(host);
                        if (!entries) {
                            entries = new Map();
                            this._trustedCertificates.set(host, entries);
                        }
                        entries.set(fingerprint, expiresAt);
                    }
                    else {
                        pruned = true;
                    }
                }
            }
        }
        catch {
            // Corrupt data — ignore
        }
        // Flush expired entries from storage
        if (pruned) {
            this.writeStorage();
        }
    }
    /**
     * Write trusted certificates to application storage.
     * The single storage key holds **all** sessions' data so that we can
     * clean up stale entries atomically.
     */
    writeStorage() {
        const storage = this._storage;
        if (!storage) {
            return;
        }
        // Read existing blob (other sessions may have data too)
        let all = {};
        try {
            const raw = storage.get(STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            if (raw) {
                all = JSON.parse(raw);
            }
        }
        catch {
            // Overwrite corrupt data
        }
        // Ensure this session's entry exists
        if (!all[this._session.id]) {
            all[this._session.id] = {};
        }
        // Update the trusted certs slice
        if (this._trustedCertificates.size === 0) {
            delete all[this._session.id].trustedCerts;
        }
        else {
            const certs = [];
            for (const [host, entries] of this._trustedCertificates) {
                for (const [fingerprint, expiresAt] of entries) {
                    certs.push({ host, fingerprint, expiresAt });
                }
            }
            all[this._session.id].trustedCerts = certs;
        }
        // Remove empty session entries
        if (Object.keys(all[this._session.id]).length === 0) {
            delete all[this._session.id];
        }
        // Write back (or remove if empty)
        if (Object.keys(all).length === 0) {
            storage.remove(STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
        else {
            storage.store(STORAGE_KEY, JSON.stringify(all), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclNlc3Npb25UcnVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLW1haW4vYnJvd3NlclNlc3Npb25UcnVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU9oRyw2RUFBNkU7QUFDN0UsTUFBTSxXQUFXLEdBQUcsOEJBQThCLENBQUM7QUFFbkQseUNBQXlDO0FBQ3pDLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQXlCbEQ7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sbUJBQW1CO0lBc0IvQixZQUNrQixRQUF3QjtRQUF4QixhQUFRLEdBQVIsUUFBUSxDQUFnQjtRQXJCMUM7OztXQUdHO1FBQ2MseUJBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQStDLENBQUM7UUFFL0Y7Ozs7O1dBS0c7UUFDYyxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUFnRSxDQUFDO1FBV3RHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFRDs7O09BR0c7SUFDSyxzQkFBc0I7UUFDN0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDNUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLGtCQUFrQixFQUFFLEdBQUcsT0FBTyxDQUFDO1lBRXpFLElBQUksU0FBUyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNyQixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUM1RSxDQUFDO2lCQUFNLENB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