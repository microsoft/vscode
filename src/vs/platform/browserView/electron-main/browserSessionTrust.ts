/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { IBrowserViewCertificateError } from '../common/browserView.js';
import type { BrowserSession } from './browserSession.js';

/** Key used to store trusted certificate data in the application storage. */
const STORAGE_KEY = 'browserView.sessionTrustData';

/** Trust entries expire after 1 week. */
const TRUST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Shape of the JSON blob persisted under {@link STORAGE_KEY}.
 * Top-level keys are session ids; each value holds the session's
 * trusted certificates.
 */
interface PersistedTrustData {
	[sessionId: string]: {
		trustedCerts?: { host: string; fingerprint: string; expiresAt: number }[];
	};
}

/**
 * Public subset of {@link BrowserSessionTrust} exposed to consumers
 * (e.g. {@link BrowserView}) that need to trust/untrust certificates
 * or query certificate errors.
 */
export interface IBrowserSessionTrust {
	trustCertificate(host: string, fingerprint: string): Promise<void>;
	untrustCertificate(host: string, fingerprint: string): Promise<void>;
	getCertificateError(url: string): IBrowserViewCertificateError | undefined;
	installCertErrorHandler(webContents: Electron.WebContents): void;
}

/**
 * Centralises all certificate and trust-related security logic for a
 * browser session.  Owns the trusted-certificate store, the cert-error
 * cache, the `setCertificateVerifyProc` handler on the Electron session,
 * and the per-`WebContents` `certificate-error` handler.
 */
export class BrowserSessionTrust implements IBrowserSessionTrust {

	/**
	 * Trusted certificates stored as host → (fingerprint → expiration epoch ms).
	 * Entries are time-limited; see {@link TRUST_DURATION_MS}.
	 */
	private readonly _trustedCertificates = new Map<string, Map<string, /* expiresAt */ number>>();

	/**
	 * Last known certificate per host (hostname → { fingerprint, error }).
	 * Populated by `setCertificateVerifyProc` which fires for every TLS
	 * handshake, not just errors. This lets us look up cert status for a
	 * URL even after Chromium has cached the allow decision.
	 */
	private readonly _certErrors = new Map<string, { certificate: Electron.Certificate; error: string }>();

	/**
	 * Application storage service for persisting trusted certificates
	 * across restarts. Set via {@link connectStorage}; `undefined` until then.
	 */
	private _storage: IApplicationStorageMainService | undefined;

	constructor(
		private readonly _session: BrowserSession,
	) {
		this._installCertVerifyProc();
	}

	/**
	 * Install the session-level certificate verification callback that records cert errors.
	 * This does not grant any trust by itself; it just populates the `_certErrors` cache.
	 */
	private _installCertVerifyProc(): void {
		this._session.electronSession.setCertificateVerifyProc((request, callback) => {
			const { hostname, errorCode, certificate, verificationResult } = request;

			if (errorCode !== 0) {
				this._certErrors.set(hostname, { certificate, error: verificationResult });
			} else {
				this._certErrors.delete(hostname);
			}

			return callback(-3); // Always use default handling from Chromium
		});
	}

	/**
	 * Install a `certificate-error` handler on a {@link Electron.WebContents}
	 * so that user-trusted certificates are accepted at the page level.
	 */
	installCertErrorHandler(webContents: Electron.WebContents): void {
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
	getCertificateError(url: string): IBrowserViewCertificateError | undefined {
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
	async trustCertificate(host: string, fingerprint: string): Promise<void> {
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
	async untrustCertificate(host: string, fingerprint: string): Promise<void> {
		const entries = this._trustedCertificates.get(host);
		if (entries && entries.delete(fingerprint)) {
			if (entries.size === 0) {
				this._trustedCertificates.delete(host);
			}
		} else {
			throw new Error(`Certificate not found: host=${host} fingerprint=${fingerprint}`);
		}
		this.writeStorage();
		// Important: close all connections since they may be using the now-untrusted cert.
		await this._session.electronSession.closeAllConnections();
	}

	/**
	 * Check whether a certificate is trusted for a given host.
	 */
	isCertificateTrusted(host: string, fingerprint: string): boolean {
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
	connectStorage(storage: IApplicationStorageMainService): void {
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
	async clear(): Promise<void> {
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
	private readStorage(): void {
		const storage = this._storage;
		if (!storage) {
			return;
		}

		const raw = storage.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return;
		}

		const now = Date.now();
		let pruned = false;
		try {
			const all: PersistedTrustData = JSON.parse(raw);
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
					} else {
						pruned = true;
					}
				}
			}
		} catch {
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
	private writeStorage(): void {
		const storage = this._storage;
		if (!storage) {
			return;
		}

		// Read existing blob (other sessions may have data too)
		let all: PersistedTrustData = {};
		try {
			const raw = storage.get(STORAGE_KEY, StorageScope.APPLICATION);
			if (raw) {
				all = JSON.parse(raw);
			}
		} catch {
			// Overwrite corrupt data
		}

		// Ensure this session's entry exists
		if (!all[this._session.id]) {
			all[this._session.id] = {};
		}

		// Update the trusted certs slice
		if (this._trustedCertificates.size === 0) {
			delete all[this._session.id].trustedCerts;
		} else {
			const certs: { host: string; fingerprint: string; expiresAt: number }[] = [];
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
			storage.remove(STORAGE_KEY, StorageScope.APPLICATION);
		} else {
			storage.store(STORAGE_KEY, JSON.stringify(all), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	// #endregion
}
