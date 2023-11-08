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

export const JavaLibrariesToLookFor: { groupId: string; artifactId: string; tag: string }[] = [
	// azure mgmt sdk
	{ 'groupId': 'com.microsoft.azure', 'artifactId': 'azure', 'tag': 'azure' },
	{ 'groupId': 'com.microsoft.azure', 'artifactId': 'azure-mgmt-.*', 'tag': 'azure' },
	{ 'groupId': 'com\\.microsoft\\.azure\\..*', 'artifactId': 'azure-mgmt-.*', 'tag': 'azure' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-resourcemanager.*', 'tag': 'azure' }, // azure track2 sdk
	// java ee
	{ 'groupId': 'javax', 'artifactId': 'javaee-api', 'tag': 'javaee' },
	{ 'groupId': 'javax.xml.bind', 'artifactId': 'jaxb-api', 'tag': 'javaee' },
	// jdbc
	{ 'groupId': 'mysql', 'artifactId': 'mysql-connector-java', 'tag': 'jdbc' },
	{ 'groupId': 'com.microsoft.sqlserver', 'artifactId': 'mssql-jdbc', 'tag': 'jdbc' },
	{ 'groupId': 'com.oracle.database.jdbc', 'artifactId': 'ojdbc.*', 'tag': 'jdbc' },
	// jpa
	{ 'groupId': 'org.hibernate', 'artifactId': '.*', 'tag': 'jpa' },
	{ 'groupId': 'org.eclipse.persistence', 'artifactId': 'eclipselink', 'tag': 'jpa' },
	// lombok
	{ 'groupId': 'org.projectlombok', 'artifactId': '.*', 'tag': 'lombok' },
	// mockito
	{ 'groupId': 'org.mockito', 'artifactId': '.*', 'tag': 'mockito' },
	{ 'groupId': 'org.powermock', 'artifactId': '.*', 'tag': 'mockito' },
	// redis
	{ 'groupId': 'org.springframework.data', 'artifactId': 'spring-data-redis', 'tag': 'redis' },
	{ 'groupId': 'redis.clients', 'artifactId': 'jedis', 'tag': 'redis' },
	{ 'groupId': 'org.redisson', 'artifactId': '.*', 'tag': 'redis' },
	{ 'groupId': 'io.lettuce', 'artifactId': 'lettuce-core', 'tag': 'redis' },
	// spring boot
	{ 'groupId': 'org.springframework.boot', 'artifactId': '.*', 'tag': 'springboot' },
	// sql
	{ 'groupId': 'org.jooq', 'artifactId': '.*', 'tag': 'sql' },
	{ 'groupId': 'org.mybatis', 'artifactId': '.*', 'tag': 'sql' },
	// unit test
	{ 'groupId': 'org.junit.jupiter', 'artifactId': 'junit-jupiter-api', 'tag': 'unitTest' },
	{ 'groupId': 'junit', 'artifactId': 'junit', 'tag': 'unitTest' },
	{ 'groupId': 'org.testng', 'artifactId': 'testng', 'tag': 'unitTest' },
	// cosmos
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-data-cosmos', 'tag': 'azure-cosmos' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-cosmos', 'tag': 'azure-cosmos' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-cosmos', 'tag': 'azure-cosmos' },
	{ 'groupId': 'com.azure', 'artifactId': 'zure-cosmos-test', 'tag': 'azure-cosmos' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-spring-data-cosmos-core', 'tag': 'azure-cosmos' },
	// storage account
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-storage', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-blob', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-file-share', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-queue', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-blob-batch', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-blob-changefeed', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-blob-cryptography', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-blob-nio', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-file-datalake', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-storage-internal-avro', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-storage-blob', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-storage-file-share', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-storage-queue', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-integration-storage-queue', 'tag': 'azure-storage' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-integration-azure-storage-queue', 'tag': 'azure-storage' },
	// service bus
	{ 'groupId': 'com.azure', 'artifactId': 'azure-messaging-servicebus', 'tag': 'azure-servicebus' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-servicebus', 'tag': 'azure-servicebus' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-integration-servicebus', 'tag': 'azure-servicebus' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-integration-azure-servicebus', 'tag': 'azure-servicebus' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-stream-binder-servicebus', 'tag': 'azure-servicebus' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-servicebus-jms', 'tag': 'azure-servicebus' },
	// event hubs
	{ 'groupId': 'com.azure', 'artifactId': 'azure-messaging-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'groupId': 'com.azure', 'artifactId': 'azure-messaging-eventhubs-parent', 'tag': 'azure-eventhubs' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-starter-integration-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-integration-azure-eventhubs', 'tag': 'azure-eventhubs' },
	{ 'groupId': 'com.azure.spring', 'artifactId': 'spring-cloud-azure-stream-binder-eventhubs', 'tag': 'azure-eventhubs' },
	// open ai
	{ 'groupId': 'com.theokanning.openai-gpt3-java', 'artifactId': 'api', 'tag': 'openai' },
	{ 'groupId': 'com.theokanning.openai-gpt3-java', 'artifactId': 'client', 'tag': 'openai' },
	{ 'groupId': 'com.theokanning.openai-gpt3-java', 'artifactId': 'service', 'tag': 'openai' },
	// azure open ai
	{ 'groupId': 'com.azure', 'artifactId': 'azure-ai-openai', 'tag': 'azure-openai' },
	// Azure Functions
	{ 'groupId': 'com.microsoft.azure.functions', 'artifactId': 'azure-functions-java-library', 'tag': 'azure-functions' },
	// quarkus
	{ 'groupId': 'io.quarkus', 'artifactId': '.*', 'tag': 'quarkus' },
	// microprofile
	{ 'groupId': 'org\\.eclipse\\.microprofile.*', 'artifactId': '.*', 'tag': 'microprofile' },
	// micronaut
	{ 'groupId': 'io.micronaut', 'artifactId': '.*', 'tag': 'micronaut' },
	// GraalVM
	{ 'groupId': 'org\\.graalvm.*', 'artifactId': '.*', 'tag': 'graalvm' }
];
