"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const json = require("gulp-json-editor");
const buffer = require('gulp-buffer');
const filter = require("gulp-filter");
const es = require("event-stream");
const vfs = require("vinyl-fs");
const fancyLog = require("fancy-log");
const ansiColors = require("ansi-colors");
const fs = require("fs");
const path = require("path");
async function mixinClient(quality) {
    const productJsonFilter = filter(f => f.relative === 'product.json', { restore: true });
    fancyLog(ansiColors.blue('[mixin]'), `Mixing in client:`);
    return new Promise((c, e) => {
        vfs
            .src(`quality/${quality}/**`, { base: `quality/${quality}` })
            .pipe(filter(f => !f.isDirectory()))
            .pipe(filter(f => f.relative !== 'product.server.json'))
            .pipe(productJsonFilter)
            .pipe(buffer())
            .pipe(json((o) => {
            const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
            let builtInExtensions = originalProduct.builtInExtensions;
            if (Array.isArray(o.builtInExtensions)) {
                fancyLog(ansiColors.blue('[mixin]'), 'Overwriting built-in extensions:', o.builtInExtensions.map(e => e.name));
                builtInExtensions = o.builtInExtensions;
            }
            else if (o.builtInExtensions) {
                const include = o.builtInExtensions['include'] || [];
                const exclude = o.builtInExtensions['exclude'] || [];
                fancyLog(ansiColors.blue('[mixin]'), 'OSS built-in extensions:', builtInExtensions.map(e => e.name));
                fancyLog(ansiColors.blue('[mixin]'), 'Including built-in extensions:', include.map(e => e.name));
                fancyLog(ansiColors.blue('[mixin]'), 'Excluding built-in extensions:', exclude);
                builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
                builtInExtensions = [...builtInExtensions, ...include];
                fancyLog(ansiColors.blue('[mixin]'), 'Final built-in extensions:', builtInExtensions.map(e => e.name));
            }
            else {
                fancyLog(ansiColors.blue('[mixin]'), 'Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
            }
            return { webBuiltInExtensions: originalProduct.webBuiltInExtensions, ...o, builtInExtensions };
        }))
            .pipe(productJsonFilter.restore)
            .pipe(es.mapSync((f) => {
            fancyLog(ansiColors.blue('[mixin]'), f.relative, ansiColors.green('✔︎'));
            return f;
        }))
            .pipe(vfs.dest('.'))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
function mixinServer(quality) {
    const serverProductJsonPath = `quality/${quality}/product.server.json`;
    if (!fs.existsSync(serverProductJsonPath)) {
        fancyLog(ansiColors.blue('[mixin]'), `Server product not found`, serverProductJsonPath);
        return;
    }
    fancyLog(ansiColors.blue('[mixin]'), `Mixing in server:`);
    const originalProduct = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'product.json'), 'utf8'));
    const serverProductJson = JSON.parse(fs.readFileSync(serverProductJsonPath, 'utf8'));
    fs.writeFileSync('product.json', JSON.stringify({ ...originalProduct, ...serverProductJson }, undefined, '\t'));
    fancyLog(ansiColors.blue('[mixin]'), 'product.json', ansiColors.green('✔︎'));
}
function main() {
    const quality = process.env['VSCODE_QUALITY'];
    if (!quality) {
        console.log('Missing VSCODE_QUALITY, skipping mixin');
        return;
    }
    if (process.argv[2] === '--server') {
        mixinServer(quality);
    }
    else {
        mixinClient(quality).catch(err => {
            console.error(err);
            process.exit(1);
        });
    }
}
main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWl4aW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtaXhpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLHlDQUF5QztBQUN6QyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDdEMsc0NBQXNDO0FBQ3RDLG1DQUFtQztBQUVuQyxnQ0FBZ0M7QUFDaEMsc0NBQXNDO0FBQ3RDLDBDQUEwQztBQUMxQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBbUI3QixLQUFLLFVBQVUsV0FBVyxDQUFDLE9BQWU7SUFDekMsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBRXhGLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFFMUQsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUMzQixHQUFHO2FBQ0QsR0FBRyxDQUFDLFdBQVcsT0FBTyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxPQUFPLEVBQUUsRUFBRSxDQUFDO2FBQzVELElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO2FBQ25DLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLHFCQUFxQixDQUFDLENBQUM7YUFDdkQsSUFBSSxDQUFDLGlCQUFpQixDQUFDO2FBQ3ZCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQzthQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFVLEVBQUUsRUFBRTtZQUN6QixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBZSxDQUFDO1lBQzVILElBQUksaUJBQWlCLEdBQUcsZUFBZSxDQUFDLGlCQUFpQixDQUFDO1lBRTFELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsRUFBRTtnQkFDdkMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsa0NBQWtDLEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUUvRyxpQkFBaUIsR0FBRyxDQUFDLENBQUMsaUJBQWlCLENBQUM7YUFDeEM7aUJBQU0sSUFBSSxDQUFDLENBQUMsaUJBQWlCLEVBQUU7Z0JBQy9CLE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3JELE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRXJELFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLDBCQUEwQixFQUFFLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNyRyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxnQ0FBZ0MsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2pHLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLGdDQUFnQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUVoRixpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3pJLGlCQUFpQixHQUFHLENBQUMsR0FBRyxpQkFBaUIsRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDO2dCQUV2RCxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSw0QkFBNEIsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUN2RztpQkFBTTtnQkFDTixRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxvQ0FBb0MsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUMvRztZQUVELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxlQUFlLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQztRQUNoRyxDQUFDLENBQUMsQ0FBQzthQUNGLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUM7YUFDL0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFRLEVBQUUsRUFBRTtZQUM3QixRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RSxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO2FBQ0YsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkIsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUNwQixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNyQyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxPQUFlO0lBQ25DLE1BQU0scUJBQXFCLEdBQUcsV0FBVyxPQUFPLHNCQUFzQixDQUFDO0lBRXZFLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLEVBQUU7UUFDMUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsMEJBQTBCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUN4RixPQUFPO0tBQ1A7SUFFRCxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBRTFELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFlLENBQUM7SUFDNUgsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMscUJBQXFCLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNyRixFQUFFLENBQUMsYUFBYSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsR0FBRyxlQUFlLEVBQUUsR0FBRyxpQkFBaUIsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hILFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLGNBQWMsRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDOUUsQ0FBQztBQUVELFNBQVMsSUFBSTtJQUNaLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUU5QyxJQUFJLENBQUMsT0FBTyxFQUFFO1FBQ2IsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3RELE9BQU87S0FDUDtJQUVELElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxVQUFVLEVBQUU7UUFDbkMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0tBQ3JCO1NBQU07UUFDTixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztLQUNIO0FBQ0YsQ0FBQztBQUVELElBQUksRUFBRSxDQUFDIn0=