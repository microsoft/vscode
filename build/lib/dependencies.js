"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionDependencies = void 0;
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const root = fs.realpathSync(path.dirname(path.dirname(__dirname)));
function getNpmProductionDependencies(root) {
    let raw;
    try {
        raw = cp.execSync('npm ls --all --omit=dev --parseable', { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, stdio: [null, null, null] });
    }
    catch (err) {
        const regex = /^npm ERR! .*$/gm;
        let match;
        while (match = regex.exec(err.message)) {
            if (/ELSPROBLEMS/.test(match[0])) {
                continue;
            }
            else if (/invalid: xterm/.test(match[0])) {
                continue;
            }
            else if (/A complete log of this run/.test(match[0])) {
                continue;
            }
            else {
                throw err;
            }
        }
        raw = err.stdout;
    }
    return raw.split(/\r?\n/).filter(line => !!line.trim() && line !== root);
}
function getProductionDependencies(folderPath) {
    const result = getNpmProductionDependencies(folderPath);
    // TODO: Account for distro npm dependencies
    // const realFolderPath = fs.realpathSync(folderPath);
    // const relativeFolderPath = path.relative(root, realFolderPath);
    // const distroPackageJsonPath = `${root}/.build/distro/npm/${relativeFolderPath}/package.json`;
    // if (fs.existsSync(distroPackageJsonPath)) {
    // 	const distroPackageJson = JSON.parse(fs.readFileSync(distroPackageJsonPath, 'utf8'));
    // 	const distroDependencyNames = Object.keys(distroPackageJson.dependencies ?? {});
    // 	for (const name of distroDependencyNames) {
    // 		result.push({
    // 			name,
    // 			version: distroPackageJson.dependencies[name],
    // 			path: path.join(realFolderPath, 'node_modules', name)
    // 		});
    // 	}
    // }
    return [...new Set(result)];
}
exports.getProductionDependencies = getProductionDependencies;
if (require.main === module) {
    console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwZW5kZW5jaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwZW5kZW5jaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0Isb0NBQW9DO0FBQ3BDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVwRSxTQUFTLDRCQUE0QixDQUFDLElBQVk7SUFDakQsSUFBSSxHQUFXLENBQUM7SUFFaEIsSUFBSSxDQUFDO1FBQ0osR0FBRyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMscUNBQXFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2SyxDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNkLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDO1FBQ2hDLElBQUksS0FBNkIsQ0FBQztRQUVsQyxPQUFPLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3hDLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxTQUFTO1lBQ1YsQ0FBQztpQkFBTSxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUM1QyxTQUFTO1lBQ1YsQ0FBQztpQkFBTSxJQUFJLDRCQUE0QixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUN4RCxTQUFTO1lBQ1YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sR0FBRyxDQUFDO1lBQ1gsQ0FBQztRQUNGLENBQUM7UUFFRCxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQzFFLENBQUM7QUFFRCxTQUFnQix5QkFBeUIsQ0FBQyxVQUFrQjtJQUMzRCxNQUFNLE1BQU0sR0FBRyw0QkFBNEIsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUV4RCw0Q0FBNEM7SUFDNUMsc0RBQXNEO0lBQ3RELGtFQUFrRTtJQUNsRSxnR0FBZ0c7SUFFaEcsOENBQThDO0lBQzlDLHlGQUF5RjtJQUN6RixvRkFBb0Y7SUFFcEYsK0NBQStDO0lBQy9DLGtCQUFrQjtJQUNsQixXQUFXO0lBQ1gsb0RBQW9EO0lBQ3BELDJEQUEyRDtJQUMzRCxRQUFRO0lBQ1IsS0FBSztJQUNMLElBQUk7SUFFSixPQUFPLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUF0QkQsOERBc0JDO0FBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUMxRSxDQUFDIn0=