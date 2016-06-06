import * as tss from '../lib/tsserver';

let session = new tss.server.IOSession(tss.sys, tss.server.logger);

session.listen();