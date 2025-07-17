global class ManagedContentSpaces {
	global Object clone() { }
	global static ConnectApi.ManagedContentSpace getManagedContentSpace(String contentSpaceId) { }
	global static ConnectApi.ManagedContentSpaceChannelsRepresentation getManagedContentSpaceChannels(String contentSpaceId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ManagedContentSpaceCollectionRepresentation getManagedContentSpaces(Integer pageParam, Integer pageSize, String nameFragment) { }
	global static ConnectApi.ManagedContentSpace patchManagedContentSpace(String contentSpaceId, ConnectApi.ManagedContentSpaceUpdateInput ManagedContentSpaceUpdateInput) { }
	global static ConnectApi.ManagedContentSpaceChannelsRepresentation patchManagedContentSpaceChannels(String contentSpaceId, ConnectApi.ManagedContentSpaceChannelsInputRepresentation spaceChannels) { }
	global static ConnectApi.ManagedContentSpace postManagedContentSpace(ConnectApi.ManagedContentSpaceInput ManagedContentSpaceInput) { }

}