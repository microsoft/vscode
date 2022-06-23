import { copyFileSync } from 'fs';
import { join } from 'path';

const targets = [
	{ src: '../package.nls.json', dest: './public/package.nls.json' },
];

for (const t of targets) {
	copyFileSync(join(__dirname, t.src), join(__dirname, t.dest));
}
