"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
let tag = '';
try {
    tag = cp
        .execSync('git describe --tags `git rev-list --tags --max-count=1`')
        .toString()
        .trim();
    if (!isValidTag(tag)) {
        throw Error(`Invalid tag ${tag}`);
    }
}
catch (err) {
    console.error(err);
    console.error('Failed to update types');
    process.exit(1);
}
function isValidTag(t) {
    if (t.split('.').length !== 3) {
        return false;
    }
    const [major, minor, bug] = t.split('.');
    // Only release for tags like 1.34.0
    if (bug !== '0') {
        return false;
    }
    if (isNaN(parseInt(major, 10)) || isNaN(parseInt(minor, 10))) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlY2stdmVyc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNoZWNrLXZlcnNpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxvQ0FBb0M7QUFFcEMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2IsSUFBSTtJQUNILEdBQUcsR0FBRyxFQUFFO1NBQ04sUUFBUSxDQUFDLHlEQUF5RCxDQUFDO1NBQ25FLFFBQVEsRUFBRTtTQUNWLElBQUksRUFBRSxDQUFDO0lBRVQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUNyQixNQUFNLEtBQUssQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDbEM7Q0FDRDtBQUFDLE9BQU8sR0FBRyxFQUFFO0lBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQixPQUFPLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDeEMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUNoQjtBQUVELFNBQVMsVUFBVSxDQUFDLENBQVM7SUFDNUIsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDOUIsT0FBTyxLQUFLLENBQUM7S0FDYjtJQUVELE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFekMsb0NBQW9DO0lBQ3BDLElBQUksR0FBRyxLQUFLLEdBQUcsRUFBRTtRQUNoQixPQUFPLEtBQUssQ0FBQztLQUNiO0lBRUQsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7UUFDN0QsT0FBTyxLQUFLLENBQUM7S0FDYjtJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQyJ9