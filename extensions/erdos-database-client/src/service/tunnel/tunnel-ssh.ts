var net = require('net');
var Connection = require('ssh2');
var createConfig = require('../ssh/forward/lib/config');
var events = require('events');
var noop = function () {
};

function bindSSHConnection(config, netConnection) {
    var sshConnection = new Connection();
    netConnection.on('close', sshConnection.end.bind(sshConnection));

    sshConnection.on('ready', function () {
        netConnection.emit('sshConnection', sshConnection, netConnection);
        sshConnection.forwardOut(config.srcHost, config.srcPort, config.dstHost, config.dstPort, function (err, sshStream) {
            if (err) {
                // Bubble up the error => netConnection => server
                netConnection.emit('error', err);
                return;
            }

            netConnection.emit('sshStream', sshStream);
            netConnection.pipe(sshStream).pipe(netConnection);
        });
    });
    return sshConnection;
}

function createServer(config) {
    var server;
    var connections = [];
    var connectionCount = 0;

    server = net.createServer(function (netConnection) {
        var sshConnection;
        connectionCount++;
        netConnection.on('error', server.emit.bind(server, 'error'));
        netConnection.on('close', function () {
            connectionCount--;
            // if (connectionCount === 0) {
            //     if (!config.keepAlive) {
            //         setTimeout(function () {
            //             if (connectionCount === 0) {
            //                 server.close();
            //             }
            //         }, 2);
            //     }
            // }
        });

        server.emit('netConnection', netConnection, server);
        sshConnection = bindSSHConnection(config, netConnection);
        sshConnection.on('error', server.emit.bind(server, 'error'));

        netConnection.on('sshStream', function (sshStream) {
            sshStream.on('error', function () {
                server.close();
            });
        });

        connections.push(sshConnection, netConnection);
        try
        {
            sshConnection.connect(config);
        }catch(error)
        {
            server.emit('error', error);
        }
    });

    server.on('close', function () {
        connections.forEach(function (connection) {
            connection.end();
        });
    });

    return server;
}

function tunnel(configArgs, callback) {
    var server;
    var config;

    if (!callback) {
        callback = noop;
    }
    try {
        config = createConfig(configArgs);
        server = createServer(config);

        server.listen(config.localPort, config.localHost, function (error) {
            callback(error, server);
        });
    } catch (e) {
        server = new events.EventEmitter();
        setImmediate(function () {
            callback(e);
            server.emit('error', e);
        });
    }
    return server;
}

module.exports = tunnel;
export = tunnel;