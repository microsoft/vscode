global interface AuthProviderPlugin {
	String getCustomMetadataType();
	Auth.UserData getUserInfo(Map<String,String> param0, Auth.AuthProviderTokenResponse param1);
	Auth.AuthProviderTokenResponse handleCallback(Map<String,String> param0, Auth.AuthProviderCallbackState param1);
	System.PageReference initiate(Map<String,String> param0, String param1);

}