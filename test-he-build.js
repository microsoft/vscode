const esbuild = require('esbuild');
const path = require('path');

async function testHeBuild() {
    // Simple test without the plugin first
    try {
        const result = await esbuild.build({
            entryPoints: [path.join(__dirname, 'node_modules/he/he.js')],
            bundle: true,
            format: 'esm',
            outfile: 'test-he-simple.mjs',
            write: false,
            metafile: true
        });
        
        console.log('Simple build result:');
        console.log(result.outputFiles[0].text.slice(-500)); // Last 500 chars
        
    } catch (error) {
        console.error('Simple build failed:', error);
    }
    
    // Now test with the plugin
    try {
        const esbuildNamedExportsPlugin = require('esbuild-plugin-named-exports');
        
        const result = await esbuild.build({
            entryPoints: [path.join(__dirname, 'node_modules/he/he.js')],
            bundle: true,
            format: 'esm',
            outfile: 'test-he-plugin.mjs',
            write: false,
            plugins: [esbuildNamedExportsPlugin],
            metafile: true
        });
        
        console.log('\nWith plugin build result:');
        console.log(result.outputFiles[0].text.slice(-500)); // Last 500 chars
        
    } catch (error) {
        console.error('Plugin build failed:', error);
    }
}

testHeBuild();

