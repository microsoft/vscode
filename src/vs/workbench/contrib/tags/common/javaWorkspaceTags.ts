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
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId.startsWith('azure-resourcemanager'), 'tag': 'azure' }, // azure track2 sdk
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
	// mockito
	{ 'predicate': (groupId, artifactId) => groupId === 'org.mockito', 'tag': 'mockito' },
	{ 'predicate': (groupId, artifactId) => groupId === 'org.powermock', 'tag': 'mockito' },
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
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-data-cosmos', 'tag': 'azure-cosmos' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-cosmos', 'tag': 'azure-cosmos' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-cosmos', 'tag': 'azure-cosmos' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'zure-cosmos-test', 'tag': 'azure-cosmos' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-spring-data-cosmos-core', 'tag': 'azure-cosmos' },
	// storage account
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-storage', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-blob', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-file-share', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-queue', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-blob-batch', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-blob-changefeed', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-blob-cryptography', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-blob-nio', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-file-datalake', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-storage-internal-avro', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-storage-blob', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-storage-file-share', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-storage-queue', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-integration-storage-queue', 'tag': 'azure-storage' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-integration-azure-storage-queue', 'tag': 'azure-storage' },
	// service bus
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-messaging-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-integration-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-integration-azure-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-stream-binder-servicebus', 'tag': 'azure-servicebus' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-servicebus-jms', 'tag': 'azure-servicebus' },
	// event hubs
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-messaging-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure' && artifactId === 'azure-messaging-eventhubs-parent', 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-starter-integration-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-integration-azure-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.azure.spring' && artifactId === 'spring-cloud-azure-stream-binder-eventhubs', 'tag': 'azure-eventhubs' },
	// open ai
	{ 'predicate': (groupId, artifactId) => groupId === 'com.theokanning.openai-gpt3-java' && artifactId === 'api', 'tag': 'openai' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.theokanning.openai-gpt3-java' && artifactId === 'client', 'tag': 'openai' },
	{ 'predicate': (groupId, artifactId) => groupId === 'com.theokanning.openai-gpt3-java' && artifactId === 'service', 'tag': 'openai' },
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
