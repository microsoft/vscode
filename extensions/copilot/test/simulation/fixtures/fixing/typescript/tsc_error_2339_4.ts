const handlePlay = () => {
	if (window.lx.isPlayedStop) return
	if (window.screenX > 100) return
	if (window.screenY > 100) return
	if (window.screenTop < 100) return
}