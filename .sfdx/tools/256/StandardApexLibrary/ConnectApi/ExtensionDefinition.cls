global class ExtensionDefinition {
	global Boolean canAccess;
	global Boolean canCreate;
	global Datetime createdDate;
	global String description;
	global String iconUrl;
	global String id;
	global List<ConnectApi.AbstractExtensionInformation> informationCollection;
	global Boolean isEnabledInCommunity;
	global Boolean isEnabledInLightningPublisher;
	global String name;
	global Integer position;
	global ExtensionDefinition() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}