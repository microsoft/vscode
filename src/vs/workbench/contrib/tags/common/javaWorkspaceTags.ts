/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const GradleDependencyLooseRegex = /group\s*:\s*[\'\"](.*?)[\'\"]\s*,\s*name\s*:\s*[\'\"](.*?)[\'\"]\s*,\s*version\s*:\s*[\'\"](.*?)[\'\"]/g;
export const GradleDependencyCompactRegex = /[\'\"]([^\'\"\s]*?)\:([^\'\"\s]*?)\:([^\'\"\s]*?)[\'\"]/g;

export const MavenDependenciesRegex = /<dependencies>([\s\S]*?)<\/dependencies>/g;
export const MavenDependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
export const MavenGroupIdRegex = /<groupId>([\s\S]*?)<\/groupId>/;
export const MavenArtifactIdRegex = /<artifactId>([\s\S]*?)<\/artifactId>/;

export const JavaLibrariesToLookFor: { predicate: (groupId: string, artifactId: string) => boolean; tag: string }[] = [
	// azure mgmt sdk
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.azure' && artifactId === 'azure', 'tag': 'azure' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.azure' && artifactId.startsWith('azure-mgmt-'), 'tag': 'azure' },
	{ 'predicate': (groupId, artifactId) => groupId.startsWith('com.microsoft.azure') && artifactId.startsWith('azure-mgmt-'), 'tag': 'azure' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.resourcemanager' && artifactId.startsWith('azure-resourcemanager'), 'tag': 'azure' }, // azure track2 sdk
	// java ee
	{ 'predicate': (groupId, artifactId) => groupId === 'javax' && artifactId === 'javaee-api', 'tag': 'javaee' },
	{ 'predicate': (groupId, artifactId) => groupId === 'javax.xml.bind' && artifactId === 'jaxb-api', 'tag': 'javaee' },
	// jdbc
	{ 'predicate': (groupId, artifactId) => groupId === 'mysql' && artifactId === 'mysql-connector-java', 'tag': 'jdbc' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.sqlserver' && artifactId === 'mssql-jdbc', 'tag': 'jdbc' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.oracle.database.jdbc' && artifactId.startsWith('ojdbc'), 'tag': 'jdbc' },
	// jpa
	{ 'predicate': (groupId, artifactId) => groupId === 'org.hibernate', 'tag': 'jpa' },
	{ 'predicate': (groupId, artifactId) => groupId === 'org.eclipse.persistence' && artifactId === 'eclipselink', 'tag': 'jpa' },
	// lombok
	{ 'predicate': (groupId, artifactId) => groupId === 'org.projectlombok', 'tag': 'lombok' },
	// redis
	{ 'predicate': (groupId, artifactId) => groupId === 'org.springframework.data' && artifactId === 'spring-data-redis', 'tag': 'redis' },
	{ 'predicate': (groupId, artifactId) => groupId === 'redis.clients' && artifactId === 'jedis', 'tag': 'redis' },
	{ 'predicate': (groupId, artifactId) => groupId === 'org.redisson', 'tag': 'redis' },
	{ 'predicate': (groupId, artifactId) => groupId === 'io.lettuce' && artifactId === 'lettuce-core', 'tag': 'redis' },
	// spring boot
	{ 'predicate': (groupId, artifactId) => groupId === 'org.springframework.boot', 'tag': 'springboot' },
	// sql
	{ 'predicate': (groupId, artifactId) => groupId === 'org.jooq', 'tag': 'sql' },
	{ 'predicate': (groupId, artifactId) => groupId === 'org.mybatis', 'tag': 'sql' },
	// unit test
	{ 'predicate': (groupId, artifactId) => groupId === 'org.junit.jupiter' && artifactId === 'junit-jupiter-api', 'tag': 'unitTest' },
	{ 'predicate': (groupId, artifactId) => groupId === 'junit' && artifactId === 'junit', 'tag': 'unitTest' },
	{ 'predicate': (groupId, artifactId) => groupId === 'org.testng' && artifactId === 'testng', 'tag': 'unitTest' },
	// cosmos
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId.includes('cosmos'), 'tag': 'azure-cosmos' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId.includes('cosmos'), 'tag': 'azure-cosmos' },
	// storage account
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId.includes('azure-storage'), 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId.includes('storage'), 'tag': 'azure-storage' },
	// service bus
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-messaging-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId.includes('servicebus'), 'tag': 'azure-servicebus' },
	// event hubs
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId.startsWith('azure-messaging-eventhubs'), 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId.includes('eventhubs'), 'tag': 'azure-eventhubs' },
	// ai related libraries
	{ 'predicate': (groupId, artifactId) => groupId === 'dev.langchain4j', 'tag': 'langchain4j' },
	{ 'predicate': (groupId, artifactId) => groupId === 'io.springboot.ai', 'tag': 'springboot-ai' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.semantic-kernel', 'tag': 'semantic-kernel' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-anomalydetector', 'tag': 'azure-ai-anomalydetector' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-formrecognizer', 'tag': 'azure-ai-formrecognizer' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-documentintelligence', 'tag': 'azure-ai-documentintelligence' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-translation-document', 'tag': 'azure-ai-translation-document' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-personalizer', 'tag': 'azure-ai-personalizer' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-translation-text', 'tag': 'azure-ai-translation-text' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-contentsafety', 'tag': 'azure-ai-contentsafety' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-vision-imageanalysis', 'tag': 'azure-ai-vision-imageanalysis' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-textanalytics', 'tag': 'azure-ai-textanalytics' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-search-documents', 'tag': 'azure-search-documents' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-documenttranslator', 'tag': 'azure-ai-documenttranslator' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-vision-face', 'tag': 'azure-ai-vision-face' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-openai-assistants', 'tag': 'azure-ai-openai-assistants' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.azure.cognitiveservices', 'tag': 'azure-cognitiveservices' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.cognitiveservices.speech', 'tag': 'azure-cognitiveservices-speech' },
	// open ai
	{ 'predicate': (groupId, artifactId) => groupId === 'com.theokanning.openai-gpt3-java', 'tag': 'openai' },
	// azure open ai
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-ai-openai', 'tag': 'azure-openai' },
	// Azure Functions
	{ 'predicate': (groupId, artifactId) => groupId === 'com.microsoft.azure.functions' && artifactId === 'azure-functions-java-library', 'tag': 'azure-functions' },
	// quarkus
	{ 'predicate': (groupId, artifactId) => groupId === 'io.quarkus', 'tag': 'quarkus' },
	// microprofile
	{ 'predicate': (groupId, artifactId) => groupId.startsWith('org.eclipse.microprofile'), 'tag': 'microprofile' },
	// micronaut
	{ 'predicate': (groupId, artifactId) => groupId === 'io.micronaut', 'tag': 'micronaut' },
	// GraalVM
	{ 'predicate': (groupId, artifactId) => groupId.startsWith('org.graalvm'), 'tag': 'graalvm' }
];
