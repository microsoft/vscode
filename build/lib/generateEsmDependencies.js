/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

/**
 * Generate ESM package dependencies using proper esbuild configuration
 * Based on web research for converting UMD to ESM with named exports
 */
async function generateEsmDependencies() {
    const esbuild = require('esbuild');
    const srcDir = path.join(__dirname, '../../src/esm-package-dependencies');
    const nodeModulesDir = path.join(__dirname, '../../node_modules');
    
    // Ensure directories exist
    fs.mkdirSync(srcDir, { recursive: true });
    
    // Clean up previous stable directories
    const stableDir = path.join(srcDir, 'stable');
    if (fs.existsSync(stableDir)) {
        fs.rmSync(stableDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stableDir, { recursive: true });
    
    console.log('Generating ESM package dependencies with esbuild...');
    
    // Define dependencies with their specific entry points
    const dependencies = [
        { 
            name: 'react', 
            file: 'react.js',
            // Use UMD build for React to get proper globals
            entryPoint: 'react/umd/react.production.min.js',
            isUMD: true
        },
        { 
            name: 'react-dom', 
            file: 'react-dom.js',
            entryPoint: 'react-dom/umd/react-dom.production.min.js',
            isUMD: true
        },
        { 
            name: 'react-dom/client', 
            file: 'react-dom-client.js',
            entryPoint: 'react-dom/client.js',
            isUMD: false
        },
        { 
            name: 'he', 
            file: 'he.js',
            entryPoint: 'he/he.js',
            isUMD: false
        },
        { 
            name: 'js-yaml', 
            file: 'js-yaml.js',
            entryPoint: 'js-yaml/index.js',
            isUMD: false
        },
        { 
            name: 'react-window', 
            file: 'react-window.js',
            entryPoint: 'react-window/dist/index.esm.js',
            isUMD: false
        }
    ];
    
    // Process each dependency
    for (const dep of dependencies) {
        await generateDependency(dep, srcDir, nodeModulesDir, esbuild);
    }
    
    // Generate client.js
    generateClientJs(srcDir);
    
    console.log('Successfully generated ESM package dependencies');
}

async function generateDependency(dep, srcDir, nodeModulesDir, esbuild) {
    try {
        // For subpath dependencies like 'react-dom/client', check the main package directory
        const packageName = dep.name.includes('/') ? dep.name.split('/')[0] : dep.name;
        const depPath = path.join(nodeModulesDir, packageName);
        if (!fs.existsSync(depPath)) {
            console.warn(`Dependency ${dep.name} not found, skipping`);
            return;
        }
        
        // Get version from package.json
        const packageJson = JSON.parse(fs.readFileSync(path.join(depPath, 'package.json'), 'utf8'));
        const version = packageJson.version;
        
        // Create output directories - sanitize the name for filesystem
        const sanitizedName = dep.name.replace('/', '-');
        const versionDir = path.join(srcDir, 'stable', `${sanitizedName}@${version}`, 'es2022');
        fs.mkdirSync(versionDir, { recursive: true });
        
        const outputFile = path.join(versionDir, `${sanitizedName}.mjs`);
        const entryPath = path.join(nodeModulesDir, dep.entryPoint);
        
        if (dep.isUMD) {
            // Handle UMD builds (React, ReactDOM)
            await buildUMDToESM(dep, entryPath, outputFile, esbuild);
        } else {
            // Handle standard CommonJS/ESM builds
            // Check if it's already an ESM module to avoid plugin conflicts
            if (dep.entryPoint.includes('.esm.js')) {
                await buildPureESM(dep, entryPath, outputFile, esbuild);
            } else {
                await buildStandardESM(dep, entryPath, outputFile, esbuild);
            }
        }
        
        console.log(`✓ Generated ${dep.name}@${version}`);
        
        // Create the wrapper file that exports from the stable version
        const wrapperContent = `/* eslint-disable */
export * from "./stable/${sanitizedName}@${version}/es2022/${sanitizedName}.mjs";
export { default } from "./stable/${sanitizedName}@${version}/es2022/${sanitizedName}.mjs";
`;
        fs.writeFileSync(path.join(srcDir, dep.file), wrapperContent);
        
    } catch (error) {
        console.error(`Failed to generate ${dep.name}:`, error.message);
        throw error;
    }
}

async function buildUMDToESM(dep, entryPath, outputFile, esbuild) {
    // Based on web search: Use esbuild-plugin-named-exports to convert CommonJS to ESM with named exports
    const esbuildNamedExportsPlugin = require('esbuild-plugin-named-exports');
    
    await esbuild.build({
        entryPoints: [path.join(__dirname, '../../node_modules', dep.name, 'index.js')],
        bundle: true,
        format: 'esm',
        outfile: outputFile,
        platform: 'browser',
        target: 'es2022',
        minify: true,
        sourcemap: false,
        banner: {
            js: '/* eslint-disable */'
        },
        // Key configuration from web search results
        mainFields: ['module', 'main'],
        external: dep.name === 'react-dom' ? ['react'] : [],
        // Critical: Use the plugin to handle CommonJS named exports
        plugins: [esbuildNamedExportsPlugin],
        define: {
            'process.env.NODE_ENV': '"production"'
        },
        logLevel: 'warning'
    });
}

async function buildStandardESM(dep, entryPath, outputFile, esbuild) {
    // Use the same plugin for consistency across all dependencies
    const esbuildNamedExportsPlugin = require('esbuild-plugin-named-exports');
    
    await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        format: 'esm',
        outfile: outputFile,
        platform: 'browser',
        target: 'es2022',
        minify: true,
        sourcemap: false,
        banner: {
            js: '/* eslint-disable */'
        },
        // Apply same settings for consistency
        mainFields: ['module', 'main'],
        plugins: [esbuildNamedExportsPlugin],
        logLevel: 'warning'
    });

    // For libraries with known named exports that the plugin doesn't handle properly, append them manually
    if (dep.name === 'he') {
        await appendNamedExports(outputFile, ['decode', 'encode', 'escape', 'unescape', 'version']);
    }
}

async function buildPureESM(dep, entryPath, outputFile, esbuild) {
    // For modules that are already ESM, don't use the plugin to avoid conflicts
    await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        format: 'esm',
        outfile: outputFile,
        platform: 'browser',
        target: 'es2022',
        minify: true,
        sourcemap: false,
        banner: {
            js: '/* eslint-disable */'
        },
        mainFields: ['module', 'main'],
        logLevel: 'warning'
    });
}

function generateClientJs(srcDir) {
    // Generate client.js for environment detection
    const clientContent = `/* eslint-disable */
// Browser client detection
const client = (() => {
    if (typeof window !== 'undefined') {
        return {
            type: 'browser',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        };
    } else if (typeof process !== 'undefined') {
        return {
            type: 'node',
            version: process.version
        };
    } else {
        return {
            type: 'unknown',
            environment: 'unknown'
        };
    }
})();

export { client };
export default client;
`;
    
    fs.writeFileSync(path.join(srcDir, 'client.js'), clientContent);
}

// Append named exports to an existing ESM file
async function appendNamedExports(outputFile, namedExports) {
    const fs = require('fs');
    
    // Read the current file content
    let content = fs.readFileSync(outputFile, 'utf8');
    
    // Remove the existing default export line
    content = content.replace(/export\s*{\s*export_default\s+as\s+default\s*};\s*$/m, '');
    
    // Create named export statements
    const namedExportStatements = namedExports.map(exportName => 
        `export const ${exportName} = export_default.${exportName};`
    ).join('\n');
    
    // Add the named exports and the default export
    content += `\n${namedExportStatements}\nexport { export_default as default };\n`;
    
    // Write the updated content back
    fs.writeFileSync(outputFile, content);
    
    console.log(`✓ Added named exports for ${outputFile}: ${namedExports.join(', ')}`);
}

// Check if required dependencies are available
function checkDependenciesInstalled() {
    const requiredDeps = ['esbuild', 'esbuild-plugin-named-exports'];
    const missing = [];
    
    for (const dep of requiredDeps) {
        try {
            require.resolve(dep);
        } catch (e) {
            missing.push(dep);
        }
    }
    
    if (missing.length > 0) {
        console.error(`Missing dependencies: ${missing.join(', ')}`);
        console.error('Please run: npm install --save-dev ' + missing.join(' '));
        return false;
    }
    
    return true;
}

if (require.main === module) {
    if (checkDependenciesInstalled()) {
        generateEsmDependencies().catch(error => {
            console.error('Failed to generate ESM dependencies:', error);
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
}

module.exports = { generateEsmDependencies };