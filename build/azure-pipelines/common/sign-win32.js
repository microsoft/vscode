"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const sign_1 = require("./sign");
const path = require("path");
(0, sign_1.main)([
    process.env['EsrpCliDllPath'],
    'windows',
    process.env['ESRPPKI'],
    process.env['ESRPAADUsername'],
    process.env['ESRPAADPassword'],
    path.dirname(process.argv[2]),
    path.basename(process.argv[2])
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi13aW4zMi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24td2luMzIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxpQ0FBOEI7QUFDOUIsNkJBQTZCO0FBRTdCLElBQUEsV0FBSSxFQUFDO0lBQ0osT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBRTtJQUM5QixTQUFTO0lBQ1QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUU7SUFDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBRTtJQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFFO0lBQy9CLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDOUIsQ0FBQyxDQUFDIn0=