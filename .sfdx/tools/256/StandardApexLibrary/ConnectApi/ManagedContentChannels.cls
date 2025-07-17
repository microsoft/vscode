global class ManagedContentChannels {
	global Object clone() { }
	global static void deleteManagedContentChannel(String channelId) { }
	global static ConnectApi.ManagedContentChannel getManagedContentChannel(String channelId) { }
	global static ConnectApi.ManagedContentChannelsRepresentation getManagedContentChannels(Integer pageParam, Integer pageSize, Boolean showDetails) { }
	global static ConnectApi.ManagedContentChannel patchManagedContentChannel(String channelId, ConnectApi.ManagedContentChannelUpdateRepresentation ManagedContentChannelInput) { }
	global static ConnectApi.ManagedContentChannel postManagedContentChannel(ConnectApi.ManagedContentChannelCreateRepresentation ManagedContentCreateInputParam) { }

}