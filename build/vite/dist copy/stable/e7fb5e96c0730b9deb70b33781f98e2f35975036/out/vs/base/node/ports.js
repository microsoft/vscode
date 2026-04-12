/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as net from 'net';
/**
 * Given a start point and a max number of retries, will find a port that
 * is openable. Will return 0 in case no free port can be found.
 */
export function findFreePort(startPort, giveUpAfter, timeout, stride = 1) {
    let done = false;
    return new Promise(resolve => {
        const timeoutHandle = setTimeout(() => {
            if (!done) {
                done = true;
                return resolve(0);
            }
        }, timeout);
        doFindFreePort(startPort, giveUpAfter, stride, (port) => {
            if (!done) {
                done = true;
                clearTimeout(timeoutHandle);
                return resolve(port);
            }
        });
    });
}
function doFindFreePort(startPort, giveUpAfter, stride, clb) {
    if (giveUpAfter === 0) {
        return clb(0);
    }
    const client = new net.Socket();
    // If we can connect to the port it means the port is already taken so we continue searching
    client.once('connect', () => {
        dispose(client);
        return doFindFreePort(startPort + stride, giveUpAfter - 1, stride, clb);
    });
    client.once('data', () => {
        // this listener is required since node.js 8.x
    });
    client.once('error', (err) => {
        dispose(client);
        // If we receive any non ECONNREFUSED error, it means the port is used but we cannot connect
        if (err.code !== 'ECONNREFUSED') {
            return doFindFreePort(startPort + stride, giveUpAfter - 1, stride, clb);
        }
        // Otherwise it means the port is free to use!
        return clb(startPort);
    });
    client.connect(startPort, '127.0.0.1');
}
// Reference: https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/net/base/port_util.cc#56
export const BROWSER_RESTRICTED_PORTS = {
    1: true, // tcpmux
    7: true, // echo
    9: true, // discard
    11: true, // systat
    13: true, // daytime
    15: true, // netstat
    17: true, // qotd
    19: true, // chargen
    20: true, // ftp data
    21: true, // ftp access
    22: true, // ssh
    23: true, // telnet
    25: true, // smtp
    37: true, // time
    42: true, // name
    43: true, // nicname
    53: true, // domain
    69: true, // tftp
    77: true, // priv-rjs
    79: true, // finger
    87: true, // ttylink
    95: true, // supdup
    101: true, // hostriame
    102: true, // iso-tsap
    103: true, // gppitnp
    104: true, // acr-nema
    109: true, // pop2
    110: true, // pop3
    111: true, // sunrpc
    113: true, // auth
    115: true, // sftp
    117: true, // uucp-path
    119: true, // nntp
    123: true, // NTP
    135: true, // loc-srv /epmap
    137: true, // netbios
    139: true, // netbios
    143: true, // imap2
    161: true, // snmp
    179: true, // BGP
    389: true, // ldap
    427: true, // SLP (Also used by Apple Filing Protocol)
    465: true, // smtp+ssl
    512: true, // print / exec
    513: true, // login
    514: true, // shell
    515: true, // printer
    526: true, // tempo
    530: true, // courier
    531: true, // chat
    532: true, // netnews
    540: true, // uucp
    548: true, // AFP (Apple Filing Protocol)
    554: true, // rtsp
    556: true, // remotefs
    563: true, // nntp+ssl
    587: true, // smtp (rfc6409)
    601: true, // syslog-conn (rfc3195)
    636: true, // ldap+ssl
    989: true, // ftps-data
    990: true, // ftps
    993: true, // ldap+ssl
    995: true, // pop3+ssl
    1719: true, // h323gatestat
    1720: true, // h323hostcall
    1723: true, // pptp
    2049: true, // nfs
    3659: true, // apple-sasl / PasswordServer
    4045: true, // lockd
    5060: true, // sip
    5061: true, // sips
    6000: true, // X11
    6566: true, // sane-port
    6665: true, // Alternate IRC [Apple addition]
    6666: true, // Alternate IRC [Apple addition]
    6667: true, // Standard IRC [Apple addition]
    6668: true, // Alternate IRC [Apple addition]
    6669: true, // Alternate IRC [Apple addition]
    6697: true, // IRC + TLS
    10080: true // Amanda
};
export function isPortFree(port, timeout) {
    return findFreePortFaster(port, 0, timeout).then(port => port !== 0);
}
/**
 * Uses listen instead of connect. Is faster, but if there is another listener on 0.0.0.0 then this will take 127.0.0.1 from that listener.
 */
export function findFreePortFaster(startPort, giveUpAfter, timeout, hostname = '127.0.0.1') {
    let resolved = false;
    let timeoutHandle = undefined;
    let countTried = 1;
    const server = net.createServer({ pauseOnConnect: true });
    function doResolve(port, resolve) {
        if (!resolved) {
            resolved = true;
            server.removeAllListeners();
            server.close();
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            resolve(port);
        }
    }
    return new Promise(resolve => {
        timeoutHandle = setTimeout(() => {
            doResolve(0, resolve);
        }, timeout);
        server.on('listening', () => {
            doResolve(startPort, resolve);
        });
        server.on('error', (err) => {
            if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES') && (countTried < giveUpAfter)) {
                startPort++;
                countTried++;
                server.listen(startPort, hostname);
            }
            else {
                doResolve(0, resolve);
            }
        });
        server.on('close', () => {
            doResolve(0, resolve);
        });
        server.listen(startPort, hostname);
    });
}
function dispose(socket) {
    try {
        socket.removeAllListeners('connect');
        socket.removeAllListeners('error');
        socket.end();
        socket.destroy();
        socket.unref();
    }
    catch (error) {
        console.error(error); // otherwise this error would get lost in the callback chain
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9ydHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL25vZGUvcG9ydHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFFM0I7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBQyxTQUFpQixFQUFFLFdBQW1CLEVBQUUsT0FBZSxFQUFFLE1BQU0sR0FBRyxDQUFDO0lBQy9GLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQztJQUVqQixPQUFPLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQzVCLE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDckMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNYLElBQUksR0FBRyxJQUFJLENBQUM7Z0JBQ1osT0FBTyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkIsQ0FBQztRQUNGLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVaLGNBQWMsQ0FBQyxTQUFTLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3ZELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWCxJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNaLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDNUIsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsU0FBaUIsRUFBRSxXQUFtQixFQUFFLE1BQWMsRUFBRSxHQUEyQjtJQUMxRyxJQUFJLFdBQVcsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN2QixPQUFPLEdBQUcsQ0FBQyxDQUFDLENB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