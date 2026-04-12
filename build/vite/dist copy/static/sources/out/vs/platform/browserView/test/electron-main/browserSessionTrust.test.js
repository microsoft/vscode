/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { EventEmitter } from 'events';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { BrowserSessionTrust } from '../../electron-main/browserSessionTrust.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
const STORAGE_KEY = 'browserView.sessionTrustData';
const TRUST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
class TestElectronSession {
    constructor() {
        this.closeAllConnections = sinon.stub().resolves();
    }
    setCertificateVerifyProc(callback) {
        this.certificateVerifyProc = callback;
    }
    asSession() {
        return this;
    }
}
class TestBrowserSession {
    constructor(id, electronSession) {
        this.id = id;
        this.electronSession = electronSession;
    }
    asBrowserSession() {
        return this;
    }
}
class TestApplicationStorageMainService {
    constructor() {
        this.data = new Map();
        this.store = sinon.stub().callsFake((key, value) => {
            this.data.set(key, String(value));
        });
        this.remove = sinon.stub().callsFake(key => {
            this.data.delete(key);
        });
    }
    get(key, _scope, fallbackValue) {
        return this.data.get(key) ?? fallbackValue;
    }
    seed(key, value) {
        this.data.set(key, value);
    }
    read(key) {
        return this.data.get(key);
    }
    asService() {
        return this;
    }
}
class TestWebContents extends EventEmitter {
    asWebContents() {
        return this;
    }
}
function createTrust(sessionId = 'test-session') {
    const electronSession = new TestElectronSession();
    const browserSession = new TestBrowserSession(sessionId, electronSession.asSession());
    const trust = new BrowserSessionTrust(browserSession.asBrowserSession());
    const storage = new TestApplicationStorageMainService();
    return { trust, electronSession, storage };
}
function createCertificate(fingerprint, extra) {
    return { fingerprint, issuerName: 'Test CA', subjectName: 'test.example.com', validStart: 0, validExpiry: 0, ...extra };
}
function invokeVerifyProc(electronSession, request) {
    assert.ok(electronSession.certificateVerifyProc);
    let result;
    electronSession.certificateVerifyProc({
        errorCode: 0,
        verificationResult: 'OK',
        ...request
    }, value => {
        result = value;
    });
    assert.notStrictEqual(result, undefined);
    return result;
}
suite('BrowserSessionTrust', () => {
    teardown(() => {
        sinon.restore();
    });
    test('installs certificate verify proc and tracks certificate errors', () => {
        const { trust, electronSession } = createTrust();
        const verificationResult = invokeVerifyProc(electronSession, {
            hostname: 'example.com',
            errorCode: -202,
            verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID',
            certificate: createCertificate('abc123')
        });
        assert.strictEqual(verificationResult, -3);
        assert.deepStrictEqual(trust.getCertificateError('https://example.com/path'), {
            host: 'example.com',
            fingerprint: 'abc123',
            error: 'net::ERR_CERT_AUTHORITY_INVALID',
            url: 'https://example.com/path',
            hasTrustedException: false,
            issuerName: 'Test CA',
            subjectName: 'test.example.com',
            validStart: 0,
            validExpiry: 0,
        });
        invokeVerifyProc(electronSession, {
            hostname: 'example.com',
            certificate: createCertificate('abc123')
        });
        assert.strictEqual(trust.getCertificateError('https://example.com/path'), undefined);
    });
    test('trustCertificate persists data under the trust storage key', async () => {
        const { trust, storage } = createTrust();
        trust.connectStorage(storage.asService());
        await trust.trustCertificate('example.com', 'abc123');
        assert.strictEqual(storage.store.calledOnce, true);
        assert.deepStrictEqual(storage.store.firstCall.args.slice(0, 4), [STORAGE_KEY, storage.read(STORAGE_KEY), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */]);
        const persisted = JSON.parse(storage.read(STORAGE_KEY));
        assert.deepStrictEqual(persisted['test-session'].trustedCerts.map((entry) => ({ host: entry.host, fingerprint: entry.fingerprint })), [{ host: 'example.com', fingerprint: 'abc123' }]);
    });
    test('trustCertificate stores expiresAt relative to current time', async () => {
        const clock = sinon.useFakeTimers({ now: Date.parse('2026-03-01T00:00:00.000Z') });
        const { trust, storage } = createTrust();
        trust.connectStorage(storage.asService());
        await trust.trustCertificate('example.com', 'abc123');
        const persisted = JSON.parse(storage.read(STORAGE_KEY));
        const [entry] = persisted['test-session'].trustedCerts;
        assert.strictEqual(entry.host, 'example.com');
        assert.strictEqual(entry.fingerprint, 'abc123');
        assert.strictEqual(entry.expiresAt, Date.now() + TRUST_DURATION_MS);
        clock.restore();
    });
    test('trust is valid at expiration and invalid after expiration', async () => {
        const clock = sinon.useFakeTimers({ now: Date.parse('2026-03-01T00:00:00.000Z') });
        const { trust, electronSession, storage } = createTrust();
        const webContents = new TestWebContents();
        trust.installCertErrorHandler(webContents.asWebContents());
        trust.connectStorage(storage.asService());
        await trust.trustCertificate('example.com', 'abc123');
        electronSession.closeAllConnections.resetHistory();
        // Prior to the expiration boundary, trust should still be valid
        clock.tick(TRUST_DURATION_MS - 10);
        let callbackResult;
        const firstEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', firstEvent, 'https://example.com', 'ERR_CERT', createCertificate('abc123'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, true);
        // After expiration, trust should be revoked
        clock.tick(20);
        const secondEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', secondEvent, 'https://example.com', 'ERR_CERT', createCertificate('abc123'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, false);
        clock.restore();
    });
    test('connectStorage restores valid trust entries and prunes expired ones', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const { trust, storage } = createTrust();
        const webContents = new TestWebContents();
        trust.installCertErrorHandler(webContents.asWebContents());
        storage.seed(STORAGE_KEY, JSON.stringify({
            'test-session': {
                trustedCerts: [
                    { host: 'valid.example.com', fingerprint: 'valid', expiresAt: Date.now() + 1000 },
                    { host: 'expired.example.com', fingerprint: 'expired', expiresAt: Date.now() - 1000 }
                ]
            }
        }));
        trust.connectStorage(storage.asService());
        let callbackResult;
        const validEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', validEvent, 'https://valid.example.com', 'ERR_CERT', createCertificate('valid'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, true);
        const expiredEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', expiredEvent, 'https://expired.example.com', 'ERR_CERT', createCertificate('expired'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, false);
        const persisted = JSON.parse(storage.read(STORAGE_KEY));
        assert.deepStrictEqual(persisted['test-session'].trustedCerts.map((entry) => ({ host: entry.host, fingerprint: entry.fingerprint })), [{ host: 'valid.example.com', fingerprint: 'valid' }]);
    }));
    test('stored and reloaded trust expires and is pruned', async () => {
        const clock = sinon.useFakeTimers({ now: Date.parse('2026-03-01T00:00:00.000Z') });
        const storage = new TestApplicationStorageMainService();
        const firstSession = new TestElectronSession();
        const firstBrowserSession = new TestBrowserSession('test-session', firstSession.asSession());
        const firstTrust = new BrowserSessionTrust(firstBrowserSession.asBrowserSession());
        firstTrust.connectStorage(storage.asService());
        await firstTrust.trustCertificate('reload.example.com', 'reload-fingerprint');
        clock.tick(TRUST_DURATION_MS + 1);
        const secondSession = new TestElectronSession();
        const secondBrowserSession = new TestBrowserSession('test-session', secondSession.asSession());
        const secondTrust = new BrowserSessionTrust(secondBrowserSession.asBrowserSession());
        const webContents = new TestWebContents();
        secondTrust.installCertErrorHandler(webContents.asWebContents());
        secondTrust.connectStorage(storage.asService());
        let callbackResult;
        const event = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', event, 'https://reload.example.com', 'ERR_CERT', createCertificate('reload-fingerprint'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, false);
        assert.strictEqual(storage.read(STORAGE_KEY), undefined);
        clock.restore();
    });
    test('untrustCertificate removes persisted trust and closes connections', async () => {
        const { trust, electronSession, storage } = createTrust();
        trust.connectStorage(storage.asService());
        await trust.trustCertificate('example.com', 'abc123');
        electronSession.closeAllConnections.resetHistory();
        storage.store.resetHistory();
        await trust.untrustCertificate('example.com', 'abc123');
        assert.strictEqual(electronSession.closeAllConnections.calledOnce, true);
        assert.strictEqual(storage.remove.calledOnceWithExactly(STORAGE_KEY, -1 /* StorageScope.APPLICATION */), true);
        assert.strictEqual(storage.read(STORAGE_KEY), undefined);
    });
    test('untrustCertificate throws when certificate is not found', async () => {
        const { trust, electronSession, storage } = createTrust();
        trust.connectStorage(storage.asService());
        await assert.rejects(() => trust.untrustCertificate('missing.example.com', 'missing-fingerprint'), error => {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Certificate not found: host=missing.example.com fingerprint=missing-fingerprint');
            return true;
        });
        assert.strictEqual(electronSession.closeAllConnections.called, false);
    });
    test('clear removes trust, clears cert errors, and closes connections', async () => {
        const { trust, electronSession, storage } = createTrust();
        trust.connectStorage(storage.asService());
        await trust.trustCertificate('example.com', 'abc123');
        invokeVerifyProc(electronSession, {
            hostname: 'example.com',
            errorCode: -202,
            verificationResult: 'net::ERR_CERT_COMMON_NAME_INVALID',
            certificate: createCertificate('abc123')
        });
        await trust.clear();
        assert.strictEqual(electronSession.closeAllConnections.calledOnce, true);
        assert.strictEqual(trust.getCertificateError('https://example.com'), undefined);
        assert.strictEqual(storage.read(STORAGE_KEY), undefined);
    });
    test('installCertErrorHandler only allows trusted certificates', async () => {
        const { trust } = createTrust();
        const webContents = new TestWebContents();
        trust.installCertErrorHandler(webContents.asWebContents());
        let callbackResult;
        const firstEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', firstEvent, 'https://example.com', 'ERR_CERT', createCertificate('abc123'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, false);
        assert.strictEqual(firstEvent.preventDefault.calledOnce, true);
        await trust.trustCertificate('example.com', 'abc123');
        const secondEvent = { preventDefault: sinon.spy() };
        webContents.emit('certificate-error', secondEvent, 'https://example.com', 'ERR_CERT', createCertificate('abc123'), (value) => {
            callbackResult = value;
        });
        assert.strictEqual(callbackResult, true);
        assert.strictEqual(secondEvent.preventDefault.calledOnce, true);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclNlc3Npb25UcnVzdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYnJvd3NlclZpZXcvdGVzdC9lbGVjdHJvbi1tYWluL2Jyb3dzZXJTZXNzaW9uVHJ1c3QudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0QyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUd6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVqRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxNQUFNLFdBQVcsR0FBRyw4QkFBOEIsQ0FBQztBQUNuRCxNQUFNLGlCQUFpQixHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFLbEQsTUFBTSxtQkFBbUI7SUFBekI7UUFDVSx3QkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7SUFVeEQsQ0FBQztJQVBBLHdCQUF3QixDQUFDLFFBQStCO1FBQ3ZELElBQUksQ0FBQyxxQkFBcUIsR0FBRyxRQUFRLENBQUM7SUFDdkMsQ0FBQztJQUVELFNBQVM7UUFDUixPQUFPLElBQW1DLENBQUM7SUFDNUMsQ0FBQztDQUNEO0FBRUQsTUFBTSxrQkFBa0I7SUFDdkIsWUFDVSxFQUFVLEVBQ1YsZUFBaUM7UUFEakMsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNWLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtJQUN2QyxDQUFDO0lBRUwsZ0JBQWdCO1FBQ2YsT0FBTyxJQUFpQyxDQUFDO0lBQzFDLENBQUM7Q0FDRDtBQUVELE1BQU0saUNBQWlDO0lBQXZDO1FBQ2tCLFNBQUksR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUN6QyxVQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBc0csQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDMUosSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ25DLENBQUMsQ0FBQyxDQUFDO1FBQ00sV0FBTSxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQWdDLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQzVFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBaUJKLENBQUM7SUFmQSxHQUFHLENBQUMsR0FBVyxFQUFFLE1BQW9CLEVBQUUsYUFBc0I7UUFDNUQsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxhQUFhLENBQUM7SUFDNUMsQ0FBQztJQUVELElBQUksQ0FBQyxHQUFXLEVBQUUsS0FBYTtRQUM5QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELElBQUksQ0FBQyxHQUFXO1FBQ2YsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQsU0FBUztRQUNSLE9BQU8sSUFBaUQsQ0FBQztJQUMxRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGVBQWdCLFNBQVEsWUFBWTtJQUN6QyxhQUFhO1FBQ1osT0FBTyxJQUF1QyxDQUFDO0lBQ2hELENBQUM7Q0FDRDtBQUVELFNBQVMsV0FBVyxDQUFDLFNBQVMsR0FBRyxjQUFjO0lBSzlDLE1BQU0sZUFBZSxHQUFHLElBQUksbUJBQW1CLEVBQUUsQ0FBQztJQUNsRCxNQUFNLGNBQWMsR0FBRyxJQUFJLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxlQUFlLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUN0RixNQUFNLEtBQUssR0FBRyxJQUFJLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7SUFDekUsTUFBTSxPQUFPLEdBQUcsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDO0lBRXhELE9BQU8sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBQzVDLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLFdBQW1CLEVBQUUsS0FBcUM7SUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsR0FBRyxLQUFLLEVBQTBCLENBQUM7QUFDakosQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQ3hCLGVBQW9DLEVBQ3BDLE9BQW9HO0lBRXBHLE1BQU0sQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFFakQsSUFBSSxNQUEwQixDQUFDO0lBQy9CLGVBQWUsQ0FBQyxxQkFBc0IsQ0FBQztRQUN0QyxTQUFTLEVBQUUsQ0FBQztRQUNaLGtCQUFrQixFQUFFLElBQUk7UUFDeEIsR0FBRyxPQUFPO0tBQ2tCLEVBQUUsS0FBSyxDQUFDLEVBQUU7UUFDdEMsTUFBTSxHQUFHLEtBQUssQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3pDLE9BQU8sTUFBTyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ2pDLFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxFQUFFO1FBQzNFLE1BQU0sRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFFakQsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQyxlQUFlLEVBQUU7WUFDNUQsUUFBUSxFQUFFLGFBQWE7WUFDdkIsU0FBUyxFQUFFLENBQUMsR0FBRztZQUNmLGtCQUFrQixFQUFFLGlDQUFpQztZQUNyRCxXQUFXLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxDQUFDO1NBQ3hDLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFO1lBQzdFLElBQUksRUFBRSxhQUFhO1lBQ25CLFdBQVcsRUFBRSxRQUFRO1lBQ3JCLEtBQUssRUFBRSxpQ0FBaUM7WUFDeEMsR0FBRyxFQUFFLDBCQUEwQjtZQUMvQixtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLFVBQVUsRUFBRSxTQUFTO1lBQ3JCLFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsVUFBVSxFQUFFLENBQUM7WUFDYixXQUFXLEVBQUUsQ0FBQztTQUNkLENBQUMsQ0FBQztRQUVILGdCQUFnQixDQUFDLGVBQWUsRUFBRTtZQUNqQyxRQUFRLEVBQUUsYUFBYTtZQUN2QixXQUFXLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxDQUFDO1NBQ3hDLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLDBCQUEwQixDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDdEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNERBQTRELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0UsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsR0FBRyxXQUFXLEVBQUUsQ0FBQztRQUN6QyxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRTFDLE1BQU0sS0FBSyxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUV0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsbUVBQWtELENBQUMsQ0FBQztRQUU1SixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFFLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBNEMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDaE8sQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNERBQTRELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0UsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25GLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDekMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUUxQyxNQUFNLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFdEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBRSxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxZQUEwRSxDQUFDO1FBQ3JILE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsQ0FBQztRQUM5QyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDO1FBRXBFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkYsTUFBTSxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDMUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDM0QsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEQsZUFBZSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxDQUFDO1FBRW5ELGdFQUFnRTtRQUNoRSxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ25DLElBQUksY0FBbUMsQ0FBQztRQUN4QyxNQUFNLFVBQVUsR0FBRyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUNuRCxXQUFXLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxLQUFjLEVBQUUsRUFBRTtZQUNwSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFekMsNENBQTRDO1FBQzVDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDZixNQUFNLFdBQVcsR0FBRyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUNwRCxXQUFXLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxLQUFjLEVBQUUsRUFBRTtZQUNySSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFMUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFFQUFxRSxFQUFFLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hJLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDM0QsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUN4QyxjQUFjLEVBQUU7Z0JBQ2YsWUFBWSxFQUFFO29CQUNiLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUU7b0JBQ2pGLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUU7aUJBQ3JGO2FBQ0Q7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUVKLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFMUMsSUFBSSxjQUFtQyxDQUFDO1FBQ3hDLE1BQU0sVUFBVSxHQUFHLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ25ELFdBQVcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLDJCQUEyQixFQUFFLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQWMsRUFBRSxFQUFFO1lBQ3pJLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUV6QyxNQUFNLFlBQVksR0FBRyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUNyRCxXQUFXLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFlBQVksRUFBRSw2QkFBNkIsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxLQUFjLEVBQUUsRUFBRTtZQUMvSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFMUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBRSxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQTRDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDck8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsRSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkYsTUFBTSxPQUFPLEdBQUcsSUFBSSxpQ0FBaUMsRUFBRSxDQUFDO1FBQ3hELE1BQU0sWUFBWSxHQUFHLElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUMvQyxNQUFNLG1CQUFtQixHQUFHLElBQUksa0JBQWtCLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQzdGLE1BQU0sVUFBVSxHQUFHLElBQUksbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQ25GLFVBQVUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDL0MsTUFBTSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUU5RSxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWxDLE1BQU0sYUFBYSxHQUFHLElBQUksbUJBQW1CLEVBQUUsQ0FBQztRQUNoRCxNQUFNLG9CQUFvQixHQUFHLElBQUksa0JBQWtCLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sV0FBVyxHQUFHLElBQUksbUJBQW1CLENBQUMsb0JBQW9CLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsV0FBVyxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLFdBQVcsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFaEQsSUFBSSxjQUFtQyxDQUFDO1FBQ3hDLE1BQU0sS0FBSyxHQUFHLEVBQUUsY0FBYyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQzlDLFdBQVcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsS0FBYyxFQUFFLEVBQUU7WUFDbEosY0FBYyxHQUFHLEtBQUssQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUV6RCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEYsTUFBTSxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDMUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEQsZUFBZSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFN0IsTUFBTSxLQUFLLENBQUMsa0JBQWtCLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXhELE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsV0FBVyxvQ0FBMkIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUUsTUFBTSxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDMUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUUxQyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQ25CLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxxQkFBcUIsRUFBRSxxQkFBcUIsQ0FBQyxFQUM1RSxLQUFLLENBQUMsRUFBRTtZQUNQLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxpRkFBaUYsQ0FBQyxDQUFDO1lBQ3JILE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUNELENBQUM7UUFDRixNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEYsTUFBTSxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLEdBQUcsV0FBVyxFQUFFLENBQUM7UUFDMUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEQsZ0JBQWdCLENBQUMsZUFBZSxFQUFFO1lBQ2pDLFFBQVEsRUFBRSxhQUFhO1lBQ3ZCLFNBQVMsRUFBRSxDQUFDLEdBQUc7WUFDZixrQkFBa0IsRUFBRSxtQ0FBbUM7WUFDdkQsV0FBVyxFQUFFLGlCQUFpQixDQUFDLFFBQVEsQ0FBQztTQUN4QyxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQixNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMscUJBQXFCLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0UsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLFdBQVcsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBRTNELElBQUksY0FBbUMsQ0FBQztRQUN4QyxNQUFNLFVBQVUsR0FBRyxFQUFFLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUNuRCxXQUFXLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxLQUFjLEVBQUUsRUFBRTtZQUNwSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUvRCxNQUFNLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEQsTUFBTSxXQUFXLEdBQUcsRUFBRSxjQUFjLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDcEQsV0FBVyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsS0FBYyxFQUFFLEVBQUU7WUFDckksY0FBYyxHQUFHLEtBQUssQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDakUsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0FBQzNDLENBQUMsQ0FBQyxDQUFDIn0=