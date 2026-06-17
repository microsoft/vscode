/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import Generator from 'yeoman-generator';
import * as prompts from './prompts.js';

/**
 * @typedef {import('./index.js').ExtensionConfig} ExtensionConfig
 */


const chalk = new Chalk();

/**
 * @type {import('./index.js').ExtensionGenerator}
 */
export default {
    id: 'ext-command-ts',
    aliases: ['ts', 'command-ts'],
    name: 'New Extension (TypeScript)',
    insidersName: 'New Extension with Proposed API (TypeScript)',
    /**
     * @param {Generator} generator
     * @param {ExtensionConfig} extensionConfig
     */
    prompting: async (generator, extensionConfig) => {
        await prompts.askForExtensionDisplayName(generator, extensionConfig);
        await prompts.askForExtensionId(generator, extensionConfig);
        await prompts.askForExtensionDescription(generator, extensionConfig);

        await prompts.askForGit(generator, extensionConfig);
        await prompts.askForBundler(generator, extensionConfig);
        await prompts.askForPackageManager(generator, extensionConfig);
    },
    /**
     * @param {Generator} generator
     * @param {ExtensionConfig} extensionConfig
     */
    writing: (generator, extensionConfig) => {
        const bundler = extensionConfig.bundler;
        if (bundler && (bundler === 'webpack' || bundler === 'esbuild')) {
            const bundlerPath = bundler === 'esbuild' ? 'vscode-esbuild' : 'vscode-webpack';
            const bundlerFile = bundler === 'esbuild' ? 'esbuild.js' : 'webpack.config.js';
            generator.fs.copy(generator.templatePath(bundlerPath, 'vscode'), generator.destinationPath('.vscode'));
            generator.fs.copyTpl(generator.templatePath(bundlerPath, 'package.json'), generator.destinationPath('package.json'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath(bundlerPath, 'tsconfig.json'), generator.destinationPath('tsconfig.json'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath(bundlerPath, '.vscodeignore'), generator.destinationPath('.vscodeignore'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath(bundlerPath, bundlerFile), generator.destinationPath(bundlerFile), extensionConfig);
            generator.fs.copyTpl(generator.templatePath(bundlerPath, 'vsc-extension-quickstart.md'), generator.destinationPath('vsc-extension-quickstart.md'), extensionConfig);
        } else {
            generator.fs.copy(generator.templatePath('vscode'), generator.destinationPath('.vscode'));
            generator.fs.copyTpl(generator.templatePath('package.json'), generator.destinationPath('package.json'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath('tsconfig.json'), generator.destinationPath('tsconfig.json'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath('.vscodeignore'), generator.destinationPath('.vscodeignore'), extensionConfig);
            generator.fs.copyTpl(generator.templatePath('vsc-extension-quickstart.md'), generator.destinationPath('vsc-extension-quickstart.md'), extensionConfig);
        }

        if (extensionConfig.gitInit) {
            generator.fs.copy(generator.templatePath('gitignore'), generator.destinationPath('.gitignore'));
        }
        generator.fs.copyTpl(generator.templatePath('README.md'), generator.destinationPath('README.md'), extensionConfig);
        generator.fs.copyTpl(generator.templatePath('CHANGELOG.md'), generator.destinationPath('CHANGELOG.md'), extensionConfig);
        generator.fs.copyTpl(generator.templatePath('src/extension.ts'), generator.destinationPath('src/extension.ts'), extensionConfig);
        generator.fs.copy(generator.templatePath('src/test'), generator.destinationPath('src/test'));
        generator.fs.copy(generator.templatePath('.vscode-test.mjs'), generator.destinationPath('.vscode-test.mjs'));
        generator.fs.copy(generator.templatePath('eslint.config.mjs'), generator.destinationPath('eslint.config.mjs'));

        if (extensionConfig.pkgManager === 'yarn') {
            generator.fs.copyTpl(generator.templatePath('.yarnrc'), generator.destinationPath('.yarnrc'), extensionConfig);
        } else if (extensionConfig.pkgManager === 'pnpm') {
            generator.fs.copyTpl(generator.templatePath('.npmrc-pnpm'), generator.destinationPath('.npmrc'), extensionConfig);
        }

        extensionConfig.installDependencies = true;
        extensionConfig.proposedAPI = extensionConfig.insiders;
    },

    /**
     * @param {Generator} generator
     * @param {ExtensionConfig} extensionConfig
     */
    endMessage: (generator, extensionConfig) => {
        if (extensionConfig.bundler === 'webpack') {
            generator.log(chalk.yellow(`To run the extension you need to install the recommended extension 'amodio.tsl-problem-matcher'.`));
            generator.log('');
        } else if (extensionConfig.bundler === 'esbuild') {
            generator.log(chalk.yellow(`To run the extension you need to install the recommended extension 'connor4312.esbuild-problem-matchers'.`));
            generator.log('');
        }
    }
}
