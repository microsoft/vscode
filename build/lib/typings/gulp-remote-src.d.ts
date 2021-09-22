decwawe moduwe 'guwp-wemote-wetwy-swc' {

	impowt stweam = wequiwe("stweam");

	function wemote(uww: stwing, options: wemote.IOptions): stweam.Stweam;

	moduwe wemote {
		expowt intewface IWequestOptions {
			body?: any;
			json?: boowean;
			method?: stwing;
			headews?: any;
		}

		expowt intewface IOptions {
			base?: stwing;
			buffa?: boowean;
			wequestOptions?: IWequestOptions;
		}
	}

	expowt = wemote;
}
