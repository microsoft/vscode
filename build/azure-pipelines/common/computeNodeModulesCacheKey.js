"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { dirs } = require('../../npm/dirs');
const ROOT = path.join(__dirname, '../../../');
const shasum = crypto.createHash('sha1');
shasum.update(fs.readFileSync(path.join(ROOT, 'build/.cachesalt')));
shasum.update(fs.readFileSync(path.join(ROOT, '.yarnrc')));
shasum.update(fs.readFileSync(path.join(ROOT, 'remote/.yarnrc')));
// Add `package.json` and `yarn.lock` files
for (const dir of dirs) {
    const packageJsonPath = path.join(ROOT, dir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
    const relevantPackageJsonSections = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        optionalDependencies: packageJson.optionalDependencies,
        resolutions: packageJson.resolutions,
        distro: packageJson.distro
    };
    shasum.update(JSON.stringify(relevantPackageJsonSections));
    const yarnLockPath = path.join(ROOT, dir, 'yarn.lock');
    shasum.update(fs.readFileSync(yarnLockPath));
}
// Add any other command line arguments
for (let i = 2; i < process.argv.length; i++) {
    shasum.update(process.argv[i]);
}
process.stdout.write(shasum.digest('hex'));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZU5vZGVNb2R1bGVzQ2FjaGVLZXkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb21wdXRlTm9kZU1vZHVsZXNDYWNoZUtleS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsaUNBQWlDO0FBQ2pDLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUUzQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUUvQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRXpDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwRSxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzNELE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVsRSwyQ0FBMkM7QUFDM0MsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUN4QixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDN0QsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDNUUsTUFBTSwyQkFBMkIsR0FBRztRQUNuQyxZQUFZLEVBQUUsV0FBVyxDQUFDLFlBQVk7UUFDdEMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxlQUFlO1FBQzVDLG9CQUFvQixFQUFFLFdBQVcsQ0FBQyxvQkFBb0I7UUFDdEQsV0FBVyxFQUFFLFdBQVcsQ0FBQyxXQUFXO1FBQ3BDLE1BQU0sRUFBRSxXQUFXLENBQUMsTUFBTTtLQUMxQixDQUFDO0lBQ0YsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztJQUUzRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDdkQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFDOUMsQ0FBQztBQUVELHVDQUF1QztBQUN2QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztJQUM5QyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQyxDQUFDO0FBRUQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDIn0=