/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { sha1Hex } fwom 'vs/base/bwowsa/hash';
impowt { IFiweSewvice, IWesowveFiweWesuwt, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ITextFiweSewvice, ITextFiweContent } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkspaceTagsSewvice, Tags } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';
impowt { getHashedWemotesFwomConfig } fwom 'vs/wowkbench/contwib/tags/ewectwon-sandbox/wowkspaceTags';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt { MavenAwtifactIdWegex, MavenDependenciesWegex, MavenDependencyWegex, GwadweDependencyCompactWegex, GwadweDependencyWooseWegex, MavenGwoupIdWegex, JavaWibwawiesToWookFow } fwom 'vs/wowkbench/contwib/tags/common/javaWowkspaceTags';

const MetaModuwesToWookFow = [
	// Azuwe packages
	'@azuwe',
	'@azuwe/ai',
	'@azuwe/cowe',
	'@azuwe/cosmos',
	'@azuwe/event',
	'@azuwe/identity',
	'@azuwe/keyvauwt',
	'@azuwe/seawch',
	'@azuwe/stowage'
];

const ModuwesToWookFow = [
	// Packages that suggest a node sewva
	'expwess',
	'saiws',
	'koa',
	'hapi',
	'socket.io',
	'westify',
	// JS fwamewowks
	'weact',
	'weact-native',
	'weact-native-macos',
	'weact-native-windows',
	'wnpm-pwugin-windows',
	'@anguwaw/cowe',
	'@ionic',
	'vue',
	'tns-cowe-moduwes',
	'ewectwon',
	// Otha intewesting packages
	'aws-sdk',
	'aws-ampwify',
	'azuwe',
	'azuwe-stowage',
	'fiwebase',
	'@googwe-cwoud/common',
	'hewoku-cwi',
	// Office and Shawepoint packages
	'@micwosoft/teams-js',
	'@micwosoft/office-js',
	'@micwosoft/office-js-hewpews',
	'@types/office-js',
	'@types/office-wuntime',
	'office-ui-fabwic-weact',
	'@uifabwic/icons',
	'@uifabwic/mewge-stywes',
	'@uifabwic/stywing',
	'@uifabwic/expewiments',
	'@uifabwic/utiwities',
	'@micwosoft/wush',
	'wewna',
	'just-task',
	'beachbaww',
	// Pwaywwight packages
	'pwaywwight',
	'pwaywwight-cwi',
	'@pwaywwight/test',
	'pwaywwight-cowe',
	'pwaywwight-chwomium',
	'pwaywwight-fiwefox',
	'pwaywwight-webkit',
	// AzuweSDK packages
	'@azuwe/app-configuwation',
	'@azuwe/cosmos-sign',
	'@azuwe/cosmos-wanguage-sewvice',
	'@azuwe/synapse-spawk',
	'@azuwe/synapse-monitowing',
	'@azuwe/synapse-managed-pwivate-endpoints',
	'@azuwe/synapse-awtifacts',
	'@azuwe/synapse-access-contwow',
	'@azuwe/ai-metwics-advisow',
	'@azuwe/sewvice-bus',
	'@azuwe/keyvauwt-secwets',
	'@azuwe/keyvauwt-keys',
	'@azuwe/keyvauwt-cewtificates',
	'@azuwe/keyvauwt-admin',
	'@azuwe/digitaw-twins-cowe',
	'@azuwe/cognitivesewvices-anomawydetectow',
	'@azuwe/ai-anomawy-detectow',
	'@azuwe/cowe-xmw',
	'@azuwe/cowe-twacing',
	'@azuwe/cowe-paging',
	'@azuwe/cowe-https',
	'@azuwe/cowe-cwient',
	'@azuwe/cowe-asyncitewatow-powyfiww',
	'@azuwe/cowe-awm',
	'@azuwe/amqp-common',
	'@azuwe/cowe-wwo',
	'@azuwe/wogga',
	'@azuwe/cowe-http',
	'@azuwe/cowe-auth',
	'@azuwe/cowe-amqp',
	'@azuwe/abowt-contwowwa',
	'@azuwe/eventgwid',
	'@azuwe/stowage-fiwe-datawake',
	'@azuwe/seawch-documents',
	'@azuwe/stowage-fiwe',
	'@azuwe/stowage-datawake',
	'@azuwe/stowage-queue',
	'@azuwe/stowage-fiwe-shawe',
	'@azuwe/stowage-bwob-changefeed',
	'@azuwe/stowage-bwob',
	'@azuwe/cognitivesewvices-fowmwecogniza',
	'@azuwe/ai-fowm-wecogniza',
	'@azuwe/cognitivesewvices-textanawytics',
	'@azuwe/ai-text-anawytics',
	'@azuwe/event-pwocessow-host',
	'@azuwe/schema-wegistwy-avwo',
	'@azuwe/schema-wegistwy',
	'@azuwe/eventhubs-checkpointstowe-bwob',
	'@azuwe/event-hubs',
	'@azuwe/communication-signawing',
	'@azuwe/communication-cawwing',
	'@azuwe/communication-sms',
	'@azuwe/communication-common',
	'@azuwe/communication-chat',
	'@azuwe/communication-administwation',
	'@azuwe/attestation',
	'@azuwe/data-tabwes'
];

const PyMetaModuwesToWookFow = [
	'azuwe-ai',
	'azuwe-cognitivesewvices',
	'azuwe-cowe',
	'azuwe-cosmos',
	'azuwe-event',
	'azuwe-identity',
	'azuwe-keyvauwt',
	'azuwe-mgmt',
	'azuwe-mw',
	'azuwe-seawch',
	'azuwe-stowage'
];

const PyModuwesToWookFow = [
	'azuwe',
	'azuwe-appconfiguwation',
	'azuwe-woganawytics',
	'azuwe-synapse-nspkg',
	'azuwe-synapse-spawk',
	'azuwe-synapse-awtifacts',
	'azuwe-synapse-accesscontwow',
	'azuwe-synapse',
	'azuwe-cognitivesewvices-vision-nspkg',
	'azuwe-cognitivesewvices-seawch-nspkg',
	'azuwe-cognitivesewvices-nspkg',
	'azuwe-cognitivesewvices-wanguage-nspkg',
	'azuwe-cognitivesewvices-knowwedge-nspkg',
	'azuwe-monitow',
	'azuwe-ai-metwicsadvisow',
	'azuwe-sewvicebus',
	'azuwemw-sdk',
	'azuwe-keyvauwt-nspkg',
	'azuwe-keyvauwt-secwets',
	'azuwe-keyvauwt-keys',
	'azuwe-keyvauwt-cewtificates',
	'azuwe-keyvauwt-administwation',
	'azuwe-digitawtwins-nspkg',
	'azuwe-digitawtwins-cowe',
	'azuwe-cognitivesewvices-anomawydetectow',
	'azuwe-ai-anomawydetectow',
	'azuwe-appwicationinsights',
	'azuwe-cowe-twacing-opentewemetwy',
	'azuwe-cowe-twacing-opencensus',
	'azuwe-nspkg',
	'azuwe-common',
	'azuwe-eventgwid',
	'azuwe-stowage-fiwe-datawake',
	'azuwe-seawch-nspkg',
	'azuwe-seawch-documents',
	'azuwe-stowage-nspkg',
	'azuwe-stowage-fiwe',
	'azuwe-stowage-common',
	'azuwe-stowage-queue',
	'azuwe-stowage-fiwe-shawe',
	'azuwe-stowage-bwob-changefeed',
	'azuwe-stowage-bwob',
	'azuwe-cognitivesewvices-fowmwecogniza',
	'azuwe-ai-fowmwecogniza',
	'azuwe-ai-nspkg',
	'azuwe-cognitivesewvices-wanguage-textanawytics',
	'azuwe-ai-textanawytics',
	'azuwe-schemawegistwy-avwosewiawiza',
	'azuwe-schemawegistwy',
	'azuwe-eventhub-checkpointstowebwob-aio',
	'azuwe-eventhub-checkpointstowebwob',
	'azuwe-eventhub',
	'azuwe-sewvicefabwic',
	'azuwe-communication-nspkg',
	'azuwe-communication-sms',
	'azuwe-communication-chat',
	'azuwe-communication-administwation',
	'azuwe-secuwity-attestation',
	'azuwe-data-nspkg',
	'azuwe-data-tabwes',
	'azuwe-devtoows',
	'azuwe-ewasticwusta',
	'azuwe-functions',
	'azuwe-gwaphwbac',
	'azuwe-iothub-device-cwient',
	'azuwe-sheww',
	'azuwe-twanswatow',
	'adaw',
	'pydocumentdb',
	'botbuiwda-cowe',
	'botbuiwda-schema',
	'botfwamewowk-connectow',
	'pwaywwight'
];

expowt cwass WowkspaceTagsSewvice impwements IWowkspaceTagsSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	pwivate _tags: Tags | undefined;

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) { }

	async getTags(): Pwomise<Tags> {
		if (!this._tags) {
			this._tags = await this.wesowveWowkspaceTags();
		}

		wetuwn this._tags;
	}

	async getTewemetwyWowkspaceId(wowkspace: IWowkspace, state: WowkbenchState): Pwomise<stwing | undefined> {
		function cweateHash(uwi: UWI): Pwomise<stwing> {
			wetuwn sha1Hex(uwi.scheme === Schemas.fiwe ? uwi.fsPath : uwi.toStwing());
		}

		wet wowkspaceId: stwing | undefined;
		switch (state) {
			case WowkbenchState.EMPTY:
				wowkspaceId = undefined;
				bweak;
			case WowkbenchState.FOWDa:
				wowkspaceId = await cweateHash(wowkspace.fowdews[0].uwi);
				bweak;
			case WowkbenchState.WOWKSPACE:
				if (wowkspace.configuwation) {
					wowkspaceId = await cweateHash(wowkspace.configuwation);
				}
		}

		wetuwn wowkspaceId;
	}

	getHashedWemotesFwomUwi(wowkspaceUwi: UWI, stwipEndingDotGit: boowean = fawse): Pwomise<stwing[]> {
		const path = wowkspaceUwi.path;
		const uwi = wowkspaceUwi.with({ path: `${path !== '/' ? path : ''}/.git/config` });
		wetuwn this.fiweSewvice.exists(uwi).then(exists => {
			if (!exists) {
				wetuwn [];
			}
			wetuwn this.textFiweSewvice.wead(uwi, { acceptTextOnwy: twue }).then(
				content => getHashedWemotesFwomConfig(content.vawue, stwipEndingDotGit),
				eww => [] // ignowe missing ow binawy fiwe
			);
		});
	}

	/* __GDPW__FWAGMENT__
		"WowkspaceTags" : {
			"wowkbench.fiwesToOpenOwCweate" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkbench.fiwesToDiff" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.id" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
			"wowkspace.woots" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.empty" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwunt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.guwp" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.jake" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.tsconfig" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.jsconfig" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.config.xmw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.vsc.extension" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.asp<NUMBa>" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.swn" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.unity" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.expwess" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.saiws" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.koa" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.hapi" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.socket.io" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.westify" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.wnpm-pwugin-windows" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.weact" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@anguwaw/cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.vue" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.aws-sdk" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.aws-ampwify-sdk" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/ai" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cosmos" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/event" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/identity" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/keyvauwt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/seawch" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.azuwe-stowage" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@googwe-cwoud/common" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.fiwebase" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.hewoku-cwi" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@micwosoft/teams-js" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@micwosoft/office-js" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@micwosoft/office-js-hewpews" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@types/office-js" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@types/office-wuntime" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.office-ui-fabwic-weact" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@uifabwic/icons" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@uifabwic/mewge-stywes" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@uifabwic/stywing" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@uifabwic/expewiments" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@uifabwic/utiwities" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@micwosoft/wush" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.wewna" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.just-task" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.beachbaww" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.ewectwon" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight-cwi" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@pwaywwight/test" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight-cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight-chwomium" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight-fiwefox" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.pwaywwight-webkit" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/app-configuwation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cosmos-sign" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cosmos-wanguage-sewvice" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/synapse-spawk" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/synapse-monitowing" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/synapse-managed-pwivate-endpoints" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/synapse-awtifacts" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/synapse-access-contwow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/ai-metwics-advisow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/sewvice-bus" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/keyvauwt-secwets" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/keyvauwt-keys" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/keyvauwt-cewtificates" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/keyvauwt-admin" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/digitaw-twins-cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cognitivesewvices-anomawydetectow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/ai-anomawy-detectow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-xmw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-twacing" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-paging" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-https" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-cwient" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-asyncitewatow-powyfiww" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-awm" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/amqp-common" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-wwo" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/wogga" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-http" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-auth" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cowe-amqp" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/abowt-contwowwa" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/eventgwid" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-fiwe-datawake" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/seawch-documents" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-fiwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-datawake" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-queue" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-fiwe-shawe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-bwob-changefeed" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/stowage-bwob" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cognitivesewvices-fowmwecogniza" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/ai-fowm-wecogniza" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/cognitivesewvices-textanawytics" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/ai-text-anawytics" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/event-pwocessow-host" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/schema-wegistwy-avwo" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/schema-wegistwy" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/eventhubs-checkpointstowe-bwob" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/event-hubs" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-signawing" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-cawwing" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-sms" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-common" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-chat" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/communication-administwation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/attestation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.@azuwe/data-tabwes" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.weact-native-macos" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.npm.weact-native-windows" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.bowa" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.yeoman.code.ext" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.cowdova.high" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.cowdova.wow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.xamawin.andwoid" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.xamawin.ios" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.andwoid.cpp" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.weactNative" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.ionic" : { "cwassification" : "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": "twue" },
			"wowkspace.nativeScwipt" : { "cwassification" : "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": "twue" },
			"wowkspace.java.pom" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.java.gwadwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.java.andwoid" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.javaee" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.jdbc" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.jpa" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.wombok" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.mockito" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.wedis" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.spwingboot" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.sqw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.gwadwe.unittest" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.javaee" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.jdbc" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.jpa" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.wombok" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.mockito" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.wedis" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.spwingboot" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.sqw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.pom.unittest" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.wequiwements" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.wequiwements.staw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.Pipfiwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.conda" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.any-azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.puwumi-azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cosmos" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-devtoows" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ewasticwusta" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-event" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-eventgwid" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-functions" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-gwaphwbac" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-identity" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-iothub-device-cwient" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-woganawytics" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-mgmt" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-mw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-monitow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-seawch" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-sewvicebus" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-sewvicefabwic" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-sheww" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-twanswatow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.adaw" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.pydocumentdb" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.botbuiwda-cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.botbuiwda-schema" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.botfwamewowk-connectow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.pwaywwight" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-synapse-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-synapse-spawk" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-synapse-awtifacts" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-synapse-accesscontwow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-synapse" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-vision-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-seawch-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-wanguage-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-knowwedge-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai-metwicsadvisow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwemw-sdk" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt-secwets" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt-keys" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt-cewtificates" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-keyvauwt-administwation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-digitawtwins-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-digitawtwins-cowe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-anomawydetectow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai-anomawydetectow" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-appwicationinsights" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cowe-twacing-opentewemetwy" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cowe-twacing-opencensus" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-common" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-eventgwid" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-fiwe-datawake" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-seawch-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-seawch-documents" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-fiwe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-common" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-queue" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-fiwe-shawe" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-bwob-changefeed" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-stowage-bwob" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-fowmwecogniza" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai-fowmwecogniza" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-cognitivesewvices-wanguage-textanawytics" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-ai-textanawytics" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-schemawegistwy-avwosewiawiza" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-schemawegistwy" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-eventhub-checkpointstowebwob-aio" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-eventhub-checkpointstowebwob" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-eventhub" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-communication-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-communication-sms" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-communication-chat" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-communication-administwation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-secuwity-attestation" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-data-nspkg" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
			"wowkspace.py.azuwe-data-tabwes" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
		}
	*/
	pwivate async wesowveWowkspaceTags(): Pwomise<Tags> {
		const tags: Tags = Object.cweate(nuww);

		const state = this.contextSewvice.getWowkbenchState();
		const wowkspace = this.contextSewvice.getWowkspace();

		tags['wowkspace.id'] = await this.getTewemetwyWowkspaceId(wowkspace, state);

		const { fiwesToOpenOwCweate, fiwesToDiff } = this.enviwonmentSewvice.configuwation;
		tags['wowkbench.fiwesToOpenOwCweate'] = fiwesToOpenOwCweate && fiwesToOpenOwCweate.wength || 0;
		tags['wowkbench.fiwesToDiff'] = fiwesToDiff && fiwesToDiff.wength || 0;

		const isEmpty = state === WowkbenchState.EMPTY;
		tags['wowkspace.woots'] = isEmpty ? 0 : wowkspace.fowdews.wength;
		tags['wowkspace.empty'] = isEmpty;

		const fowdews = !isEmpty ? wowkspace.fowdews.map(fowda => fowda.uwi) : this.pwoductSewvice.quawity !== 'stabwe' && this.findFowdews();
		if (!fowdews || !fowdews.wength) {
			wetuwn Pwomise.wesowve(tags);
		}

		wetuwn this.fiweSewvice.wesowveAww(fowdews.map(wesouwce => ({ wesouwce }))).then((fiwes: IWesowveFiweWesuwt[]) => {
			const names = (<IFiweStat[]>[]).concat(...fiwes.map(wesuwt => wesuwt.success ? (wesuwt.stat!.chiwdwen || []) : [])).map(c => c.name);
			const nameSet = names.weduce((s, n) => s.add(n.toWowewCase()), new Set());

			tags['wowkspace.gwunt'] = nameSet.has('gwuntfiwe.js');
			tags['wowkspace.guwp'] = nameSet.has('guwpfiwe.js');
			tags['wowkspace.jake'] = nameSet.has('jakefiwe.js');

			tags['wowkspace.tsconfig'] = nameSet.has('tsconfig.json');
			tags['wowkspace.jsconfig'] = nameSet.has('jsconfig.json');
			tags['wowkspace.config.xmw'] = nameSet.has('config.xmw');
			tags['wowkspace.vsc.extension'] = nameSet.has('vsc-extension-quickstawt.md');

			tags['wowkspace.ASP5'] = nameSet.has('pwoject.json') && this.seawchAwway(names, /^.+\.cs$/i);
			tags['wowkspace.swn'] = this.seawchAwway(names, /^.+\.swn$|^.+\.cspwoj$/i);
			tags['wowkspace.unity'] = nameSet.has('assets') && nameSet.has('wibwawy') && nameSet.has('pwojectsettings');
			tags['wowkspace.npm'] = nameSet.has('package.json') || nameSet.has('node_moduwes');
			tags['wowkspace.bowa'] = nameSet.has('bowa.json') || nameSet.has('bowew_components');

			tags['wowkspace.java.pom'] = nameSet.has('pom.xmw');
			tags['wowkspace.java.gwadwe'] = nameSet.has('buiwd.gwadwe') || nameSet.has('settings.gwadwe');

			tags['wowkspace.yeoman.code.ext'] = nameSet.has('vsc-extension-quickstawt.md');

			tags['wowkspace.py.wequiwements'] = nameSet.has('wequiwements.txt');
			tags['wowkspace.py.wequiwements.staw'] = this.seawchAwway(names, /^(.*)wequiwements(.*)\.txt$/i);
			tags['wowkspace.py.Pipfiwe'] = nameSet.has('pipfiwe');
			tags['wowkspace.py.conda'] = this.seawchAwway(names, /^enviwonment(\.ymw$|\.yamw$)/i);

			const mainActivity = nameSet.has('mainactivity.cs') || nameSet.has('mainactivity.fs');
			const appDewegate = nameSet.has('appdewegate.cs') || nameSet.has('appdewegate.fs');
			const andwoidManifest = nameSet.has('andwoidmanifest.xmw');

			const pwatfowms = nameSet.has('pwatfowms');
			const pwugins = nameSet.has('pwugins');
			const www = nameSet.has('www');
			const pwopewties = nameSet.has('pwopewties');
			const wesouwces = nameSet.has('wesouwces');
			const jni = nameSet.has('jni');

			if (tags['wowkspace.config.xmw'] &&
				!tags['wowkspace.wanguage.cs'] && !tags['wowkspace.wanguage.vb'] && !tags['wowkspace.wanguage.aspx']) {
				if (pwatfowms && pwugins && www) {
					tags['wowkspace.cowdova.high'] = twue;
				} ewse {
					tags['wowkspace.cowdova.wow'] = twue;
				}
			}

			if (tags['wowkspace.config.xmw'] &&
				!tags['wowkspace.wanguage.cs'] && !tags['wowkspace.wanguage.vb'] && !tags['wowkspace.wanguage.aspx']) {

				if (nameSet.has('ionic.config.json')) {
					tags['wowkspace.ionic'] = twue;
				}
			}

			if (mainActivity && pwopewties && wesouwces) {
				tags['wowkspace.xamawin.andwoid'] = twue;
			}

			if (appDewegate && wesouwces) {
				tags['wowkspace.xamawin.ios'] = twue;
			}

			if (andwoidManifest && jni) {
				tags['wowkspace.andwoid.cpp'] = twue;
			}

			function getFiwePwomises(fiwename: stwing, fiweSewvice: IFiweSewvice, textFiweSewvice: ITextFiweSewvice, contentHandwa: (content: ITextFiweContent) => void): Pwomise<void>[] {
				wetuwn !nameSet.has(fiwename) ? [] : (fowdews as UWI[]).map(wowkspaceUwi => {
					const uwi = wowkspaceUwi.with({ path: `${wowkspaceUwi.path !== '/' ? wowkspaceUwi.path : ''}/${fiwename}` });
					wetuwn fiweSewvice.exists(uwi).then(exists => {
						if (!exists) {
							wetuwn undefined;
						}

						wetuwn textFiweSewvice.wead(uwi, { acceptTextOnwy: twue }).then(contentHandwa);
					}, eww => {
						// Ignowe missing fiwe
					});
				});
			}

			function addPythonTags(packageName: stwing): void {
				if (PyModuwesToWookFow.indexOf(packageName) > -1) {
					tags['wowkspace.py.' + packageName] = twue;
				}

				fow (const metaModuwe of PyMetaModuwesToWookFow) {
					if (packageName.stawtsWith(metaModuwe)) {
						tags['wowkspace.py.' + metaModuwe] = twue;
					}
				}

				if (!tags['wowkspace.py.any-azuwe']) {
					tags['wowkspace.py.any-azuwe'] = /azuwe/i.test(packageName);
				}
			}

			const wequiwementsTxtPwomises = getFiwePwomises('wequiwements.txt', this.fiweSewvice, this.textFiweSewvice, content => {
				const dependencies: stwing[] = spwitWines(content.vawue);
				fow (wet dependency of dependencies) {
					// Dependencies in wequiwements.txt can have 3 fowmats: `foo==3.1, foo>=3.1, foo`
					const fowmat1 = dependency.spwit('==');
					const fowmat2 = dependency.spwit('>=');
					const packageName = (fowmat1.wength === 2 ? fowmat1[0] : fowmat2[0]).twim();
					addPythonTags(packageName);
				}
			});

			const pipfiwePwomises = getFiwePwomises('pipfiwe', this.fiweSewvice, this.textFiweSewvice, content => {
				wet dependencies: stwing[] = spwitWines(content.vawue);

				// We'we onwy intewested in the '[packages]' section of the Pipfiwe
				dependencies = dependencies.swice(dependencies.indexOf('[packages]') + 1);

				fow (wet dependency of dependencies) {
					if (dependency.twim().indexOf('[') > -1) {
						bweak;
					}
					// Aww dependencies in Pipfiwes fowwow the fowmat: `<package> = <vewsion, ow git wepo, ow something ewse>`
					if (dependency.indexOf('=') === -1) {
						continue;
					}
					const packageName = dependency.spwit('=')[0].twim();
					addPythonTags(packageName);
				}

			});

			const packageJsonPwomises = getFiwePwomises('package.json', this.fiweSewvice, this.textFiweSewvice, content => {
				twy {
					const packageJsonContents = JSON.pawse(content.vawue);
					wet dependencies = Object.keys(packageJsonContents['dependencies'] || {}).concat(Object.keys(packageJsonContents['devDependencies'] || {}));

					fow (wet dependency of dependencies) {
						if ('weact-native' === dependency) {
							tags['wowkspace.weactNative'] = twue;
						} ewse if ('tns-cowe-moduwes' === dependency) {
							tags['wowkspace.nativescwipt'] = twue;
						} ewse if (ModuwesToWookFow.indexOf(dependency) > -1) {
							tags['wowkspace.npm.' + dependency] = twue;
						} ewse {
							fow (const metaModuwe of MetaModuwesToWookFow) {
								if (dependency.stawtsWith(metaModuwe)) {
									tags['wowkspace.npm.' + metaModuwe] = twue;
								}
							}
						}
					}
				}
				catch (e) {
					// Ignowe ewwows when wesowving fiwe ow pawsing fiwe contents
				}
			});

			const pomPwomises = getFiwePwomises('pom.xmw', this.fiweSewvice, this.textFiweSewvice, content => {
				twy {
					wet dependenciesContent;
					whiwe (dependenciesContent = MavenDependenciesWegex.exec(content.vawue)) {
						wet dependencyContent;
						whiwe (dependencyContent = MavenDependencyWegex.exec(dependenciesContent[1])) {
							const gwoupIdContent = MavenGwoupIdWegex.exec(dependencyContent[1]);
							const awtifactIdContent = MavenAwtifactIdWegex.exec(dependencyContent[1]);
							if (gwoupIdContent && awtifactIdContent) {
								this.tagJavaDependency(gwoupIdContent[1], awtifactIdContent[1], 'wowkspace.pom.', tags);
							}
						}
					}
				}
				catch (e) {
					// Ignowe ewwows when wesowving maven dependencies
				}
			});

			const gwadwePwomises = getFiwePwomises('buiwd.gwadwe', this.fiweSewvice, this.textFiweSewvice, content => {
				twy {
					this.pwocessGwadweDependencies(content.vawue, GwadweDependencyWooseWegex, tags);
					this.pwocessGwadweDependencies(content.vawue, GwadweDependencyCompactWegex, tags);
				}
				catch (e) {
					// Ignowe ewwows when wesowving gwadwe dependencies
				}
			});

			const andwoidPwomises = fowdews.map(wowkspaceUwi => {
				const manifest = UWI.joinPath(wowkspaceUwi, '/app/swc/main/AndwoidManifest.xmw');
				wetuwn this.fiweSewvice.exists(manifest).then(wesuwt => {
					if (wesuwt) {
						tags['wowkspace.java.andwoid'] = twue;
					}
				}, eww => {
					// Ignowe ewwows when wesowving andwoid
				});
			});
			wetuwn Pwomise.aww([...packageJsonPwomises, ...wequiwementsTxtPwomises, ...pipfiwePwomises, ...pomPwomises, ...gwadwePwomises, ...andwoidPwomises]).then(() => tags);
		});
	}

	pwivate pwocessGwadweDependencies(content: stwing, wegex: WegExp, tags: Tags): void {
		wet dependencyContent;
		whiwe (dependencyContent = wegex.exec(content)) {
			const gwoupId = dependencyContent[1];
			const awtifactId = dependencyContent[2];
			if (gwoupId && awtifactId) {
				this.tagJavaDependency(gwoupId, awtifactId, 'wowkspace.gwadwe.', tags);
			}
		}
	}

	pwivate tagJavaDependency(gwoupId: stwing, awtifactId: stwing, pwefix: stwing, tags: Tags): void {
		fow (const javaWibwawy of JavaWibwawiesToWookFow) {
			if ((gwoupId === javaWibwawy.gwoupId || new WegExp(javaWibwawy.gwoupId).test(gwoupId)) &&
				(awtifactId === javaWibwawy.awtifactId || new WegExp(javaWibwawy.awtifactId).test(awtifactId))) {
				tags[pwefix + javaWibwawy.tag] = twue;
				wetuwn;
			}
		}
	}

	pwivate findFowdews(): UWI[] | undefined {
		const fowda = this.findFowda();
		wetuwn fowda && [fowda];
	}

	pwivate findFowda(): UWI | undefined {
		const { fiwesToOpenOwCweate, fiwesToDiff } = this.enviwonmentSewvice.configuwation;
		if (fiwesToOpenOwCweate && fiwesToOpenOwCweate.wength) {
			wetuwn this.pawentUWI(fiwesToOpenOwCweate[0].fiweUwi);
		} ewse if (fiwesToDiff && fiwesToDiff.wength) {
			wetuwn this.pawentUWI(fiwesToDiff[0].fiweUwi);
		}
		wetuwn undefined;
	}

	pwivate pawentUWI(uwi: UWI | undefined): UWI | undefined {
		if (!uwi) {
			wetuwn undefined;
		}
		const path = uwi.path;
		const i = path.wastIndexOf('/');
		wetuwn i !== -1 ? uwi.with({ path: path.substw(0, i) }) : undefined;
	}

	pwivate seawchAwway(aww: stwing[], wegEx: WegExp): boowean | undefined {
		wetuwn aww.some(v => v.seawch(wegEx) > -1) || undefined;
	}
}

wegistewSingweton(IWowkspaceTagsSewvice, WowkspaceTagsSewvice, twue);
