'use strict';

import * as net from 'net';

export function WaitForPortToOpen(port: number, timeout: number): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        var timedOut = false;
        const handle = setTimeout(() => {
            timedOut = true;
            reject(`Timeout after ${timeout} milli-seconds`);
        }, timeout);

        tryToConnect();

        function tryToConnect() {
            if (timedOut) {
                return;
            }

            var socket = net.connect(port, () => {
                if (timedOut) {
                    return;
                }

                resolve();
                socket.end();
                clearTimeout(handle);
            });
            socket.on("error", error=> {
                if (timedOut) {
                    return;
                }

                if (error.code === "ECONNREFUSED" && !timedOut) {
                    setTimeout(() => {
                        tryToConnect();
                    }, 10);
                    return;
                }

                clearTimeout(handle);
                reject(`Connection failed due to ${JSON.stringify(error)}`);
            });
        }
    });
}