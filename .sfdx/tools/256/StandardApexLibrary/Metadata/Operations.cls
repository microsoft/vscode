global class Operations {
	global Operations() { }
	global Object clone() { }
	global static Id enqueueDeployment(Metadata.DeployContainer container, Metadata.DeployCallback callback) { }
	global static List<Metadata.Metadata> retrieve(Metadata.MetadataType type, List<String> fullNames) { }

}