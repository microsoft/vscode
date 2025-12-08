"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var snaps;
(function (snaps) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const cp = require('child_process');
    const mksnapshot = path.join(__dirname, `../../node_modules/.bin/${process.platform === 'win32' ? 'mksnapshot.cmd' : 'mksnapshot'}`);
    const product = require('../../product.json');
    const arch = (process.argv.join('').match(/--arch=(.*)/) || [])[1];
    //
    let loaderFilepath;
    let startupBlobFilepath;
    switch (process.platform) {
        case 'darwin':
            loaderFilepath = `VSCode-darwin/${product.nameLong}.app/Contents/Resources/app/out/vs/loader.js`;
            startupBlobFilepath = `VSCode-darwin/${product.nameLong}.app/Contents/Frameworks/Electron Framework.framework/Resources/snapshot_blob.bin`;
            break;
        case 'win32':
        case 'linux':
            loaderFilepath = `VSCode-${process.platform}-${arch}/resources/app/out/vs/loader.js`;
            startupBlobFilepath = `VSCode-${process.platform}-${arch}/snapshot_blob.bin`;
            break;
        default:
            throw new Error('Unknown platform');
    }
    loaderFilepath = path.join(__dirname, '../../../', loaderFilepath);
    startupBlobFilepath = path.join(__dirname, '../../../', startupBlobFilepath);
    snapshotLoader(loaderFilepath, startupBlobFilepath);
    function snapshotLoader(loaderFilepath, startupBlobFilepath) {
        const inputFile = fs.readFileSync(loaderFilepath);
        const wrappedInputFile = `
		var Monaco_Loader_Init;
		(function() {
			var doNotInitLoader = true;
			${inputFile.toString()};
			Monaco_Loader_Init = function() {
				AMDLoader.init();
				CSSLoaderPlugin.init();
				NLSLoaderPlugin.init();

				return { define, require };
			}
		})();
		`;
        const wrappedInputFilepath = path.join(os.tmpdir(), 'wrapped-loader.js');
        console.log(wrappedInputFilepath);
        fs.writeFileSync(wrappedInputFilepath, wrappedInputFile);
        cp.execFileSync(mksnapshot, [wrappedInputFilepath, `--startup_blob`, startupBlobFilepath]);
    }
})(snaps || (snaps = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25hcHNob3RMb2FkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzbmFwc2hvdExvYWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7QUFFaEcsSUFBVSxLQUFLLENBMkRkO0FBM0RELFdBQVUsS0FBSztJQUVkLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUVwQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwyQkFBMkIsT0FBTyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQ3JJLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRW5FLEVBQUU7SUFDRixJQUFJLGNBQXNCLENBQUM7SUFDM0IsSUFBSSxtQkFBMkIsQ0FBQztJQUVoQyxRQUFRLE9BQU8sQ0FBQyxRQUFRLEVBQUU7UUFDekIsS0FBSyxRQUFRO1lBQ1osY0FBYyxHQUFHLGlCQUFpQixPQUFPLENBQUMsUUFBUSw4Q0FBOEMsQ0FBQztZQUNqRyxtQkFBbUIsR0FBRyxpQkFBaUIsT0FBTyxDQUFDLFFBQVEsbUZBQW1GLENBQUM7WUFDM0ksTUFBTTtRQUVQLEtBQUssT0FBTyxDQUFDO1FBQ2IsS0FBSyxPQUFPO1lBQ1gsY0FBYyxHQUFHLFVBQVUsT0FBTyxDQUFDLFFBQVEsSUFBSSxJQUFJLGlDQUFpQyxDQUFDO1lBQ3JGLG1CQUFtQixHQUFHLFVBQVUsT0FBTyxDQUFDLFFBQVEsSUFBSSxJQUFJLG9CQUFvQixDQUFDO1lBQzdFLE1BQU07UUFFUDtZQUNDLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztLQUNyQztJQUVELGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDbkUsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsV0FBVyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFFN0UsY0FBYyxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBRXBELFNBQVMsY0FBYyxDQUFDLGNBQXNCLEVBQUUsbUJBQTJCO1FBRTFFLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbEQsTUFBTSxnQkFBZ0IsR0FBRzs7OztLQUl0QixTQUFTLENBQUMsUUFBUSxFQUFFOzs7Ozs7Ozs7R0FTdEIsQ0FBQztRQUNGLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUN6RSxPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDbEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRXpELEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUMsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO0lBQzVGLENBQUM7QUFDRixDQUFDLEVBM0RTLEtBQUssS0FBTCxLQUFLLFFBMkRkIn0=