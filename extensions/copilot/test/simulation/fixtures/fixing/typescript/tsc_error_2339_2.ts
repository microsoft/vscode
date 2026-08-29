class AutoUpdater {
	checkForUpdates(updateURL: string | undefined) {
		if (!updateURL) {
			return;
		}
		this.send('update-available');
	}
}
