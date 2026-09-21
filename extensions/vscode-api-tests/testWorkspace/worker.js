// Worker script for browser tests – echoes messages back
self.onmessage = e => self.postMessage(e.data);
