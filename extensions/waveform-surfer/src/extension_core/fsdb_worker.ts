import { SignalId, NetlistId } from './viewer_provider';

let fsdbAddon: any = null;
try {
    fsdbAddon = require('../build/Release/fsdb_reader.node');
} catch (error) {
    process.send!({ command: 'require-failed', error: error });
}

console.log("Start FSDB worker");

// Listen for messages from the main process.
process.on('message', (message: any) => {
    // try {
    //     console.log("Worker received message: " + JSON.stringify(message, null, 2));
    // } catch (e) {
    //     console.error('Data is not serializable:', e);
    // }
    const result = handleMessage(message);

    process.send!({ id: message.id, result: result });
});

function handleMessage(message: any) {
    switch (message.command) {
        case 'openFsdb': { fsdbAddon.openFsdb(message.fsdbPath); break; }
        case 'readScopes': { fsdbAddon.readScopes(fsdbScopeCallback, fsdbUpscopeCallback); break; }
        case 'readMetadata': { fsdbAddon.readMetadata(setMetadata, setChunkSize); break; }
        case 'readVars': {
            fsdbAddon.readVars(message.modulePath, message.scopeOffsetIdx, fsdbVarCallback, fsdbArrayBeginCallback, fsdbArrayEndCallback);
            break;
        }
        case 'loadSignals': { fsdbAddon.loadSignals(message.signalIdList); break; }
        case 'getValueChanges': { return fsdbAddon.getValueChanges(message.signalId); }
        case 'unloadSignal': { fsdbAddon.unloadSignal(message.signalId); break; }
        case 'unload': { fsdbAddon.unload(); break; }
    }
}

function fsdbScopeCallback(name: string, type: string, path: string, netlistId: number, scopeOffsetIdx: number) {
    process.send!({
        command: 'fsdb-scope-callback',
        name: name,
        type: type,
        path: path,
        netlistId: netlistId,
        scopeOffsetIdx: scopeOffsetIdx
    });
}

function fsdbUpscopeCallback() {
    process.send!({
        command: 'fsdb-upscope-callback'
    });
}

function setMetadata(scopecount: number, varcount: number, timescale: number, timeunit: string) {
    process.send!({
        command: 'setMetadata',
        scopecount: scopecount,
        varcount: varcount,
        timescale: timescale,
        timeunit: timeunit
    });
}

function setChunkSize(chunksize: number, timeend: number) {
    process.send!({
        command: 'setChunkSize',
        chunksize: chunksize,
        timeend: timeend
    });
}

function fsdbVarCallback(name: string, type: string, encoding: string, path: string, netlistId: NetlistId, signalId: SignalId, width: number, msb: number, lsb: number) {
    process.send!({
        command: 'fsdb-var-callback',
        name: name,
        type: type,
        encoding: encoding,
        path: path,
        netlistId: netlistId,
        signalId: signalId,
        width: width,
        msb: msb,
        lsb: lsb
    });
}

function fsdbArrayBeginCallback(name: string, path: string, netlistId: number) {
    process.send!({
        command: 'fsdb-array-begin-callback',
        name: name,
        path: path,
        netlistId: netlistId
    });
}

function fsdbArrayEndCallback(size: number) {
    process.send!({
        command: 'fsdb-array-end-callback',
        size: size,
    });
}
