import * as assert from 'assert';
import * as sinon from 'sinon';
import { anyString, instance, mock, when } from 'ts-mockito';
import { FileSystem } from '../../client/common/platform/fileSystem';
import { IFileSystem } from '../../client/common/platform/types';
import * as Telemetry from '../../client/telemetry';
import { setExtensionInstallTelemetryProperties } from '../../client/telemetry/extensionInstallTelemetry';

suite('Extension Install Telemetry', () => {
    let fs: IFileSystem;
    let telemetryPropertyStub: sinon.SinonStub;
    setup(() => {
        fs = mock(FileSystem);
        telemetryPropertyStub = sinon.stub(Telemetry, 'setSharedProperty');
    });
    teardown(() => {
        telemetryPropertyStub.restore();
    });
    test('PythonCodingPack exists', async () => {
        when(fs.fileExists(anyString())).thenResolve(true);
        await setExtensionInstallTelemetryProperties(instance(fs));
        assert.ok(telemetryPropertyStub.calledOnceWithExactly('installSource', 'pythonCodingPack'));
    });
    test('PythonCodingPack does not exists', async () => {
        when(fs.fileExists(anyString())).thenResolve(false);
        await setExtensionInstallTelemetryProperties(instance(fs));
        assert.ok(telemetryPropertyStub.calledOnceWithExactly('installSource', 'marketPlace'));
    });
});
