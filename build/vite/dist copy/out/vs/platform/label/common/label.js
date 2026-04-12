/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const ILabelService = createDecorator('labelService');
export var Verbosity;
(function (Verbosity) {
    Verbosity[Verbosity["SHORT"] = 0] = "SHORT";
    Verbosity[Verbosity["MEDIUM"] = 1] = "MEDIUM";
    Verbosity[Verbosity["LONG"] = 2] = "LONG";
})(Verbosity || (Verbosity = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFiZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzlFLE1BQU0sQ0FBQyxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQWdCLGNBQWMsQ0FBQyxDQUFDO0FBK0I1RSxNQUFNLENBQU4sSUFBa0IsU0FJakI7QUFKRCxXQUFrQixTQUFTO0lBQzFCLDJDQUFLLENBQUE7SUFDTCw2Q0FBTSxDQUFBO0lBQ04seUNBQUksQ0FBQTtBQUNMLENBQUMsRUFKaUIsU0FBUyxLQUFULFNBQVMsUUFJMUIifQ==