#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Chat Webview Build Script
 *  自动构建 React Chat 应用
 *
 *  使用主项目的 esbuild 和 React，无需单独安装依赖
 *  集成到主项目的 watch 流程中
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));
const isWatch = process.argv.includes('--watch');

// 日志前缀
const LOG_PREFIX = '\x1b[36m[chat-webview]\x1b[0m';

function log(message) {
    console.log(`${LOG_PREFIX} ${message}`);
}

function logError(message) {
    console.error(`${LOG_PREFIX} \x1b[31m${message}\x1b[0m`);
}

function logSuccess(message) {
    console.log(`${LOG_PREFIX} \x1b[32m${message}\x1b[0m`);
}

// 找到主项目根目录
function findProjectRoot() {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            if (pkg.name === 'code-oss-dev') {
                return dir;
            }
        }
        dir = path.dirname(dir);
    }
    throw new Error('Cannot find project root');
}

const projectRoot = findProjectRoot();

// 动态加载主项目的依赖
const require = createRequire(path.join(projectRoot, 'package.json'));

let esbuild;
try {
    esbuild = require('esbuild');
} catch (e) {
    logError('Cannot find esbuild. Please run "npm install" in the project root first.');
    process.exit(1);
}

// 确保 dist 目录存在
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 检查入口文件是否存在
const entryPoint = path.join(__dirname, 'main.tsx');
if (!fs.existsSync(entryPoint)) {
    logError(`Entry file not found: ${entryPoint}`);
    process.exit(1);
}

// 构建配置
const buildOptions = {
    entryPoints: [entryPoint],
    bundle: true,
    outfile: path.join(distDir, 'main.js'),
    format: 'iife', // 使用 iife 格式以便在 webview 中直接运行
    target: 'es2020',
    loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
        '.css': 'css',
    },
    jsx: 'automatic',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    define: {
        'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    },
    logLevel: 'warning',
    // 使用主项目的 node_modules
    nodePaths: [path.join(projectRoot, 'node_modules')],
};

// 自定义插件：输出构建信息
const logPlugin = {
    name: 'log-plugin',
    setup(build) {
        let buildCount = 0;
        build.onStart(() => {
            buildCount++;
            if (buildCount > 1) {
                log('Rebuilding...');
            }
        });
        build.onEnd(result => {
            if (result.errors.length > 0) {
                logError(`Build failed with ${result.errors.length} error(s)`);
            } else {
                logSuccess(`Build complete (${new Date().toLocaleTimeString()})`);
            }
        });
    },
};

buildOptions.plugins = [logPlugin];

async function build() {
    try {
        if (isWatch) {
            // Watch 模式
            log('Starting watch mode...');
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            log('Watching for changes...');
        } else {
            // 单次构建
            log('Building...');
            const result = await esbuild.build(buildOptions);

            if (result.errors.length > 0) {
                logError('Build failed');
                process.exit(1);
            }
        }
    } catch (error) {
        logError(`Build failed: ${error.message}`);
        process.exit(1);
    }
}

build();