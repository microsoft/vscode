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

export const JavaLibrariesToLookFor: { groupId: string, artifactId: string, tag: string }[] = [
	// azure
	{ 'groupId': 'com.microsoft.azure', 'artifactId': 'azure', 'tag': 'azure' },
	{ 'groupId': 'com.microsoft.azure', 'artifactId': 'azure-mgmt-.*', 'tag': 'azure' },
	{ 'groupId': 'com\\.microsoft\\.azure\\..*', 'artifactId': 'azure-mgmt-.*', 'tag': 'azure' },
	// java ee
	{ 'groupId': 'javax', 'artifactId': 'javaee-api', 'tag': 'javaee' },
	{ 'groupId': 'javax.xml.bind', 'artifactId': 'jaxb-api', 'tag': 'javaee' },
	// jdbc
	{ 'groupId': 'mysql', 'artifactId': 'mysql-connector-java', 'tag': 'jdbc' },
	{ 'groupId': 'com.microsoft.sqlserver', 'artifactId': 'mssql-jdbc', 'tag': 'jdbc' },
	{ 'groupId': 'com.oracle.database.jdbc', 'artifactId': 'ojdbc10', 'tag': 'jdbc' },
	// jpa
	{ 'groupId': 'org.hibernate', 'artifactId': 'hibernate-core', 'tag': 'jpa' },
	{ 'groupId': 'org.eclipse.persistence', 'artifactId': 'eclipselink', 'tag': 'jpa' },
	// lombok
	{ 'groupId': 'org.projectlombok', 'artifactId': 'lombok', 'tag': 'lombok' },
	// mockito
	{ 'groupId': 'org.mockito', 'artifactId': 'mockito-core', 'tag': 'mockito' },
	{ 'groupId': 'org.powermock', 'artifactId': 'powermock-core', 'tag': 'mockito' },
	// redis
	{ 'groupId': 'org.springframework.data', 'artifactId': 'spring-data-redis', 'tag': 'redis' },
	{ 'groupId': 'redis.clients', 'artifactId': 'jedis', 'tag': 'redis' },
	{ 'groupId': 'org.redisson', 'artifactId': 'redisson', 'tag': 'redis' },
	{ 'groupId': 'io.lettuce', 'artifactId': 'lettuce-core', 'tag': 'redis' },
	// spring boot
	{ 'groupId': 'org.springframework.boot', 'artifactId': '.*', 'tag': 'springboot' },
	// sql
	{ 'groupId': 'org.jooq', 'artifactId': 'jooq', 'tag': 'sql' },
	{ 'groupId': 'org.mybatis', 'artifactId': 'mybatis', 'tag': 'sql' },
	// unit test
	{ 'groupId': 'org.junit.jupiter', 'artifactId': 'junit-jupiter-api', 'tag': 'unitTest' },
	{ 'groupId': 'junit', 'artifactId': 'junit', 'tag': 'unitTest' },
	{ 'groupId': 'org.testng', 'artifactId': 'testng', 'tag': 'unitTest' }
];
