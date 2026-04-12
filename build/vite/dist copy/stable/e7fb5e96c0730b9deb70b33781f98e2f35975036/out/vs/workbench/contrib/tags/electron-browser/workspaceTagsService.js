/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceTagsService } from '../common/workspaceTags.js';
import { getHashedRemotesFromConfig } from './workspaceTags.js';
import { splitLines } from '../../../../base/common/strings.js';
import { MavenArtifactIdRegex, MavenDependenciesRegex, MavenDependencyRegex, GradleDependencyCompactRegex, GradleDependencyLooseRegex, MavenGroupIdRegex, JavaLibrariesToLookFor } from '../common/javaWorkspaceTags.js';
import { hashAsync } from '../../../../base/common/hash.js';
const MetaModulesToLookFor = [
    // Azure packages
    '@azure',
    '@azure/ai',
    '@azure/core',
    '@azure/cosmos',
    '@azure/event',
    '@azure/identity',
    '@azure/keyvault',
    '@azure/search',
    '@azure/storage'
];
const ModulesToLookFor = [
    // Platform-related type definition packages
    '@types/vscode',
    '@vscode/dts',
    '@types/node',
    '@types/bun',
    'bun-types',
    '@types/web',
    // Packages that suggest a JS-based backend server
    'express',
    'sails',
    'koa',
    'hapi',
    'socket.io',
    'restify',
    'next',
    'nuxt',
    '@nestjs/core',
    'strapi',
    'gatsby',
    'fastify',
    'hono',
    // JS frameworks
    'react',
    'react-native',
    'react-native-macos',
    'react-native-windows',
    'rnpm-plugin-windows',
    '@types/react',
    '@angular/core',
    '@ionic',
    'vue',
    'tns-core-modules',
    '@nativescript/core',
    'electron',
    '@remix-run/react',
    '@remix-run/express',
    '@remix-run/node',
    '@remix-run/dev',
    '@sveltejs/kit',
    'preact',
    '@preact/signals',
    '@builder.io/qwik',
    'alpinejs',
    'astro',
    'htmx.org',
    'solid-js',
    'svelte',
    'lit-html',
    'vuepress',
    // Other interesting packages
    'aws-sdk',
    'aws-amplify',
    'azure',
    'azure-storage',
    'chroma',
    'deepseek-js',
    'docusaurus',
    'faiss',
    'firebase',
    '@google-cloud/common',
    'heroku-cli',
    'langchain',
    'milvus',
    'openai',
    'pinecone',
    'praisonai',
    'qdrant',
    'typescript',
    '@typescript/native-preview',
    'tslib',
    'eslint',
    'oxlint',
    'oxfmt',
    'typescript-eslint',
    'prettier',
    'dprint',
    '@dprint/formatter',
    '@babel/cli',
    '@babel/core',
    '@swc/cli',
    '@swc/core',
    'vite',
    'esbuild',
    'rollup',
    'rolldown',
    'nx',
    'turbo',
    'webpack',
    'parcel',
    '@biomejs/biome',
    '@rspack/core',
    '@rspack/cli',
    '@trpc/client',
    '@trpc/server',
    'zod',
    'pyright',
    'ts-morph',
    'oxc-minify',
    'oxc-transform',
    'oxc-resolver',
    'vue-tsc',
    'svelte-check',
    'tsup',
    'tsdown',
    // Office and Sharepoint packages
    '@microsoft/teams-js',
    '@microsoft/office-js',
    '@microsoft/office-js-helpers',
    '@types/office-js',
    '@types/office-runtime',
    'office-ui-fabric-react',
    '@uifabric/icons',
    '@uifabric/merge-styles',
    '@uifabric/styling',
    '@uifabric/experiments',
    '@uifabric/utilities',
    '@microsoft/rush',
    'lerna',
    'just-task',
    'beachball',
    // Playwright packages
    'playwright',
    'playwright-cli',
    '@playwright/test',
    'playwright-core',
    'playwright-chromium',
    'playwright-firefox',
    'playwright-webkit',
    // Other interesting browser testing packages
    'chai',
    'cypress',
    'gherkin',
    'jest',
    'mocha',
    'nightwatch',
    'protractor',
    'puppeteer',
    'selenium-webdriver',
    'vitest',
    'webdriverio',
    // AzureSDK packages
    '@azure/app-configuration',
    '@azure/cosmos-sign',
    '@azure/cosmos-language-service',
    '@azure/synapse-spark',
    '@azure/synapse-monitoring',
    '@azure/synapse-managed-private-endpoints',
    '@azure/synapse-artifacts',
    '@azure/synapse-access-control',
    '@azure/ai-metrics-advisor',
    '@azure/service-bus',
    '@azure/keyvault-secrets',
    '@azure/keyvault-keys',
    '@azure/keyvault-certificates',
    '@azure/keyvault-admin',
    '@azure/digital-twins-core',
    '@azure/cognitiveservices-anomalydetector',
    '@azure/ai-anomaly-detector',
    '@azure/core-xml',
    '@azure/core-tracing',
    '@azure/core-paging',
    '@azure/core-https',
    '@azure/core-client',
    '@azure/core-asynciterator-polyfill',
    '@azure/core-arm',
    '@azure/amqp-common',
    '@azure/core-lro',
    '@azure/logger',
    '@azure/core-http',
    '@azure/core-auth',
    '@azure/core-amqp',
    '@azure/abort-controller',
    '@azure/eventgrid',
    '@azure/storage-file-datalake',
    '@azure/search-documents',
    '@azure/storage-file',
    '@azure/storage-datalake',
    '@azure/storage-queue',
    '@azure/storage-file-share',
    '@azure/storage-blob-changefeed',
    '@azure/storage-blob',
    '@azure/cognitiveservices-formrecognizer',
    '@azure/ai-form-recognizer',
    '@azure/cognitiveservices-textanalytics',
    '@azure/ai-text-analytics',
    '@azure/event-processor-host',
    '@azure/schema-registry-avro',
    '@azure/schema-registry',
    '@azure/eventhubs-checkpointstore-blob',
    '@azure/event-hubs',
    '@azure/communication-signaling',
    '@azure/communication-calling',
    '@azure/communication-sms',
    '@azure/communication-common',
    '@azure/communication-chat',
    '@azure/communication-administration',
    '@azure/attestation',
    '@azure/data-tables',
    '@azure/arm-appservice',
    '@azure-rest/ai-inference',
    '@azure-rest/arm-appservice',
    '@azure/arm-appcontainers',
    '@azure/arm-rediscache',
    '@azure/arm-redisenterprisecache',
    '@azure/arm-apimanagement',
    '@azure/arm-logic',
    '@azure/app-configuration',
    '@azure/arm-appconfiguration',
    '@azure/arm-dashboard',
    '@azure/arm-signalr',
    '@azure/arm-securitydevops',
    '@azure/arm-labservices',
    '@azure/web-pubsub',
    '@azure/web-pubsub-client',
    '@azure/web-pubsub-client-protobuf',
    '@azure/web-pubsub-express',
    '@azure/openai',
    '@azure/arm-hybridkubernetes',
    '@azure/arm-kubernetesconfiguration',
    //AI and vector db dev packages
    'ai',
    '@anthropic-ai/sdk',
    '@anthropic-ai/tokenizer',
    '@arizeai/openinference-instrumentation-langchain',
    '@arizeai/openinference-instrumentation-openai',
    '@aws-sdk-client-bedrock-runtime',
    '@aws-sdk/client-bedrock',
    '@datastax/astra-db-ts',
    'fireworks-js',
    '@google-cloud/aiplatform',
    '@huggingface/inference',
    'humanloop',
    '@langchain/anthropic',
    'langsmith',
    'llamaindex',
    '@google-cloud/aiplatform',
    '@mistralai/mistralai',
    'mongodb',
    'neo4j-driver',
    'ollama',
    'onnxruntime-node',
    'onnxruntime-web',
    'pg',
    'postgresql',
    'redis',
    '@supabase/supabase-js',
    '@tensorflow/tfjs',
    '@xenova/transformers',
    'tika',
    'weaviate-client',
    '@zilliz/milvus2-sdk-node',
    //Azure AI
    '@azure-rest/ai-anomaly-detector',
    '@azure-rest/ai-content-safety',
    '@azure-rest/ai-document-intelligence',
    '@azure-rest/ai-document-translator',
    '@azure-rest/ai-personalizer',
    '@azure-rest/ai-translation-text',
    '@azure-rest/ai-vision-image-analysis',
    '@azure/ai-anomaly-detector',
    '@azure/ai-form-recognizer',
    '@azure/ai-language-conversations',
    '@azure/ai-language-text',
    '@azure/ai-text-analytics',
    '@azure/arm-botservice',
    '@azure/arm-cognitiveservices',
    '@azure/arm-machinelearning',
    '@azure/cognitiveservices-contentmoderator',
    '@azure/cognitiveservices-customvision-prediction',
    '@azure/cognitiveservices-customvision-training',
    '@azure/cognitiveservices-face',
    '@azure/cognitiveservices-translatortext',
    'microsoft-cognitiveservices-speech-sdk',
    '@google/generative-ai'
];
const PyMetaModulesToLookFor = [
    'azure-ai',
    'azure-cognitiveservices',
    'azure-core',
    'azure-cosmos',
    'azure-event',
    'azure-identity',
    'azure-keyvault',
    'azure-mgmt',
    'azure-ml',
    'azure-search',
    'azure-storage'
];
const PyModulesToLookFor = [
    'azure',
    'azure-ai-agents',
    'azure-ai-inference',
    'azure-ai-language-conversations',
    'azure-ai-language-questionanswering',
    'azure-ai-ml',
    'azure-ai-projects', // manage azure ai foundry projects
    'azure-ai-translation-document',
    'azure-appconfiguration',
    'azure-appconfiguration-provider',
    'azure-loganalytics',
    'azure-synapse-nspkg',
    'azure-synapse-spark',
    'azure-synapse-artifacts',
    'azure-synapse-accesscontrol',
    'azure-synapse',
    'azure-cognitiveservices-vision-nspkg',
    'azure-cognitiveservices-search-nspkg',
    'azure-cognitiveservices-nspkg',
    'azure-cognitiveservices-language-nspkg',
    'azure-cognitiveservices-knowledge-nspkg',
    'azure-containerregistry',
    'azure-communication-identity',
    'azure-communication-phonenumbers',
    'azure-communication-email',
    'azure-communication-rooms',
    'azure-communication-callautomation',
    'azure-confidentialledger',
    'azure-containerregistry',
    'azure-developer-loadtesting',
    'azure-iot-deviceupdate',
    'azure-messaging-webpubsubservice',
    'azure-monitor',
    'azure-monitor-query',
    'azure-monitor-ingestion',
    'azure-mgmt-appcontainers',
    'azure-mgmt-apimanagement',
    'azure-mgmt-web',
    'azure-mgmt-redis',
    'azure-mgmt-redisenterprise',
    'azure-mgmt-logic',
    'azure-appconfiguration',
    'azure-appconfiguration-provider',
    'azure-mgmt-appconfiguration',
    'azure-mgmt-dashboard',
    'azure-mgmt-signalr',
    'azure-messaging-webpubsubservice',
    'azure-mgmt-webpubsub',
    'azure-mgmt-securitydevops',
    'azure-mgmt-labservices',
    'azure-ai-metricsadvisor',
    'azure-servicebus',
    'azureml-sdk',
    'azure-keyvault-nspkg',
    'azure-keyvault-secrets',
    'azure-keyvault-keys',
    'azure-keyvault-certificates',
    'azure-keyvault-administration',
    'azure-digitaltwins-nspkg',
    'azure-digitaltwins-core',
    'azure-cognitiveservices-anomalydetector',
    'azure-ai-anomalydetector',
    'azure-applicationinsights',
    'azure-core-tracing-opentelemetry',
    'azure-core-tracing-opencensus',
    'azure-nspkg',
    'azure-common',
    'azure-eventgrid',
    'azure-storage-file-datalake',
    'azure-search-nspkg',
    'azure-search-documents',
    'azure-storage-nspkg',
    'azure-storage-file',
    'azure-storage-common',
    'azure-storage-queue',
    'azure-storage-file-share',
    'azure-storage-blob-changefeed',
    'azure-storage-blob',
    'azure-cognitiveservices-formrecognizer',
    'azure-ai-formrecognizer',
    'azure-ai-nspkg',
    'azure-cognitiveservices-language-textanalytics',
    'azure-ai-textanalytics',
    'azure-schemaregistry-avroencoder',
    'azure-schemaregistry-avroserializer',
    'azure-schemaregistry',
    'azure-eventhub-checkpointstoreblob-aio',
    'azure-eventhub-checkpointstoreblob',
    'azure-eventhub',
    'azure-servicefabric',
    'azure-communication-nspkg',
    'azure-communication-sms',
    'azure-communication-chat',
    'azure-communication-administration',
    'azure-security-attestation',
    'azure-data-nspkg',
    'azure-data-tables',
    'azure-devtools',
    'azure-elasticluster',
    'azure-functions',
    'azure-graphrbac',
    'azure-iothub-device-client',
    'azure-shell',
    'azure-translator',
    'azure-mgmt-hybridkubernetes',
    'azure-mgmt-kubernetesconfiguration',
    'a2a-sdk',
    'adal',
    'agents',
    'pydocumentdb',
    'botbuilder-core',
    'botbuilder-schema',
    'botframework-connector',
    'codegen',
    'deepseek',
    'fabric-data-agent-sdk',
    'google-adk',
    'playwright',
    'praisonai',
    'pydantic-ai',
    'python-rai',
    'transformers',
    'langchain',
    'llama-index',
    'google-cloud-aiplatform',
    'guidance',
    'openai',
    'semantic-kernel',
    'sentence-transformers',
    'smolagents',
    'stripe-agent-toolkit',
    // AI and vector db dev packages
    'anthropic',
    'aporia',
    'arize',
    'deepchecks',
    'fireworks-ai',
    'langchain-fireworks',
    'humanloop',
    'pymongo',
    'langchain-anthropic',
    'langchain-huggingface',
    'langchain-fireworks',
    'ollama',
    'onnxruntime',
    'pgvector',
    'sentence-transformers',
    'tika',
    'trulens',
    'trulens-eval',
    'wandb',
    // Azure AI Services
    'azure-ai-contentsafety',
    'azure-ai-documentintelligence',
    'azure-ai-translation-text',
    'azure-ai-vision',
    'azure-cognitiveservices-language-luis',
    'azure-cognitiveservices-speech',
    'azure-cognitiveservices-vision-contentmoderator',
    'azure-cognitiveservices-vision-face',
    'azure-mgmt-cognitiveservices',
    'azure-mgmt-search',
    'google-generativeai'
];
const GoModulesToLookFor = [
    'github.com/Azure/azure-sdk-for-go/sdk/storage/azblob',
    'github.com/Azure/azure-sdk-for-go/sdk/storage/azfile',
    'github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue',
    'github.com/Azure/azure-sdk-for-go/sdk/storage/azdatalake',
    'github.com/Azure/azure-sdk-for-go/sdk/tracing/azotel',
    'github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azadmin',
    'github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azcertificates',
    'github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azkeys',
    'github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets',
    'github.com/Azure/azure-sdk-for-go/sdk/monitor/azquery',
    'github.com/Azure/azure-sdk-for-go/sdk/monitor/azingest',
    'github.com/Azure/azure-sdk-for-go/sdk/messaging/azeventhubs',
    'github.com/Azure/azure-sdk-for-go/sdk/messaging/azservicebus',
    'github.com/Azure/azure-sdk-for-go/sdk/data/azappconfig',
    'github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos',
    'github.com/Azure/azure-sdk-for-go/sdk/data/aztables',
    'github.com/Azure/azure-sdk-for-go/sdk/containers/azcontainerregistry',
    'github.com/Azure/azure-sdk-for-go/sdk/ai/azopenai',
    'github.com/Azure/azure-sdk-for-go/sdk/azidentity',
    'github.com/Azure/azure-sdk-for-go/sdk/azcore',
    'github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/'
];
let WorkspaceTagsService = class WorkspaceTagsService {
    constructor(fileService, contextService, environmentService, textFileService) {
        this.fileService = fileService;
        this.contextService = contextService;
        this.environmentService = environmentService;
        this.textFileService = textFileService;
    }
    async getTags() {
        if (!this._tags) {
            this._tags = await this.resolveWorkspaceTags();
        }
        return this._tags;
    }
    async getTelemetryWorkspaceId(workspace, state) {
        function createHash(uri) {
            return hashAsync(uri.scheme === Schemas.file ? uri.fsPath : uri.toString());
        }
        let workspaceId;
        switch (state) {
            case 1 /* WorkbenchState.EMPTY */:
                workspaceId = undefined;
                break;
            case 2 /* WorkbenchState.FOLDER */:
                workspaceId = await createHash(workspace.folders[0].uri);
                break;
            case 3 /* WorkbenchState.WORKSPACE */:
                if (workspace.configuration) {
                    workspaceId = await createHash(workspace.configuration);
                }
        }
        return workspaceId;
    }
    getHashedRemotesFromUri(workspaceUri, stripEndingDotGit = false) {
        const path = workspaceUri.path;
        const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/.git/config` });
        return this.fileService.exists(uri).then(exists => {
            if (!exists) {
                return [];
            }
            return this.textFileService.read(uri, { acceptTextOnly: true }).then(content => getHashedRemotesFromConfig(content.value, stripEndingDotGit), err => [] // ignore missing or binary file
            );
        });
    }
    /* __GDPR__FRAGMENT__
        "WorkspaceTags" : {
            "workbench.filesToOpenOrCreate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workbench.filesToDiff" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workbench.filesToMerge" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "workspace.roots" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.empty" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.grunt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gulp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.jake" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.tsconfig" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.jsconfig" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.config.xml" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.vsc.extension" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.asp<NUMBER>" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.sln" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.unity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.express" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.sails" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.koa" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.hapi" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.socket.io" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.restify" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.next" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.nuxt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@nestjs/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.strapi" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.gatsby" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.rnpm-plugin-windows" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.react" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@angular/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.vue" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@anthropic-ai/sdk" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@anthropic-ai/tokenizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@arizeai/openinference-instrumentation-langchain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@arizeai/openinference-instrumentation-openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@aws-sdk-client-bedrock-runtime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@aws-sdk/client-bedrock" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.aws-sdk" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.aws-amplify-sdk" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/event" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/identity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/keyvault" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/search" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@google-cloud/aiplatform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.azure-storage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@google-cloud/common" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.firebase" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.heroku-cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@huggingface/inference" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@microsoft/teams-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@microsoft/office-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@microsoft/office-js-helpers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/office-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/office-runtime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.office-ui-fabric-react" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@uifabric/icons" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@uifabric/merge-styles" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@uifabric/styling" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@uifabric/experiments" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@uifabric/utilities" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@microsoft/rush" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.lerna" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.just-task" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.beachball" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.electron" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright-cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@playwright/test" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright-core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright-chromium" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright-firefox" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.playwright-webkit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.cypress" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.chroma" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.faiss" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.fireworks-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@datastax/astra-db-ts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.humanloop" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.langchain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@langchain/anthropic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.langsmith" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.llamaindex" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@google-cloud/aiplatform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@mistralai/mistralai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.milvus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.mongodb" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.neo4j-driver" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.ollama" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.onnxruntime-node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.onnxruntime-web" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.pinecone" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.postgresql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.pg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.qdrant" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.redis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@supabase/supabase-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@tensorflow/tfjs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@xenova/transformers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.weaviate-client" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@zilliz/milvus2-sdk-node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.nightwatch" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.protractor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.puppeteer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.selenium-webdriver" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.tika" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.webdriverio" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.gherkin" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/vscode" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@vscode/dts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/bun" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.bun-types" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/web" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.fastify" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.hono" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@types/react" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@remix-run/react" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@remix-run/express" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@remix-run/node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@remix-run/dev" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@sveltejs/kit" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.preact" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@preact/signals" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@builder.io/qwik" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.alpinejs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.astro" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.htmx.org" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.solid-js" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.svelte" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.lit-html" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.vuepress" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.docusaurus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.typescript" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@typescript/native-preview" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.tslib" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.eslint" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.oxlint" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.oxfmt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.typescript-eslint" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.prettier" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.dprint" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@dprint/formatter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@babel/cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@babel/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@swc/cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@swc/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.vite" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.esbuild" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.rollup" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.rolldown" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.nx" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.turbo" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.webpack" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.parcel" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@biomejs/biome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@rspack/core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@rspack/cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@trpc/client" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@trpc/server" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.zod" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.pyright" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.ts-morph" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.oxc-minify" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.oxc-transform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.oxc-resolver" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.vue-tsc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.svelte-check" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.tsup" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.tsdown" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.chai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.jest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.mocha" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.vitest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/app-configuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cosmos-sign" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cosmos-language-service" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/synapse-spark" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/synapse-monitoring" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/synapse-managed-private-endpoints" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/synapse-artifacts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/synapse-access-control" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-metrics-advisor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-anomaly-detector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-content-safety" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-document-intelligence" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-document-translator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-personalizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-translation-text" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-vision-image-analysis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-anomaly-detector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-form-recognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-language-conversations" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-language-text" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-text-analytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-botservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-cognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-machinelearning" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-contentmoderator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-customvision-prediction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-customvision-training" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-face" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-translatortext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.microsoft-cognitiveservices-speech-sdk" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/service-bus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/keyvault-secrets" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/keyvault-keys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/keyvault-certificates" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/keyvault-admin" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/digital-twins-core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-anomalydetector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-anomaly-detector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-xml" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-tracing" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-paging" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-https" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-client" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-asynciterator-polyfill" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-arm" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/amqp-common" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-lro" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/logger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-http" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-auth" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/core-amqp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/abort-controller" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/eventgrid" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-file-datalake" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/search-documents" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-file" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-datalake" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-queue" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-file-share" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-blob-changefeed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/storage-blob" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-formrecognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-form-recognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/cognitiveservices-textanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/ai-text-analytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/event-processor-host" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/schema-registry-avro" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/schema-registry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/eventhubs-checkpointstore-blob" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/event-hubs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-signaling" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-calling" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-sms" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-common" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-chat" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/communication-administration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/attestation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/data-tables" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/ai-inference" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure-rest/arm-appservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-appservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-appcontainers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-rediscache" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-redisenterprisecache" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-apimanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-logic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/app-configuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-dashboard" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-signalr" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-securitydevops" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-labservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/web-pubsub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/web-pubsub-client" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/web-pubsub-client-protobuf" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/web-pubsub-express" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-hybridkubernetes" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@azure/arm-kubernetesconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.react-native-macos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.react-native-windows" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.npm.@google/generative-ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.bower" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.yeoman.code.ext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.cordova.high" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.cordova.low" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.azure.yaml" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.xamarin.android" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.xamarin.ios" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.android.cpp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.reactNative" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.ionic" : { "classification" : "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": "true" },
            "workspace.nativeScript" : { "classification" : "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": "true" },
            "workspace.java.pom" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.java.gradle" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.java.android" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.javaee" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.jdbc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.jpa" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.lombok" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.mockito" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.redis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.springboot" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.sql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.unittest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-cosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-storage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-servicebus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-eventhubs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.langchain4j" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.springboot-ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.semantic-kernel" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-anomalydetector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-formrecognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-documentintelligence" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-translation-document" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-personalizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-translation-text" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-contentsafety" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-vision-imageanalysis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-textanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-search-documents" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-documenttranslator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-vision-face" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-ai-openai-assistants" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-cognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-cognitiveservices-speech" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.azure-functions" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.quarkus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.microprofile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.micronaut" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.gradle.graalvm" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.javaee" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.jdbc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.jpa" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.lombok" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.mockito" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.redis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.springboot" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.sql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.unittest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-cosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-storage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-servicebus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-eventhubs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.langchain4j" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.springboot-ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.semantic-kernel" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-anomalydetector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-formrecognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-documentintelligence" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-translation-document" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-personalizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-translation-text" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-contentsafety" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-vision-imageanalysis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-textanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-search-documents" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-documenttranslator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-vision-face" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-ai-openai-assistants" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-cognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-cognitiveservices-speech" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.azure-functions" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.quarkus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.microprofile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.micronaut" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.pom.graalvm" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.requirements" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.requirements.star" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.Pipfile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.conda" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.setup": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.pyproject": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.manage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.setupcfg": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.app": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.any-azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.pulumi-azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-inference" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-language-conversations" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-language-questionanswering" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-ml" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-contentsafety" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-documentintelligence" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-translation-text" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-vision" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-language-luis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-speech" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-vision-contentmoderator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-vision-face" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-cognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-search" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-translation-document" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-devtools" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-elasticluster" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-event" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-eventgrid" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-functions" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-graphrbac" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-identity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-iothub-device-client" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-loganalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ml" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-monitor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-appcontainers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-redis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-redisenterprise" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-apimanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-logic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-appconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-appconfiguration-provider" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-appconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-dashboard" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-appconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-signalr" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-messaging-webpubsubservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-webpubsub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-securitydevops" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-labservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-web" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-search" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-servicebus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-servicefabric" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-shell" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-translator" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-hybridkubernetes" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-mgmt-kubernetesconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.adal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.pydocumentdb" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.botbuilder-core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.botbuilder-schema" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.botframework-connector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.playwright" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-synapse-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-synapse-spark" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-synapse-artifacts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-synapse-accesscontrol" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-synapse" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-vision-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-search-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-language-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-knowledge-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-containerregistry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-metricsadvisor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azureml-sdk" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault-secrets" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault-keys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault-certificates" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-keyvault-administration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-digitaltwins-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-digitaltwins-core" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-anomalydetector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-anomalydetector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-applicationinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-core-tracing-opentelemetry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-core-tracing-opencensus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-common" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-eventgrid" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-file-datalake" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-search-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-search-documents" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-file" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-common" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-queue" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-file-share" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-blob-changefeed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-storage-blob" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-formrecognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-formrecognizer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-cognitiveservices-language-textanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-ai-textanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-schemaregistry-avroserializer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-schemaregistry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-eventhub-checkpointstoreblob-aio" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-eventhub-checkpointstoreblob" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-eventhub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-sms" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-chat" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-administration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-security-attestation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-appconfiguration-provider" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-identity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-phonenumbers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-email" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-rooms" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-communication-callautomation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-confidentialledger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-iot-deviceupdate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-developer-loadtesting" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-monitor-query" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-monitor-ingestion" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-schemaregistry-avroencoder" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-messaging-webpubsubservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-data-nspkg" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.azure-data-tables" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.arize" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.aporia" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.anthropic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.deepchecks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.fireworks-ai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.transformers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.humanloop" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.langchain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.langchain-anthropic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.langchain-fireworks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.langchain-huggingface" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.llama-index" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.google-cloud-aiplatform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.guidance" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.ollama" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.onnxruntime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.openai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.pymongo" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.pgvector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.semantic-kernel" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.sentence-transformers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.tika" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.trulens" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.trulens-eval" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.wandb" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.py.google-generativeai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/storage/azblob" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/storage/azfile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/storage/azdatalake" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/tracing/azotel" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azadmin" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azcertificates" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azkeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/monitor/azquery" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/monitor/azingest" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/messaging/azeventhubs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/messaging/azservicebus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/data/azappconfig" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/data/aztables" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/containers/azcontainerregistry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/ai/azopenai" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/azidentity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/azcore" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/iotfirmwaredefense/armiotfirmwaredefense" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/aad/armaad" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/addons/armaddons" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/advisor/armadvisor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/agrifood/armagrifood" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/alertsmanagement/armalertsmanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/analysisservices/armanalysisservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/apimanagement/armapimanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/appcomplianceautomation/armappcomplianceautomation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/appconfiguration/armappconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/appplatform/armappplatform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/appservice/armappservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/applicationinsights/armapplicationinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/azurearcdata/armazurearcdata" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/attestation/armattestation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/authorization/armauthorization" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/automanage/armautomanage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/automation/armautomation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/azuredata/armazuredata" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/azurestackhci/armazurestackhci" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/avs/armavs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/recoveryservices/armrecoveryservicesbackup" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/baremetalinfrastructure/armbaremetalinfrastructure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/batch/armbatch" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/billing/armbilling" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/billingbenefits/armbillingbenefits" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/blockchain/armblockchain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/blueprint/armblueprint" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/botservice/armbotservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/changeanalysis/armchangeanalysis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armchanges" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/chaos/armchaos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/search/armsearch" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/cognitiveservices/armcognitiveservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/commerce/armcommerce" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/communication/armcommunication" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/confidentialledger/armconfidentialledger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/confluent/armconfluent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/connectedvmware/armconnectedvmware" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/consumption/armconsumption" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/appcontainers/armappcontainers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/containerinstance/armcontainerinstance" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/containerregistry/armcontainerregistry" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/containerservice/armcontainerservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/containerservicefleet/armcontainerservicefleet" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/cdn/armcdn" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/cosmos/armcosmos" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/cosmosforpostgresql/armcosmosforpostgresql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/costmanagement/armcostmanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/customproviders/armcustomproviders" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/customerinsights/armcustomerinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/customerlockbox/armcustomerlockbox" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/databox/armdatabox" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/databoxedge/armdataboxedge" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datacatalog/armdatacatalog" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datafactory/armdatafactory" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datalake-analytics/armdatalakeanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datalake-store/armdatalakestore" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datamigration/armdatamigration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/dataprotection/armdataprotection" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datashare/armdatashare" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/databricks/armdatabricks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/datadog/armdatadog" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/delegatednetwork/armdelegatednetwork" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/deploymentmanager/armdeploymentmanager" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armdeploymentscripts" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/desktopvirtualization/armdesktopvirtualization" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/devcenter/armdevcenter" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/devhub/armdevhub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/deviceprovisioningservices/armdeviceprovisioningservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/deviceupdate/armdeviceupdate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/devops/armdevops" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/devtestlabs/armdevtestlabs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/digitaltwins/armdigitaltwins" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/dns/armdns" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/dnsresolver/armdnsresolver" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/domainservices/armdomainservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/dynatrace/armdynatrace" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/edgeorder/armedgeorder" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/edgeorderpartner/armedgeorderpartner" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/education/armeducation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/elastic/armelastic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/elasticsan/armelasticsan" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/elasticsans/armelasticsans" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/engagementfabric/armengagementfabric" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/eventgrid/armeventgrid" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/eventhub/armeventhub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/extendedlocation/armextendedlocation" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armfeatures" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/fluidrelay/armfluidrelay" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/frontdoor/armfrontdoor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/graphservices/armgraphservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/guestconfiguration/armguestconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hanaonazure/armhanaonazure" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hardwaresecuritymodules/armhardwaresecuritymodules" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hdinsight/armhdinsight" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/healthbot/armhealthbot" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/healthcareapis/armhealthcareapis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybridcompute/armhybridcompute" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybridconnectivity/armhybridconnectivity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybridcontainerservice/armhybridcontainerservice" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybriddatamanager/armhybriddatamanager" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybridkubernetes/armhybridkubernetes" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/hybridnetwork/armhybridnetwork" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/iotcentral/armiotcentral" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/iothub/armiothub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/iotsecurity/armiotsecurity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/keyvault/armkeyvault" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/kubernetesconfiguration/armkubernetesconfiguration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/kusto/armkusto" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/labservices/armlabservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armlinks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/loadtesting/armloadtesting" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armlocks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/operationalinsights/armoperationalinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/logic/armlogic" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/logz/armlogz" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/m365securityandcompliance/armm365securityandcompliance" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/machinelearning/armmachinelearning" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/machinelearningservices/armmachinelearningservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/maintenance/armmaintenance" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armmanagedapplications" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/solutions/armmanagedapplications" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/dashboard/armdashboard" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/managednetwork/armmanagednetwork" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/managednetworkfabric/armmanagednetworkfabric" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/msi/armmsi" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/managedservices/armmanagedservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/managementgroups/armmanagementgroups" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/managementpartner/armmanagementpartner" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/maps/armmaps" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mariadb/armmariadb" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/marketplace/armmarketplace" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/marketplaceordering/armmarketplaceordering" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mediaservices/armmediaservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/migrate/armmigrate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mixedreality/armmixedreality" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mobilenetwork/armmobilenetwork" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/monitor/armmonitor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mysql/armmysql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/mysql/armmysqlflexibleservers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/netapp/armnetapp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/network/armnetwork" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/networkcloud/armnetworkcloud" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/networkfunction/armnetworkfunction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/newrelic/armnewrelicobservability" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/nginx/armnginx" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/notificationhubs/armnotificationhubs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/oep/armoep" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/operationsmanagement/armoperationsmanagement" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/orbital/armorbital" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/paloaltonetworksngfw/armpanngfw" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/peering/armpeering" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armpolicy" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/policyinsights/armpolicyinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/portal/armportal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/postgresql/armpostgresql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/postgresql/armpostgresqlflexibleservers" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/postgresqlhsc/armpostgresqlhsc" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/powerbiprivatelinks/armpowerbiprivatelinks" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/powerbidedicated/armpowerbidedicated" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/powerbiembedded/armpowerbiembedded" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/powerplatform/armpowerplatform" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/privatedns/armprivatedns" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/providerhub/armproviderhub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/purview/armpurview" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/quantum/armquantum" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/liftrqumulo/armqumulo" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/quota/armquota" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/recoveryservices/armrecoveryservices" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/redhatopenshift/armredhatopenshift" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/redis/armredis" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/redisenterprise/armredisenterprise" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/relay/armrelay" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/reservations/armreservations" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resourceconnector/armresourceconnector" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resourcegraph/armresourcegraph" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resourcehealth/armresourcehealth" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resourcemover/armresourcemover" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/saas/armsaas" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/scheduler/armscheduler" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/scvmm/armscvmm" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/security/armsecurity" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securitydevops/armsecuritydevops" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securityinsight/armsecurityinsight" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securityinsights/armsecurityinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/selfhelp/armselfhelp" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/serialconsole/armserialconsole" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicebus/armservicebus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicefabric/armservicefabric" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicefabricmesh/armservicefabricmesh" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicelinker/armservicelinker" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicenetworking/armservicenetworking" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/signalr/armsignalr" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/recoveryservices/armrecoveryservicessiterecovery" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/sphere/armsphere" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/sql/armsql" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/sqlvirtualmachine/armsqlvirtualmachine" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storagecache/armstoragecache" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storageimportexport/armstorageimportexport" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storagemover/armstoragemover" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storagepool/armstoragepool" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storagesync/armstoragesync" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storsimple1200series/armstorsimple1200series" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storsimple8000series/armstorsimple8000series" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/streamanalytics/armstreamanalytics" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armsubscriptions" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/subscription/armsubscription" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/support/armsupport" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/synapse/armsynapse" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armtemplatespecs" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/testbase/armtestbase" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/timeseriesinsights/armtimeseriesinsights" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/trafficmanager/armtrafficmanager" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/web/armweb" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/webpubsub/armwebpubsub" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/windowsesu/armwindowsesu" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/windowsiot/armwindowsiot" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/workloadmonitor/armworkloadmonitor" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "workspace.go.mod.github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/workloads/armworkloads" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
        }
    */
    async resolveWorkspaceTags() {
        const tags = Object.create(null);
        const state = this.contextService.getWorkbenchState();
        const workspace = this.contextService.getWorkspace();
        tags['workspace.id'] = await this.getTelemetryWorkspaceId(workspace, state);
        const { filesToOpenOrCreate, filesToDiff, filesToMerge } = this.environmentService;
        tags['workbench.filesToOpenOrCreate'] = filesToOpenOrCreate && filesToOpenOrCreate.length || 0;
        tags['workbench.filesToDiff'] = filesToDiff && filesToDiff.length || 0;
        tags['workbench.filesToMerge'] = filesToMerge && filesToMerge.length || 0;
        const isEmpty = state === 1 /* WorkbenchState.EMPTY */;
        tags['workspace.roots'] = isEmpty ? 0 : workspace.folders.length;
        tags['workspace.empty'] = isEmpty;
        const folders = !isEmpty ? workspace.folders.map(folder => folder.uri) : undefined;
        if (!folders || !folders.length) {
            return Promise.resolve(tags);
        }
        const aiGeneratedWorkspaces = URI.joinPath(this.environmentService.workspaceStorageHome, 'aiGeneratedWorkspaces.json');
        await this.fileService.exists(aiGeneratedWorkspaces).then(async (result) => {
            if (result) {
                try {
                    const content = await this.fileService.readFile(aiGeneratedWorkspaces);
                    const workspaces = JSON.parse(content.value.toString());
                    if (workspaces.indexOf(workspace.folders[0].uri.toString()) > -1) {
                        tags['aiGenerated'] = true;
                    }
                }
                catch (e) {
                    // Ignore errors when resolving file contents
                }
            }
        });
        return this.fileService.resolveAll(folders.map(resource => ({ resource }))).then((files) => {
            const names = [].concat(...files.map(result => result.success ? (result.stat.children || []) : [])).map(c => c.name);
            const nameSet = names.reduce((s, n) => s.add(n.toLowerCase()), new Set());
            tags['workspace.grunt'] = nameSet.has('gruntfile.js');
            tags['workspace.gulp'] = nameSet.has('gulpfile.js');
            tags['workspace.jake'] = nameSet.has('jakefile.js');
            tags['workspace.tsconfig'] = nameSet.has('tsconfig.json');
            tags['workspace.jsconfig'] = nameSet.has('jsconfig.json');
            tags['workspace.config.xml'] = nameSet.has('config.xml');
            tags['workspace.vsc.extension'] = nameSet.has('vsc-extension-quickstart.md');
            tags['workspace.ASP5'] = nameSet.has('project.json') && this.searchArray(names, /^.+\.cs$/i);
            tags['workspace.sln'] = this.searchArray(names, /^.+\.sln$|^.+\.csproj$/i);
            tags['workspace.unity'] = nameSet.has('assets') && nameSet.has('library') && nameSet.has('projectsettings');
            tags['workspace.npm'] = nameSet.has('package.json') || nameSet.has('node_modules');
            tags['workspace.bower'] = nameSet.has('bower.json') || nameSet.has('bower_components');
            tags['workspace.azure.yaml'] = nameSet.has('azure.yaml') || nameSet.has('azure.yml');
            tags['workspace.java.pom'] = nameSet.has('pom.xml');
            tags['workspace.java.gradle'] = nameSet.has('build.gradle') || nameSet.has('settings.gradle') || nameSet.has('build.gradle.kts') || nameSet.has('settings.gradle.kts') || nameSet.has('gradlew') || nameSet.has('gradlew.bat');
            tags['workspace.yeoman.code.ext'] = nameSet.has('vsc-extension-quickstart.md');
            tags['workspace.py.requirements'] = nameSet.has('requirements.txt');
            tags['workspace.py.requirements.star'] = this.searchArray(names, /^(.*)requirements(.*)\.txt$/i);
            tags['workspace.py.Pipfile'] = nameSet.has('pipfile');
            tags['workspace.py.conda'] = this.searchArray(names, /^environment(\.yml$|\.yaml$)/i);
            tags['workspace.py.setup'] = nameSet.has('setup.py');
            tags['workspace.py.manage'] = nameSet.has('manage.py');
            tags['workspace.py.setupcfg'] = nameSet.has('setup.cfg');
            tags['workspace.py.app'] = nameSet.has('app.py');
            tags['workspace.py.pyproject'] = nameSet.has('pyproject.toml');
            tags['workspace.go.mod'] = nameSet.has('go.mod');
            const mainActivity = nameSet.has('mainactivity.cs') || nameSet.has('mainactivity.fs');
            const appDelegate = nameSet.has('appdelegate.cs') || nameSet.has('appdelegate.fs');
            const androidManifest = nameSet.has('androidmanifest.xml');
            const platforms = nameSet.has('platforms');
            const plugins = nameSet.has('plugins');
            const www = nameSet.has('www');
            const properties = nameSet.has('properties');
            const resources = nameSet.has('resources');
            const jni = nameSet.has('jni');
            if (tags['workspace.config.xml'] &&
                !tags['workspace.language.cs'] && !tags['workspace.language.vb'] && !tags['workspace.language.aspx']) {
                if (platforms && plugins && www) {
                    tags['workspace.cordova.high'] = true;
                }
                else {
                    tags['workspace.cordova.low'] = true;
                }
            }
            if (tags['workspace.config.xml'] &&
                !tags['workspace.language.cs'] && !tags['workspace.language.vb'] && !tags['workspace.language.aspx']) {
                if (nameSet.has('ionic.config.json')) {
                    tags['workspace.ionic'] = true;
                }
            }
            if (mainActivity && properties && resources) {
                tags['workspace.xamarin.android'] = true;
            }
            if (appDelegate && resources) {
                tags['workspace.xamarin.ios'] = true;
            }
            if (androidManifest && jni) {
                tags['workspace.android.cpp'] = true;
            }
            function getFilePromises(filename, fileService, textFileService, contentHandler) {
                return !nameSet.has(filename) ? [] : folders.map(workspaceUri => {
                    const uri = workspaceUri.with({ path: `${workspaceUri.path !== '/' ? workspaceUri.path : ''}/${filename}` });
                    return fileService.exists(uri).then(exists => {
                        if (!exists) {
                            return undefined;
                        }
                        return textFileService.read(uri, { acceptTextOnly: true }).then(contentHandler);
                    }, err => {
                        // Ignore missing file
                    });
                });
            }
            function addPythonTags(packageName) {
                if (PyModulesToLookFor.indexOf(packageName) > -1) {
                    tags['workspace.py.' + packageName] = true;
                }
                for (const metaModule of PyMetaModulesToLookFor) {
                    if (packageName.startsWith(metaModule)) {
                        tags['workspace.py.' + metaModule] = true;
                    }
                }
                if (!tags['workspace.py.any-azure']) {
                    tags['workspace.py.any-azure'] = /azure/i.test(packageName);
                }
            }
            const requirementsTxtPromises = getFilePromises('requirements.txt', this.fileService, this.textFileService, content => {
                const dependencies = splitLines(content.value);
                for (const dependency of dependencies) {
                    // Dependencies in requirements.txt can have 3 formats: `foo==3.1, foo>=3.1, foo`
                    const format1 = dependency.split('==');
                    const format2 = dependency.split('>=');
                    const packageName = (format1.length === 2 ? format1[0] : format2[0]).trim();
                    addPythonTags(packageName);
                }
            });
            const pipfilePromises = getFilePromises('pipfile', this.fileService, this.textFileService, content => {
                let dependencies = splitLines(content.value);
                // We're only interested in the '[packages]' section of the Pipfile
                dependencies = dependencies.slice(dependencies.indexOf('[packages]') + 1);
                for (const dependency of dependencies) {
                    if (dependency.trim().indexOf('[') > -1) {
                        break;
                    }
                    // All dependencies in Pipfiles follow the format: `<package> = <version, or git repo, or something else>`
                    if (dependency.indexOf('=') === -1) {
                        continue;
                    }
                    const packageName = dependency.split('=')[0].trim();
                    addPythonTags(packageName);
                }
            });
            const packageJsonPromises = getFilePromises('package.json', this.fileService, this.textFileService, content => {
                try {
                    const packageJsonContents = JSON.parse(content.value);
                    const dependencies = Object.keys(packageJsonContents['dependencies'] || {}).concat(Object.keys(packageJsonContents['devDependencies'] || {}));
                    for (const dependency of dependencies) {
                        if (dependency.startsWith('react-native')) {
                            tags['workspace.reactNative'] = true;
                        }
                        else if ('tns-core-modules' === dependency || '@nativescript/core' === dependency) {
                            tags['workspace.nativescript'] = true;
                        }
                        else if (ModulesToLookFor.indexOf(dependency) > -1) {
                            tags['workspace.npm.' + dependency] = true;
                        }
                        else {
                            for (const metaModule of MetaModulesToLookFor) {
                                if (dependency.startsWith(metaModule)) {
                                    tags['workspace.npm.' + metaModule] = true;
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    // Ignore errors when resolving file or parsing file contents
                }
            });
            const goModPromises = getFilePromises('go.mod', this.fileService, this.textFileService, content => {
                try {
                    const lines = splitLines(content.value);
                    let firstRequireBlockFound = false;
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('require (')) {
                            if (!firstRequireBlockFound) {
                                firstRequireBlockFound = true;
                                continue;
                            }
                            else {
                                break;
                            }
                        }
                        if (line.startsWith(')')) {
                            break;
                        }
                        if (firstRequireBlockFound && line !== '') {
                            const packageName = line.split(' ')[0].trim();
                            for (const module of GoModulesToLookFor) {
                                if (packageName.startsWith(module)) {
                                    tags['workspace.go.mod.' + packageName] = true;
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    // Ignore errors when resolving file or parsing file contents
                }
            });
            const pomPromises = getFilePromises('pom.xml', this.fileService, this.textFileService, content => {
                try {
                    let dependenciesContent;
                    while (dependenciesContent = MavenDependenciesRegex.exec(content.value)) {
                        let dependencyContent;
                        while (dependencyContent = MavenDependencyRegex.exec(dependenciesContent[1])) {
                            const groupIdContent = MavenGroupIdRegex.exec(dependencyContent[1]);
                            const artifactIdContent = MavenArtifactIdRegex.exec(dependencyContent[1]);
                            if (groupIdContent && artifactIdContent) {
                                this.tagJavaDependency(groupIdContent[1], artifactIdContent[1], 'workspace.pom.', tags);
                            }
                        }
                    }
                }
                catch (e) {
                    // Ignore errors when resolving maven dependencies
                }
            });
            const gradlePromises = getFilePromises('build.gradle', this.fileService, this.textFileService, content => {
                try {
                    this.processGradleDependencies(content.value, GradleDependencyLooseRegex, tags);
                    this.processGradleDependencies(content.value, GradleDependencyCompactRegex, tags);
                }
                catch (e) {
                    // Ignore errors when resolving gradle dependencies
                }
            });
            const androidPromises = folders.map(workspaceUri => {
                const manifest = URI.joinPath(workspaceUri, '/app/src/main/AndroidManifest.xml');
                return this.fileService.exists(manifest).then(result => {
                    if (result) {
                        tags['workspace.java.android'] = true;
                    }
                }, err => {
                    // Ignore errors when resolving android
                });
            });
            return Promise.all([...packageJsonPromises, ...requirementsTxtPromises, ...pipfilePromises, ...pomPromises, ...gradlePromises, ...androidPromises, ...goModPromises]).then(() => tags);
        });
    }
    processGradleDependencies(content, regex, tags) {
        let dependencyContent;
        while (dependencyContent = regex.exec(content)) {
            const groupId = dependencyContent[1];
            const artifactId = dependencyContent[2];
            if (groupId && artifactId) {
                this.tagJavaDependency(groupId, artifactId, 'workspace.gradle.', tags);
            }
        }
    }
    tagJavaDependency(groupId, artifactId, prefix, tags) {
        for (const javaLibrary of JavaLibrariesToLookFor) {
            if (javaLibrary.predicate(groupId, artifactId)) {
                tags[prefix + javaLibrary.tag] = true;
                return;
            }
        }
    }
    searchArray(arr, regEx) {
        return arr.some(v => v.search(regEx) > -1) || undefined;
    }
};
WorkspaceTagsService = __decorate([
    __param(0, IFileService),
    __param(1, IWorkspaceContextService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ITextFileService)
], WorkspaceTagsService);
export { WorkspaceTagsService };
registerSingleton(IWorkspaceTagsService, WorkspaceTagsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVGFnc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YWdzL2VsZWN0cm9uLWJyb3dzZXIvd29ya3NwYWNlVGFnc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBOEIsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQThCLE1BQU0sb0RBQW9ELENBQUM7QUFDMUgsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixNQUFNLGdEQUFnRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxxQkFBcUIsRUFBUSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsb0JBQW9CLEVBQUUsNEJBQTRCLEVBQUUsMEJBQTBCLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6TixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFNUQsTUFBTSxvQkFBb0IsR0FBRztJQUM1QixpQkFBaUI7SUFDakIsUUFBUTtJQUNSLFdBQVc7SUFDWCxhQUFh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LElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUNuRSxPQUFPLENBQUMsRUFBRSxDQUFDLDBCQUEwQixDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsRUFDdkUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsZ0NBQWdDO2FBQzFDLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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