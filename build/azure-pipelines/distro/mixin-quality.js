"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
function log(...args) {
    console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}
function main() {
    const quality = process.env['VSCODE_QUALITY'];
    if (!quality) {
        throw new Error('Missing VSCODE_QUALITY, skipping mixin');
    }
    log(`Mixing in distro quality...`);
    const basePath = `.build/distro/mixin/${quality}`;
    for (const name of fs.readdirSync(basePath)) {
        const distroPath = path.join(basePath, name);
        const ossPath = path.relative(basePath, distroPath);
        if (ossPath === 'product.json') {
            const distro = JSON.parse(fs.readFileSync(distroPath, 'utf8'));
            const oss = JSON.parse(fs.readFileSync(ossPath, 'utf8'));
            let builtInExtensions = oss.builtInExtensions;
            if (Array.isArray(distro.builtInExtensions)) {
                log('Overwriting built-in extensions:', distro.builtInExtensions.map(e => e.name));
                builtInExtensions = distro.builtInExtensions;
            }
            else if (distro.builtInExtensions) {
                const include = distro.builtInExtensions['include'] ?? [];
                const exclude = distro.builtInExtensions['exclude'] ?? [];
                log('OSS built-in extensions:', builtInExtensions.map(e => e.name));
                log('Including built-in extensions:', include.map(e => e.name));
                log('Excluding built-in extensions:', exclude);
                builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
                builtInExtensions = [...builtInExtensions, ...include];
                log('Final built-in extensions:', builtInExtensions.map(e => e.name));
            }
            else {
                log('Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
            }
            const result = { webBuiltInExtensions: oss.webBuiltInExtensions, ...distro, builtInExtensions };
            fs.writeFileSync(ossPath, JSON.stringify(result, null, '\t'), 'utf8');
        }
        else {
            fs.cpSync(distroPath, ossPath, { force: true, recursive: true });
        }
        log(distroPath, '✔︎');
    }
}
main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWl4aW4tcXVhbGl0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1peGluLXF1YWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBbUI3QixTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQVc7SUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUNqRyxDQUFDO0FBRUQsU0FBUyxJQUFJO0lBQ1osTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRTlDLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7S0FDMUQ7SUFFRCxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUVuQyxNQUFNLFFBQVEsR0FBRyx1QkFBdUIsT0FBTyxFQUFFLENBQUM7SUFFbEQsS0FBSyxNQUFNLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1FBQzVDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXBELElBQUksT0FBTyxLQUFLLGNBQWMsRUFBRTtZQUMvQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFZLENBQUM7WUFDMUUsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBZSxDQUFDO1lBQ3ZFLElBQUksaUJBQWlCLEdBQUcsR0FBRyxDQUFDLGlCQUFpQixDQUFDO1lBRTlDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsRUFBRTtnQkFDNUMsR0FBRyxDQUFDLGtDQUFrQyxFQUFFLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFFbkYsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLGlCQUFpQixDQUFDO2FBQzdDO2lCQUFNLElBQUksTUFBTSxDQUFDLGlCQUFpQixFQUFFO2dCQUNwQyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxRCxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUUxRCxHQUFHLENBQUMsMEJBQTBCLEVBQUUsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3BFLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2hFLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFFL0MsaUJBQWlCLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUN6SSxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsaUJBQWlCLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztnQkFFdkQsR0FBRyxDQUFDLDRCQUE0QixFQUFFLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2FBQ3RFO2lCQUFNO2dCQUNOLEdBQUcsQ0FBQyxvQ0FBb0MsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUM5RTtZQUVELE1BQU0sTUFBTSxHQUFHLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsTUFBTSxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDaEcsRUFBRSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQ3RFO2FBQU07WUFDTixFQUFFLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1NBQ2pFO1FBRUQsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztLQUN0QjtBQUNGLENBQUM7QUFFRCxJQUFJLEVBQUUsQ0FBQyJ9