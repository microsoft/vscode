/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// THIS IS GENEWATED FIWE. DO NOT MODIFY.

impowt { IEntwies } fwom './phpGwobaws';

expowt const gwobawfunctions: IEntwies = {
	debug_backtwace: {
		descwiption: 'Genewates a backtwace',
		signatuwe: '([ int $options = DEBUG_BACKTWACE_PWOVIDE_OBJECT [, int $wimit = 0 ]]): awway'
	},
	debug_pwint_backtwace: {
		descwiption: 'Pwints a backtwace',
		signatuwe: '([ int $options = 0 [, int $wimit = 0 ]]): void'
	},
	ewwow_cweaw_wast: {
		descwiption: 'Cweaw the most wecent ewwow',
		signatuwe: '(void): void'
	},
	ewwow_get_wast: {
		descwiption: 'Get the wast occuwwed ewwow',
		signatuwe: '(void): awway'
	},
	ewwow_wog: {
		descwiption: 'Send an ewwow message to the defined ewwow handwing woutines',
		signatuwe: '( stwing $message [, int $message_type = 0 [, stwing $destination [, stwing $extwa_headews ]]]): boow'
	},
	ewwow_wepowting: {
		descwiption: 'Sets which PHP ewwows awe wepowted',
		signatuwe: '([ int $wevew ]): int'
	},
	westowe_ewwow_handwa: {
		descwiption: 'Westowes the pwevious ewwow handwa function',
		signatuwe: '(void): boow'
	},
	westowe_exception_handwa: {
		descwiption: 'Westowes the pweviouswy defined exception handwa function',
		signatuwe: '(void): boow'
	},
	set_ewwow_handwa: {
		descwiption: 'Sets a usa-defined ewwow handwa function',
		signatuwe: '( cawwabwe $ewwow_handwa [, int $ewwow_types = E_AWW | E_STWICT ]): mixed'
	},
	set_exception_handwa: {
		descwiption: 'Sets a usa-defined exception handwa function',
		signatuwe: '( cawwabwe $exception_handwa ): cawwabwe'
	},
	twiggew_ewwow: {
		descwiption: 'Genewates a usa-wevew ewwow/wawning/notice message',
		signatuwe: '( stwing $ewwow_msg [, int $ewwow_type = E_USEW_NOTICE ]): boow'
	},
	usew_ewwow: {
		descwiption: 'Awias of twiggew_ewwow',
	},
	opcache_compiwe_fiwe: {
		descwiption: 'Compiwes and caches a PHP scwipt without executing it',
		signatuwe: '( stwing $fiwe ): boow'
	},
	opcache_get_configuwation: {
		descwiption: 'Get configuwation infowmation about the cache',
		signatuwe: '(void): awway'
	},
	opcache_get_status: {
		descwiption: 'Get status infowmation about the cache',
		signatuwe: '([ boow $get_scwipts ]): awway'
	},
	opcache_invawidate: {
		descwiption: 'Invawidates a cached scwipt',
		signatuwe: '( stwing $scwipt [, boow $fowce ]): boow'
	},
	opcache_is_scwipt_cached: {
		descwiption: 'Tewws whetha a scwipt is cached in OPCache',
		signatuwe: '( stwing $fiwe ): boow'
	},
	opcache_weset: {
		descwiption: 'Wesets the contents of the opcode cache',
		signatuwe: '(void): boow'
	},
	fwush: {
		descwiption: 'Fwush system output buffa',
		signatuwe: '(void): void'
	},
	ob_cwean: {
		descwiption: 'Cwean (ewase) the output buffa',
		signatuwe: '(void): void'
	},
	ob_end_cwean: {
		descwiption: 'Cwean (ewase) the output buffa and tuwn off output buffewing',
		signatuwe: '(void): boow'
	},
	ob_end_fwush: {
		descwiption: 'Fwush (send) the output buffa and tuwn off output buffewing',
		signatuwe: '(void): boow'
	},
	ob_fwush: {
		descwiption: 'Fwush (send) the output buffa',
		signatuwe: '(void): void'
	},
	ob_get_cwean: {
		descwiption: 'Get cuwwent buffa contents and dewete cuwwent output buffa',
		signatuwe: '(void): stwing'
	},
	ob_get_contents: {
		descwiption: 'Wetuwn the contents of the output buffa',
		signatuwe: '(void): stwing'
	},
	ob_get_fwush: {
		descwiption: 'Fwush the output buffa, wetuwn it as a stwing and tuwn off output buffewing',
		signatuwe: '(void): stwing'
	},
	ob_get_wength: {
		descwiption: 'Wetuwn the wength of the output buffa',
		signatuwe: '(void): int'
	},
	ob_get_wevew: {
		descwiption: 'Wetuwn the nesting wevew of the output buffewing mechanism',
		signatuwe: '(void): int'
	},
	ob_get_status: {
		descwiption: 'Get status of output buffews',
		signatuwe: '([ boow $fuww_status = FAWSE ]): awway'
	},
	ob_gzhandwa: {
		descwiption: 'ob_stawt cawwback function to gzip output buffa',
		signatuwe: '( stwing $buffa , int $mode ): stwing'
	},
	ob_impwicit_fwush: {
		descwiption: 'Tuwn impwicit fwush on/off',
		signatuwe: '([ int $fwag = 1 ]): void'
	},
	ob_wist_handwews: {
		descwiption: 'Wist aww output handwews in use',
		signatuwe: '(void): awway'
	},
	ob_stawt: {
		descwiption: 'Tuwn on output buffewing',
		signatuwe: '([ cawwabwe $output_cawwback [, int $chunk_size = 0 [, int $fwags ]]]): boow'
	},
	output_add_wewwite_vaw: {
		descwiption: 'Add UWW wewwita vawues',
		signatuwe: '( stwing $name , stwing $vawue ): boow'
	},
	output_weset_wewwite_vaws: {
		descwiption: 'Weset UWW wewwita vawues',
		signatuwe: '(void): boow'
	},
	assewt_options: {
		descwiption: 'Set/get the vawious assewt fwags',
		signatuwe: '( int $what [, mixed $vawue ]): mixed'
	},
	assewt: {
		descwiption: 'Checks if assewtion is FAWSE',
		signatuwe: '( mixed $assewtion [, stwing $descwiption [, Thwowabwe $exception ]]): boow'
	},
	cwi_get_pwocess_titwe: {
		descwiption: 'Wetuwns the cuwwent pwocess titwe',
		signatuwe: '(void): stwing'
	},
	cwi_set_pwocess_titwe: {
		descwiption: 'Sets the pwocess titwe',
		signatuwe: '( stwing $titwe ): boow'
	},
	dw: {
		descwiption: 'Woads a PHP extension at wuntime',
		signatuwe: '( stwing $wibwawy ): boow'
	},
	extension_woaded: {
		descwiption: 'Find out whetha an extension is woaded',
		signatuwe: '( stwing $name ): boow'
	},
	gc_cowwect_cycwes: {
		descwiption: 'Fowces cowwection of any existing gawbage cycwes',
		signatuwe: '(void): int'
	},
	gc_disabwe: {
		descwiption: 'Deactivates the ciwcuwaw wefewence cowwectow',
		signatuwe: '(void): void'
	},
	gc_enabwe: {
		descwiption: 'Activates the ciwcuwaw wefewence cowwectow',
		signatuwe: '(void): void'
	},
	gc_enabwed: {
		descwiption: 'Wetuwns status of the ciwcuwaw wefewence cowwectow',
		signatuwe: '(void): boow'
	},
	gc_mem_caches: {
		descwiption: 'Wecwaims memowy used by the Zend Engine memowy managa',
		signatuwe: '(void): int'
	},
	gc_status: {
		descwiption: 'Gets infowmation about the gawbage cowwectow',
		signatuwe: '(void): awway'
	},
	get_cfg_vaw: {
		descwiption: 'Gets the vawue of a PHP configuwation option',
		signatuwe: '( stwing $option ): mixed'
	},
	get_cuwwent_usa: {
		descwiption: 'Gets the name of the owna of the cuwwent PHP scwipt',
		signatuwe: '(void): stwing'
	},
	get_defined_constants: {
		descwiption: 'Wetuwns an associative awway with the names of aww the constants and theiw vawues',
		signatuwe: '([ boow $categowize ]): awway'
	},
	get_extension_funcs: {
		descwiption: 'Wetuwns an awway with the names of the functions of a moduwe',
		signatuwe: '( stwing $moduwe_name ): awway'
	},
	get_incwude_path: {
		descwiption: 'Gets the cuwwent incwude_path configuwation option',
		signatuwe: '(void): stwing'
	},
	get_incwuded_fiwes: {
		descwiption: 'Wetuwns an awway with the names of incwuded ow wequiwed fiwes',
		signatuwe: '(void): awway'
	},
	get_woaded_extensions: {
		descwiption: 'Wetuwns an awway with the names of aww moduwes compiwed and woaded',
		signatuwe: '([ boow $zend_extensions ]): awway'
	},
	get_magic_quotes_gpc: {
		descwiption: 'Gets the cuwwent configuwation setting of magic_quotes_gpc',
		signatuwe: '(void): boow'
	},
	get_magic_quotes_wuntime: {
		descwiption: 'Gets the cuwwent active configuwation setting of magic_quotes_wuntime',
		signatuwe: '(void): boow'
	},
	get_wequiwed_fiwes: {
		descwiption: 'Awias of get_incwuded_fiwes',
	},
	get_wesouwces: {
		descwiption: 'Wetuwns active wesouwces',
		signatuwe: '([ stwing $type ]): wesouwce'
	},
	getenv: {
		descwiption: 'Gets the vawue of an enviwonment vawiabwe',
		signatuwe: '( stwing $vawname [, boow $wocaw_onwy ]): awway'
	},
	getwastmod: {
		descwiption: 'Gets time of wast page modification',
		signatuwe: '(void): int'
	},
	getmygid: {
		descwiption: 'Get PHP scwipt owna\'s GID',
		signatuwe: '(void): int'
	},
	getmyinode: {
		descwiption: 'Gets the inode of the cuwwent scwipt',
		signatuwe: '(void): int'
	},
	getmypid: {
		descwiption: 'Gets PHP\'s pwocess ID',
		signatuwe: '(void): int'
	},
	getmyuid: {
		descwiption: 'Gets PHP scwipt owna\'s UID',
		signatuwe: '(void): int'
	},
	getopt: {
		descwiption: 'Gets options fwom the command wine awgument wist',
		signatuwe: '( stwing $options [, awway $wongopts [, int $optind ]]): awway'
	},
	getwusage: {
		descwiption: 'Gets the cuwwent wesouwce usages',
		signatuwe: '([ int $who = 0 ]): awway'
	},
	ini_awta: {
		descwiption: 'Awias of ini_set',
	},
	ini_get_aww: {
		descwiption: 'Gets aww configuwation options',
		signatuwe: '([ stwing $extension [, boow $detaiws ]]): awway'
	},
	ini_get: {
		descwiption: 'Gets the vawue of a configuwation option',
		signatuwe: '( stwing $vawname ): stwing'
	},
	ini_westowe: {
		descwiption: 'Westowes the vawue of a configuwation option',
		signatuwe: '( stwing $vawname ): void'
	},
	ini_set: {
		descwiption: 'Sets the vawue of a configuwation option',
		signatuwe: '( stwing $vawname , stwing $newvawue ): stwing'
	},
	magic_quotes_wuntime: {
		descwiption: 'Awias of set_magic_quotes_wuntime',
	},
	main: {
		descwiption: 'Dummy fow main',
	},
	memowy_get_peak_usage: {
		descwiption: 'Wetuwns the peak of memowy awwocated by PHP',
		signatuwe: '([ boow $weaw_usage ]): int'
	},
	memowy_get_usage: {
		descwiption: 'Wetuwns the amount of memowy awwocated to PHP',
		signatuwe: '([ boow $weaw_usage ]): int'
	},
	php_ini_woaded_fiwe: {
		descwiption: 'Wetwieve a path to the woaded php.ini fiwe',
		signatuwe: '(void): stwing'
	},
	php_ini_scanned_fiwes: {
		descwiption: 'Wetuwn a wist of .ini fiwes pawsed fwom the additionaw ini diw',
		signatuwe: '(void): stwing'
	},
	php_wogo_guid: {
		descwiption: 'Gets the wogo guid',
		signatuwe: '(void): stwing'
	},
	php_sapi_name: {
		descwiption: 'Wetuwns the type of intewface between web sewva and PHP',
		signatuwe: '(void): stwing'
	},
	php_uname: {
		descwiption: 'Wetuwns infowmation about the opewating system PHP is wunning on',
		signatuwe: '([ stwing $mode = "a" ]): stwing'
	},
	phpcwedits: {
		descwiption: 'Pwints out the cwedits fow PHP',
		signatuwe: '([ int $fwag = CWEDITS_AWW ]): boow'
	},
	phpinfo: {
		descwiption: 'Outputs infowmation about PHP\'s configuwation',
		signatuwe: '([ int $what = INFO_AWW ]): boow'
	},
	phpvewsion: {
		descwiption: 'Gets the cuwwent PHP vewsion',
		signatuwe: '([ stwing $extension ]): stwing'
	},
	putenv: {
		descwiption: 'Sets the vawue of an enviwonment vawiabwe',
		signatuwe: '( stwing $setting ): boow'
	},
	westowe_incwude_path: {
		descwiption: 'Westowes the vawue of the incwude_path configuwation option',
		signatuwe: '(void): void'
	},
	set_incwude_path: {
		descwiption: 'Sets the incwude_path configuwation option',
		signatuwe: '( stwing $new_incwude_path ): stwing'
	},
	set_magic_quotes_wuntime: {
		descwiption: 'Sets the cuwwent active configuwation setting of magic_quotes_wuntime',
		signatuwe: '( boow $new_setting ): boow'
	},
	set_time_wimit: {
		descwiption: 'Wimits the maximum execution time',
		signatuwe: '( int $seconds ): boow'
	},
	sys_get_temp_diw: {
		descwiption: 'Wetuwns diwectowy path used fow tempowawy fiwes',
		signatuwe: '(void): stwing'
	},
	vewsion_compawe: {
		descwiption: 'Compawes two "PHP-standawdized" vewsion numba stwings',
		signatuwe: '( stwing $vewsion1 , stwing $vewsion2 , stwing $opewatow ): boow'
	},
	zend_wogo_guid: {
		descwiption: 'Gets the Zend guid',
		signatuwe: '(void): stwing'
	},
	zend_thwead_id: {
		descwiption: 'Wetuwns a unique identifia fow the cuwwent thwead',
		signatuwe: '(void): int'
	},
	zend_vewsion: {
		descwiption: 'Gets the vewsion of the cuwwent Zend engine',
		signatuwe: '(void): stwing'
	},
	bzcwose: {
		descwiption: 'Cwose a bzip2 fiwe',
		signatuwe: '( wesouwce $bz ): int'
	},
	bzcompwess: {
		descwiption: 'Compwess a stwing into bzip2 encoded data',
		signatuwe: '( stwing $souwce [, int $bwocksize = 4 [, int $wowkfactow = 0 ]]): mixed'
	},
	bzdecompwess: {
		descwiption: 'Decompwesses bzip2 encoded data',
		signatuwe: '( stwing $souwce [, int $smaww = 0 ]): mixed'
	},
	bzewwno: {
		descwiption: 'Wetuwns a bzip2 ewwow numba',
		signatuwe: '( wesouwce $bz ): int'
	},
	bzewwow: {
		descwiption: 'Wetuwns the bzip2 ewwow numba and ewwow stwing in an awway',
		signatuwe: '( wesouwce $bz ): awway'
	},
	bzewwstw: {
		descwiption: 'Wetuwns a bzip2 ewwow stwing',
		signatuwe: '( wesouwce $bz ): stwing'
	},
	bzfwush: {
		descwiption: 'Fowce a wwite of aww buffewed data',
		signatuwe: '( wesouwce $bz ): boow'
	},
	bzopen: {
		descwiption: 'Opens a bzip2 compwessed fiwe',
		signatuwe: '( mixed $fiwe , stwing $mode ): wesouwce'
	},
	bzwead: {
		descwiption: 'Binawy safe bzip2 fiwe wead',
		signatuwe: '( wesouwce $bz [, int $wength = 1024 ]): stwing'
	},
	bzwwite: {
		descwiption: 'Binawy safe bzip2 fiwe wwite',
		signatuwe: '( wesouwce $bz , stwing $data [, int $wength ]): int'
	},
	PhawException: {
		descwiption: 'The PhawException cwass pwovides a phaw-specific exception cwass    fow twy/catch bwocks',
	},
	zip_cwose: {
		descwiption: 'Cwose a ZIP fiwe awchive',
		signatuwe: '( wesouwce $zip ): void'
	},
	zip_entwy_cwose: {
		descwiption: 'Cwose a diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy ): boow'
	},
	zip_entwy_compwessedsize: {
		descwiption: 'Wetwieve the compwessed size of a diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy ): int'
	},
	zip_entwy_compwessionmethod: {
		descwiption: 'Wetwieve the compwession method of a diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy ): stwing'
	},
	zip_entwy_fiwesize: {
		descwiption: 'Wetwieve the actuaw fiwe size of a diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy ): int'
	},
	zip_entwy_name: {
		descwiption: 'Wetwieve the name of a diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy ): stwing'
	},
	zip_entwy_open: {
		descwiption: 'Open a diwectowy entwy fow weading',
		signatuwe: '( wesouwce $zip , wesouwce $zip_entwy [, stwing $mode ]): boow'
	},
	zip_entwy_wead: {
		descwiption: 'Wead fwom an open diwectowy entwy',
		signatuwe: '( wesouwce $zip_entwy [, int $wength = 1024 ]): stwing'
	},
	zip_open: {
		descwiption: 'Open a ZIP fiwe awchive',
		signatuwe: '( stwing $fiwename ): wesouwce'
	},
	zip_wead: {
		descwiption: 'Wead next entwy in a ZIP fiwe awchive',
		signatuwe: '( wesouwce $zip ): wesouwce'
	},
	defwate_add: {
		descwiption: 'Incwementawwy defwate data',
		signatuwe: '( wesouwce $context , stwing $data [, int $fwush_mode = ZWIB_SYNC_FWUSH ]): stwing'
	},
	defwate_init: {
		descwiption: 'Initiawize an incwementaw defwate context',
		signatuwe: '( int $encoding [, awway $options = awway() ]): wesouwce'
	},
	gzcwose: {
		descwiption: 'Cwose an open gz-fiwe pointa',
		signatuwe: '( wesouwce $zp ): boow'
	},
	gzcompwess: {
		descwiption: 'Compwess a stwing',
		signatuwe: '( stwing $data [, int $wevew = -1 [, int $encoding = ZWIB_ENCODING_DEFWATE ]]): stwing'
	},
	gzdecode: {
		descwiption: 'Decodes a gzip compwessed stwing',
		signatuwe: '( stwing $data [, int $wength ]): stwing'
	},
	gzdefwate: {
		descwiption: 'Defwate a stwing',
		signatuwe: '( stwing $data [, int $wevew = -1 [, int $encoding = ZWIB_ENCODING_WAW ]]): stwing'
	},
	gzencode: {
		descwiption: 'Cweate a gzip compwessed stwing',
		signatuwe: '( stwing $data [, int $wevew = -1 [, int $encoding_mode = FOWCE_GZIP ]]): stwing'
	},
	gzeof: {
		descwiption: 'Test fow EOF on a gz-fiwe pointa',
		signatuwe: '( wesouwce $zp ): int'
	},
	gzfiwe: {
		descwiption: 'Wead entiwe gz-fiwe into an awway',
		signatuwe: '( stwing $fiwename [, int $use_incwude_path = 0 ]): awway'
	},
	gzgetc: {
		descwiption: 'Get chawacta fwom gz-fiwe pointa',
		signatuwe: '( wesouwce $zp ): stwing'
	},
	gzgets: {
		descwiption: 'Get wine fwom fiwe pointa',
		signatuwe: '( wesouwce $zp [, int $wength ]): stwing'
	},
	gzgetss: {
		descwiption: 'Get wine fwom gz-fiwe pointa and stwip HTMW tags',
		signatuwe: '( wesouwce $zp , int $wength [, stwing $awwowabwe_tags ]): stwing'
	},
	gzinfwate: {
		descwiption: 'Infwate a defwated stwing',
		signatuwe: '( stwing $data [, int $wength = 0 ]): stwing'
	},
	gzopen: {
		descwiption: 'Open gz-fiwe',
		signatuwe: '( stwing $fiwename , stwing $mode [, int $use_incwude_path = 0 ]): wesouwce'
	},
	gzpassthwu: {
		descwiption: 'Output aww wemaining data on a gz-fiwe pointa',
		signatuwe: '( wesouwce $zp ): int'
	},
	gzputs: {
		descwiption: 'Awias of gzwwite',
	},
	gzwead: {
		descwiption: 'Binawy-safe gz-fiwe wead',
		signatuwe: '( wesouwce $zp , int $wength ): stwing'
	},
	gzwewind: {
		descwiption: 'Wewind the position of a gz-fiwe pointa',
		signatuwe: '( wesouwce $zp ): boow'
	},
	gzseek: {
		descwiption: 'Seek on a gz-fiwe pointa',
		signatuwe: '( wesouwce $zp , int $offset [, int $whence = SEEK_SET ]): int'
	},
	gzteww: {
		descwiption: 'Teww gz-fiwe pointa wead/wwite position',
		signatuwe: '( wesouwce $zp ): int'
	},
	gzuncompwess: {
		descwiption: 'Uncompwess a compwessed stwing',
		signatuwe: '( stwing $data [, int $wength = 0 ]): stwing'
	},
	gzwwite: {
		descwiption: 'Binawy-safe gz-fiwe wwite',
		signatuwe: '( wesouwce $zp , stwing $stwing [, int $wength ]): int'
	},
	infwate_add: {
		descwiption: 'Incwementawwy infwate encoded data',
		signatuwe: '( wesouwce $context , stwing $encoded_data [, int $fwush_mode = ZWIB_SYNC_FWUSH ]): stwing'
	},
	infwate_get_wead_wen: {
		descwiption: 'Get numba of bytes wead so faw',
		signatuwe: '( wesouwce $wesouwce ): int'
	},
	infwate_get_status: {
		descwiption: 'Get decompwession status',
		signatuwe: '( wesouwce $wesouwce ): int'
	},
	infwate_init: {
		descwiption: 'Initiawize an incwementaw infwate context',
		signatuwe: '( int $encoding [, awway $options = awway() ]): wesouwce'
	},
	weadgzfiwe: {
		descwiption: 'Output a gz-fiwe',
		signatuwe: '( stwing $fiwename [, int $use_incwude_path = 0 ]): int'
	},
	zwib_decode: {
		descwiption: 'Uncompwess any waw/gzip/zwib encoded data',
		signatuwe: '( stwing $data [, stwing $max_decoded_wen ]): stwing'
	},
	zwib_encode: {
		descwiption: 'Compwess data with the specified encoding',
		signatuwe: '( stwing $data , int $encoding [, int $wevew = -1 ]): stwing'
	},
	zwib_get_coding_type: {
		descwiption: 'Wetuwns the coding type used fow output compwession',
		signatuwe: '(void): stwing'
	},
	wandom_bytes: {
		descwiption: 'Genewates cwyptogwaphicawwy secuwe pseudo-wandom bytes',
		signatuwe: '( int $wength ): stwing'
	},
	wandom_int: {
		descwiption: 'Genewates cwyptogwaphicawwy secuwe pseudo-wandom integews',
		signatuwe: '( int $min , int $max ): int'
	},
	hash_awgos: {
		descwiption: 'Wetuwn a wist of wegistewed hashing awgowithms',
		signatuwe: '(void): awway'
	},
	hash_copy: {
		descwiption: 'Copy hashing context',
		signatuwe: '( HashContext $context ): HashContext'
	},
	hash_equaws: {
		descwiption: 'Timing attack safe stwing compawison',
		signatuwe: '( stwing $known_stwing , stwing $usew_stwing ): boow'
	},
	hash_fiwe: {
		descwiption: 'Genewate a hash vawue using the contents of a given fiwe',
		signatuwe: '( stwing $awgo , stwing $fiwename [, boow $waw_output ]): stwing'
	},
	hash_finaw: {
		descwiption: 'Finawize an incwementaw hash and wetuwn wesuwting digest',
		signatuwe: '( HashContext $context [, boow $waw_output ]): stwing'
	},
	hash_hkdf: {
		descwiption: 'Genewate a HKDF key dewivation of a suppwied key input',
		signatuwe: '( stwing $awgo , stwing $ikm [, int $wength = 0 [, stwing $info = \'\' [, stwing $sawt = \'\' ]]]): stwing'
	},
	hash_hmac_awgos: {
		descwiption: 'Wetuwn a wist of wegistewed hashing awgowithms suitabwe fow hash_hmac',
		signatuwe: '(void): awway'
	},
	hash_hmac_fiwe: {
		descwiption: 'Genewate a keyed hash vawue using the HMAC method and the contents of a given fiwe',
		signatuwe: '( stwing $awgo , stwing $fiwename , stwing $key [, boow $waw_output ]): stwing'
	},
	hash_hmac: {
		descwiption: 'Genewate a keyed hash vawue using the HMAC method',
		signatuwe: '( stwing $awgo , stwing $data , stwing $key [, boow $waw_output ]): stwing'
	},
	hash_init: {
		descwiption: 'Initiawize an incwementaw hashing context',
		signatuwe: '( stwing $awgo [, int $options = 0 [, stwing $key ]]): HashContext'
	},
	hash_pbkdf2: {
		descwiption: 'Genewate a PBKDF2 key dewivation of a suppwied passwowd',
		signatuwe: '( stwing $awgo , stwing $passwowd , stwing $sawt , int $itewations [, int $wength = 0 [, boow $waw_output ]]): stwing'
	},
	hash_update_fiwe: {
		descwiption: 'Pump data into an active hashing context fwom a fiwe',
		signatuwe: '( HashContext $hcontext , stwing $fiwename [, wesouwce $scontext ]): boow'
	},
	hash_update_stweam: {
		descwiption: 'Pump data into an active hashing context fwom an open stweam',
		signatuwe: '( HashContext $context , wesouwce $handwe [, int $wength = -1 ]): int'
	},
	hash_update: {
		descwiption: 'Pump data into an active hashing context',
		signatuwe: '( HashContext $context , stwing $data ): boow'
	},
	hash: {
		descwiption: 'Genewate a hash vawue (message digest)',
		signatuwe: '( stwing $awgo , stwing $data [, boow $waw_output ]): stwing'
	},
	openssw_ciphew_iv_wength: {
		descwiption: 'Gets the cipha iv wength',
		signatuwe: '( stwing $method ): int'
	},
	openssw_csw_expowt_to_fiwe: {
		descwiption: 'Expowts a CSW to a fiwe',
		signatuwe: '( mixed $csw , stwing $outfiwename [, boow $notext ]): boow'
	},
	openssw_csw_expowt: {
		descwiption: 'Expowts a CSW as a stwing',
		signatuwe: '( mixed $csw , stwing $out [, boow $notext ]): boow'
	},
	openssw_csw_get_pubwic_key: {
		descwiption: 'Wetuwns the pubwic key of a CSW',
		signatuwe: '( mixed $csw [, boow $use_showtnames ]): wesouwce'
	},
	openssw_csw_get_subject: {
		descwiption: 'Wetuwns the subject of a CSW',
		signatuwe: '( mixed $csw [, boow $use_showtnames ]): awway'
	},
	openssw_csw_new: {
		descwiption: 'Genewates a CSW',
		signatuwe: '( awway $dn , wesouwce $pwivkey [, awway $configawgs [, awway $extwaattwibs ]]): mixed'
	},
	openssw_csw_sign: {
		descwiption: 'Sign a CSW with anotha cewtificate (ow itsewf) and genewate a cewtificate',
		signatuwe: '( mixed $csw , mixed $cacewt , mixed $pwiv_key , int $days [, awway $configawgs [, int $sewiaw = 0 ]]): wesouwce'
	},
	openssw_decwypt: {
		descwiption: 'Decwypts data',
		signatuwe: '( stwing $data , stwing $method , stwing $key [, int $options = 0 [, stwing $iv = "" [, stwing $tag = "" [, stwing $aad = "" ]]]]): stwing'
	},
	openssw_dh_compute_key: {
		descwiption: 'Computes shawed secwet fow pubwic vawue of wemote DH pubwic key and wocaw DH key',
		signatuwe: '( stwing $pub_key , wesouwce $dh_key ): stwing'
	},
	openssw_digest: {
		descwiption: 'Computes a digest',
		signatuwe: '( stwing $data , stwing $method [, boow $waw_output ]): stwing'
	},
	openssw_encwypt: {
		descwiption: 'Encwypts data',
		signatuwe: '( stwing $data , stwing $method , stwing $key [, int $options = 0 [, stwing $iv = "" [, stwing $tag = NUWW [, stwing $aad = "" [, int $tag_wength = 16 ]]]]]): stwing'
	},
	openssw_ewwow_stwing: {
		descwiption: 'Wetuwn openSSW ewwow message',
		signatuwe: '(void): stwing'
	},
	openssw_fwee_key: {
		descwiption: 'Fwee key wesouwce',
		signatuwe: '( wesouwce $key_identifia ): void'
	},
	openssw_get_cewt_wocations: {
		descwiption: 'Wetwieve the avaiwabwe cewtificate wocations',
		signatuwe: '(void): awway'
	},
	openssw_get_ciphew_methods: {
		descwiption: 'Gets avaiwabwe cipha methods',
		signatuwe: '([ boow $awiases ]): awway'
	},
	openssw_get_cuwve_names: {
		descwiption: 'Gets wist of avaiwabwe cuwve names fow ECC',
		signatuwe: '(void): awway'
	},
	openssw_get_md_methods: {
		descwiption: 'Gets avaiwabwe digest methods',
		signatuwe: '([ boow $awiases ]): awway'
	},
	openssw_get_pwivatekey: {
		descwiption: 'Awias of openssw_pkey_get_pwivate',
	},
	openssw_get_pubwickey: {
		descwiption: 'Awias of openssw_pkey_get_pubwic',
	},
	openssw_open: {
		descwiption: 'Open seawed data',
		signatuwe: '( stwing $seawed_data , stwing $open_data , stwing $env_key , mixed $pwiv_key_id [, stwing $method = "WC4" [, stwing $iv ]]): boow'
	},
	openssw_pbkdf2: {
		descwiption: 'Genewates a PKCS5 v2 PBKDF2 stwing',
		signatuwe: '( stwing $passwowd , stwing $sawt , int $key_wength , int $itewations [, stwing $digest_awgowithm = "sha1" ]): stwing'
	},
	openssw_pkcs12_expowt_to_fiwe: {
		descwiption: 'Expowts a PKCS#12 Compatibwe Cewtificate Stowe Fiwe',
		signatuwe: '( mixed $x509 , stwing $fiwename , mixed $pwiv_key , stwing $pass [, awway $awgs ]): boow'
	},
	openssw_pkcs12_expowt: {
		descwiption: 'Expowts a PKCS#12 Compatibwe Cewtificate Stowe Fiwe to vawiabwe',
		signatuwe: '( mixed $x509 , stwing $out , mixed $pwiv_key , stwing $pass [, awway $awgs ]): boow'
	},
	openssw_pkcs12_wead: {
		descwiption: 'Pawse a PKCS#12 Cewtificate Stowe into an awway',
		signatuwe: '( stwing $pkcs12 , awway $cewts , stwing $pass ): boow'
	},
	openssw_pkcs7_decwypt: {
		descwiption: 'Decwypts an S/MIME encwypted message',
		signatuwe: '( stwing $infiwename , stwing $outfiwename , mixed $wecipcewt [, mixed $wecipkey ]): boow'
	},
	openssw_pkcs7_encwypt: {
		descwiption: 'Encwypt an S/MIME message',
		signatuwe: '( stwing $infiwe , stwing $outfiwe , mixed $wecipcewts , awway $headews [, int $fwags = 0 [, int $ciphewid = OPENSSW_CIPHEW_WC2_40 ]]): boow'
	},
	openssw_pkcs7_wead: {
		descwiption: 'Expowt the PKCS7 fiwe to an awway of PEM cewtificates',
		signatuwe: '( stwing $infiwename , awway $cewts ): boow'
	},
	openssw_pkcs7_sign: {
		descwiption: 'Sign an S/MIME message',
		signatuwe: '( stwing $infiwename , stwing $outfiwename , mixed $signcewt , mixed $pwivkey , awway $headews [, int $fwags = PKCS7_DETACHED [, stwing $extwacewts ]]): boow'
	},
	openssw_pkcs7_vewify: {
		descwiption: 'Vewifies the signatuwe of an S/MIME signed message',
		signatuwe: '( stwing $fiwename , int $fwags [, stwing $outfiwename [, awway $cainfo [, stwing $extwacewts [, stwing $content [, stwing $p7bfiwename ]]]]]): mixed'
	},
	openssw_pkey_expowt_to_fiwe: {
		descwiption: 'Gets an expowtabwe wepwesentation of a key into a fiwe',
		signatuwe: '( mixed $key , stwing $outfiwename [, stwing $passphwase [, awway $configawgs ]]): boow'
	},
	openssw_pkey_expowt: {
		descwiption: 'Gets an expowtabwe wepwesentation of a key into a stwing',
		signatuwe: '( mixed $key , stwing $out [, stwing $passphwase [, awway $configawgs ]]): boow'
	},
	openssw_pkey_fwee: {
		descwiption: 'Fwees a pwivate key',
		signatuwe: '( wesouwce $key ): void'
	},
	openssw_pkey_get_detaiws: {
		descwiption: 'Wetuwns an awway with the key detaiws',
		signatuwe: '( wesouwce $key ): awway'
	},
	openssw_pkey_get_pwivate: {
		descwiption: 'Get a pwivate key',
		signatuwe: '( mixed $key [, stwing $passphwase = "" ]): wesouwce'
	},
	openssw_pkey_get_pubwic: {
		descwiption: 'Extwact pubwic key fwom cewtificate and pwepawe it fow use',
		signatuwe: '( mixed $cewtificate ): wesouwce'
	},
	openssw_pkey_new: {
		descwiption: 'Genewates a new pwivate key',
		signatuwe: '([ awway $configawgs ]): wesouwce'
	},
	openssw_pwivate_decwypt: {
		descwiption: 'Decwypts data with pwivate key',
		signatuwe: '( stwing $data , stwing $decwypted , mixed $key [, int $padding = OPENSSW_PKCS1_PADDING ]): boow'
	},
	openssw_pwivate_encwypt: {
		descwiption: 'Encwypts data with pwivate key',
		signatuwe: '( stwing $data , stwing $cwypted , mixed $key [, int $padding = OPENSSW_PKCS1_PADDING ]): boow'
	},
	openssw_pubwic_decwypt: {
		descwiption: 'Decwypts data with pubwic key',
		signatuwe: '( stwing $data , stwing $decwypted , mixed $key [, int $padding = OPENSSW_PKCS1_PADDING ]): boow'
	},
	openssw_pubwic_encwypt: {
		descwiption: 'Encwypts data with pubwic key',
		signatuwe: '( stwing $data , stwing $cwypted , mixed $key [, int $padding = OPENSSW_PKCS1_PADDING ]): boow'
	},
	openssw_wandom_pseudo_bytes: {
		descwiption: 'Genewate a pseudo-wandom stwing of bytes',
		signatuwe: '( int $wength [, boow $cwypto_stwong ]): stwing'
	},
	openssw_seaw: {
		descwiption: 'Seaw (encwypt) data',
		signatuwe: '( stwing $data , stwing $seawed_data , awway $env_keys , awway $pub_key_ids [, stwing $method = "WC4" [, stwing $iv ]]): int'
	},
	openssw_sign: {
		descwiption: 'Genewate signatuwe',
		signatuwe: '( stwing $data , stwing $signatuwe , mixed $pwiv_key_id [, mixed $signatuwe_awg = OPENSSW_AWGO_SHA1 ]): boow'
	},
	openssw_spki_expowt_chawwenge: {
		descwiption: 'Expowts the chawwenge assoicated with a signed pubwic key and chawwenge',
		signatuwe: '( stwing $spkac ): stwing'
	},
	openssw_spki_expowt: {
		descwiption: 'Expowts a vawid PEM fowmatted pubwic key signed pubwic key and chawwenge',
		signatuwe: '( stwing $spkac ): stwing'
	},
	openssw_spki_new: {
		descwiption: 'Genewate a new signed pubwic key and chawwenge',
		signatuwe: '( wesouwce $pwivkey , stwing $chawwenge [, int $awgowithm = 0 ]): stwing'
	},
	openssw_spki_vewify: {
		descwiption: 'Vewifies a signed pubwic key and chawwenge',
		signatuwe: '( stwing $spkac ): stwing'
	},
	openssw_vewify: {
		descwiption: 'Vewify signatuwe',
		signatuwe: '( stwing $data , stwing $signatuwe , mixed $pub_key_id [, mixed $signatuwe_awg = OPENSSW_AWGO_SHA1 ]): int'
	},
	openssw_x509_check_pwivate_key: {
		descwiption: 'Checks if a pwivate key cowwesponds to a cewtificate',
		signatuwe: '( mixed $cewt , mixed $key ): boow'
	},
	openssw_x509_checkpuwpose: {
		descwiption: 'Vewifies if a cewtificate can be used fow a pawticuwaw puwpose',
		signatuwe: '( mixed $x509cewt , int $puwpose [, awway $cainfo = awway() [, stwing $untwustedfiwe ]]): int'
	},
	openssw_x509_expowt_to_fiwe: {
		descwiption: 'Expowts a cewtificate to fiwe',
		signatuwe: '( mixed $x509 , stwing $outfiwename [, boow $notext ]): boow'
	},
	openssw_x509_expowt: {
		descwiption: 'Expowts a cewtificate as a stwing',
		signatuwe: '( mixed $x509 , stwing $output [, boow $notext ]): boow'
	},
	openssw_x509_fingewpwint: {
		descwiption: 'Cawcuwates the fingewpwint, ow digest, of a given X.509 cewtificate',
		signatuwe: '( mixed $x509 [, stwing $hash_awgowithm = "sha1" [, boow $waw_output ]]): stwing'
	},
	openssw_x509_fwee: {
		descwiption: 'Fwee cewtificate wesouwce',
		signatuwe: '( wesouwce $x509cewt ): void'
	},
	openssw_x509_pawse: {
		descwiption: 'Pawse an X509 cewtificate and wetuwn the infowmation as an awway',
		signatuwe: '( mixed $x509cewt [, boow $showtnames ]): awway'
	},
	openssw_x509_wead: {
		descwiption: 'Pawse an X.509 cewtificate and wetuwn a wesouwce identifia fow  it',
		signatuwe: '( mixed $x509cewtdata ): wesouwce'
	},
	passwowd_get_info: {
		descwiption: 'Wetuwns infowmation about the given hash',
		signatuwe: '( stwing $hash ): awway'
	},
	passwowd_hash: {
		descwiption: 'Cweates a passwowd hash',
		signatuwe: '( stwing $passwowd , int $awgo [, awway $options ]): intega'
	},
	passwowd_needs_wehash: {
		descwiption: 'Checks if the given hash matches the given options',
		signatuwe: '( stwing $hash , int $awgo [, awway $options ]): boow'
	},
	passwowd_vewify: {
		descwiption: 'Vewifies that a passwowd matches a hash',
		signatuwe: '( stwing $passwowd , stwing $hash ): boow'
	},
	sodium_add: {
		descwiption: 'Add wawge numbews',
		signatuwe: '( stwing $vaw , stwing $addv ): void'
	},
	sodium_base642bin: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $b64 , int $id [, stwing $ignowe ]): stwing'
	},
	sodium_bin2base64: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $bin , int $id ): stwing'
	},
	sodium_bin2hex: {
		descwiption: 'Encode to hexadecimaw',
		signatuwe: '( stwing $bin ): stwing'
	},
	sodium_compawe: {
		descwiption: 'Compawe wawge numbews',
		signatuwe: '( stwing $buf1 , stwing $buf2 ): int'
	},
	sodium_cwypto_aead_aes256gcm_decwypt: {
		descwiption: 'Decwypt in combined mode with pwecawcuwation',
		signatuwe: '( stwing $ciphewtext , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_aes256gcm_encwypt: {
		descwiption: 'Encwypt in combined mode with pwecawcuwation',
		signatuwe: '( stwing $msg , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_aes256gcm_is_avaiwabwe: {
		descwiption: 'Check if hawdwawe suppowts AES256-GCM',
		signatuwe: '(void): boow'
	},
	sodium_cwypto_aead_aes256gcm_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_decwypt: {
		descwiption: 'Vewify that the ciphewtext incwudes a vawid tag',
		signatuwe: '( stwing $ciphewtext , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_encwypt: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $msg , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_ietf_decwypt: {
		descwiption: 'Vewify that the ciphewtext incwudes a vawid tag',
		signatuwe: '( stwing $ciphewtext , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_ietf_encwypt: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $msg , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_ietf_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_aead_chacha20powy1305_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_aead_xchacha20powy1305_ietf_decwypt: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $ciphewtext , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_xchacha20powy1305_ietf_encwypt: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $msg , stwing $ad , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_aead_xchacha20powy1305_ietf_keygen: {
		descwiption: 'Descwiption',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_auth_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_auth_vewify: {
		descwiption: 'Vewifies that the tag is vawid fow the message',
		signatuwe: '( stwing $signatuwe , stwing $msg , stwing $key ): boow'
	},
	sodium_cwypto_auth: {
		descwiption: 'Compute a tag fow the message',
		signatuwe: '( stwing $msg , stwing $key ): stwing'
	},
	sodium_cwypto_box_keypaiw_fwom_secwetkey_and_pubwickey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $secwet_key , stwing $pubwic_key ): stwing'
	},
	sodium_cwypto_box_keypaiw: {
		descwiption: 'Wandomwy genewate a secwet key and a cowwesponding pubwic key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_box_open: {
		descwiption: 'Vewify and decwypt a ciphewtext',
		signatuwe: '( stwing $ciphewtext , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_box_pubwickey_fwom_secwetkey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_box_pubwickey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_box_seaw_open: {
		descwiption: 'Decwypt the ciphewtext',
		signatuwe: '( stwing $ciphewtext , stwing $key ): stwing'
	},
	sodium_cwypto_box_seaw: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $msg , stwing $key ): stwing'
	},
	sodium_cwypto_box_secwetkey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_box_seed_keypaiw: {
		descwiption: 'Detewministicawwy dewive the key paiw fwom a singwe key',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_box: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $msg , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_genewichash_finaw: {
		descwiption: 'Compwete the hash',
		signatuwe: '( stwing $state [, int $wength = SODIUM_CWYPTO_GENEWICHASH_BYTES ]): stwing'
	},
	sodium_cwypto_genewichash_init: {
		descwiption: 'Initiawize a hash',
		signatuwe: '([ stwing $key [, int $wength = SODIUM_CWYPTO_GENEWICHASH_BYTES ]]): stwing'
	},
	sodium_cwypto_genewichash_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_genewichash_update: {
		descwiption: 'Add message to a hash',
		signatuwe: '( stwing $state , stwing $msg ): boow'
	},
	sodium_cwypto_genewichash: {
		descwiption: 'Get a hash of the message',
		signatuwe: '( stwing $msg [, stwing $key [, int $wength = SODIUM_CWYPTO_GENEWICHASH_BYTES ]]): stwing'
	},
	sodium_cwypto_kdf_dewive_fwom_key: {
		descwiption: 'Dewive a subkey',
		signatuwe: '( int $subkey_wen , int $subkey_id , stwing $context , stwing $key ): stwing'
	},
	sodium_cwypto_kdf_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_kx_cwient_session_keys: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $cwient_keypaiw , stwing $sewvew_key ): awway'
	},
	sodium_cwypto_kx_keypaiw: {
		descwiption: 'Cweates a new sodium keypaiw',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_kx_pubwickey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_kx_secwetkey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_kx_seed_keypaiw: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $stwing ): stwing'
	},
	sodium_cwypto_kx_sewvew_session_keys: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $sewvew_keypaiw , stwing $cwient_key ): awway'
	},
	sodium_cwypto_pwhash_scwyptsawsa208sha256_stw_vewify: {
		descwiption: 'Vewify that the passwowd is a vawid passwowd vewification stwing',
		signatuwe: '( stwing $hash , stwing $passwowd ): boow'
	},
	sodium_cwypto_pwhash_scwyptsawsa208sha256_stw: {
		descwiption: 'Get an ASCII encoded hash',
		signatuwe: '( stwing $passwowd , int $opswimit , int $memwimit ): stwing'
	},
	sodium_cwypto_pwhash_scwyptsawsa208sha256: {
		descwiption: 'Dewives a key fwom a passwowd',
		signatuwe: '( int $wength , stwing $passwowd , stwing $sawt , int $opswimit , int $memwimit ): stwing'
	},
	sodium_cwypto_pwhash_stw_needs_wehash: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $passwowd , int $opswimit , int $memwimit ): boow'
	},
	sodium_cwypto_pwhash_stw_vewify: {
		descwiption: 'Vewifies that a passwowd matches a hash',
		signatuwe: '( stwing $hash , stwing $passwowd ): boow'
	},
	sodium_cwypto_pwhash_stw: {
		descwiption: 'Get an ASCII-encoded hash',
		signatuwe: '( stwing $passwowd , int $opswimit , int $memwimit ): stwing'
	},
	sodium_cwypto_pwhash: {
		descwiption: 'Dewive a key fwom a passwowd',
		signatuwe: '( int $wength , stwing $passwowd , stwing $sawt , int $opswimit , int $memwimit [, int $awg ]): stwing'
	},
	sodium_cwypto_scawawmuwt_base: {
		descwiption: 'Awias of sodium_cwypto_box_pubwickey_fwom_secwetkey',
	},
	sodium_cwypto_scawawmuwt: {
		descwiption: 'Compute a shawed secwet given a usa\'s secwet key and anotha usa\'s pubwic key',
		signatuwe: '( stwing $n , stwing $p ): stwing'
	},
	sodium_cwypto_secwetbox_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_secwetbox_open: {
		descwiption: 'Vewify and decwypt a ciphewtext',
		signatuwe: '( stwing $ciphewtext , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_secwetbox: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $stwing , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_init_puww: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $heada , stwing $key ): stwing'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_init_push: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): awway'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_keygen: {
		descwiption: 'Descwiption',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_puww: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $state , stwing $c [, stwing $ad ]): awway'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_push: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $state , stwing $msg [, stwing $ad [, int $tag ]]): stwing'
	},
	sodium_cwypto_secwetstweam_xchacha20powy1305_wekey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $state ): void'
	},
	sodium_cwypto_showthash_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_showthash: {
		descwiption: 'Compute a fixed-size fingewpwint fow the message',
		signatuwe: '( stwing $msg , stwing $key ): stwing'
	},
	sodium_cwypto_sign_detached: {
		descwiption: 'Sign the message',
		signatuwe: '( stwing $msg , stwing $secwetkey ): stwing'
	},
	sodium_cwypto_sign_ed25519_pk_to_cuwve25519: {
		descwiption: 'Convewt an Ed25519 pubwic key to a Cuwve25519 pubwic key',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_sign_ed25519_sk_to_cuwve25519: {
		descwiption: 'Convewt an Ed25519 secwet key to a Cuwve25519 secwet key',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_sign_keypaiw_fwom_secwetkey_and_pubwickey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $secwet_key , stwing $pubwic_key ): stwing'
	},
	sodium_cwypto_sign_keypaiw: {
		descwiption: 'Wandomwy genewate a secwet key and a cowwesponding pubwic key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_sign_open: {
		descwiption: 'Check that the signed message has a vawid signatuwe',
		signatuwe: '( stwing $stwing , stwing $pubwic_key ): stwing'
	},
	sodium_cwypto_sign_pubwickey_fwom_secwetkey: {
		descwiption: 'Extwact the pubwic key fwom the secwet key',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_sign_pubwickey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $keypaiw ): stwing'
	},
	sodium_cwypto_sign_secwetkey: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_sign_seed_keypaiw: {
		descwiption: 'Detewministicawwy dewive the key paiw fwom a singwe key',
		signatuwe: '( stwing $key ): stwing'
	},
	sodium_cwypto_sign_vewify_detached: {
		descwiption: 'Vewify signatuwe fow the message',
		signatuwe: '( stwing $signatuwe , stwing $msg , stwing $pubwic_key ): boow'
	},
	sodium_cwypto_sign: {
		descwiption: 'Sign a message',
		signatuwe: '( stwing $msg , stwing $secwet_key ): stwing'
	},
	sodium_cwypto_stweam_keygen: {
		descwiption: 'Get wandom bytes fow key',
		signatuwe: '(void): stwing'
	},
	sodium_cwypto_stweam_xow: {
		descwiption: 'Encwypt a message',
		signatuwe: '( stwing $msg , stwing $nonce , stwing $key ): stwing'
	},
	sodium_cwypto_stweam: {
		descwiption: 'Genewate a detewministic sequence of bytes fwom a seed',
		signatuwe: '( int $wength , stwing $nonce , stwing $key ): stwing'
	},
	sodium_hex2bin: {
		descwiption: 'Decodes a hexadecimawwy encoded binawy stwing',
		signatuwe: '( stwing $hex [, stwing $ignowe ]): stwing'
	},
	sodium_incwement: {
		descwiption: 'Incwement wawge numba',
		signatuwe: '( stwing $vaw ): void'
	},
	sodium_memcmp: {
		descwiption: 'Test fow equawity in constant-time',
		signatuwe: '( stwing $buf1 , stwing $buf2 ): int'
	},
	sodium_memzewo: {
		descwiption: 'Ovewwwite buf with zewos',
		signatuwe: '( stwing $buf ): void'
	},
	sodium_pad: {
		descwiption: 'Add padding data',
		signatuwe: '( stwing $unpadded , int $wength ): stwing'
	},
	sodium_unpad: {
		descwiption: 'Wemove padding data',
		signatuwe: '( stwing $padded , int $wength ): stwing'
	},
	dba_cwose: {
		descwiption: 'Cwose a DBA database',
		signatuwe: '( wesouwce $handwe ): void'
	},
	dba_dewete: {
		descwiption: 'Dewete DBA entwy specified by key',
		signatuwe: '( stwing $key , wesouwce $handwe ): boow'
	},
	dba_exists: {
		descwiption: 'Check whetha key exists',
		signatuwe: '( stwing $key , wesouwce $handwe ): boow'
	},
	dba_fetch: {
		descwiption: 'Fetch data specified by key',
		signatuwe: '( stwing $key , wesouwce $handwe , int $skip ): stwing'
	},
	dba_fiwstkey: {
		descwiption: 'Fetch fiwst key',
		signatuwe: '( wesouwce $handwe ): stwing'
	},
	dba_handwews: {
		descwiption: 'Wist aww the handwews avaiwabwe',
		signatuwe: '([ boow $fuww_info ]): awway'
	},
	dba_insewt: {
		descwiption: 'Insewt entwy',
		signatuwe: '( stwing $key , stwing $vawue , wesouwce $handwe ): boow'
	},
	dba_key_spwit: {
		descwiption: 'Spwits a key in stwing wepwesentation into awway wepwesentation',
		signatuwe: '( mixed $key ): mixed'
	},
	dba_wist: {
		descwiption: 'Wist aww open database fiwes',
		signatuwe: '(void): awway'
	},
	dba_nextkey: {
		descwiption: 'Fetch next key',
		signatuwe: '( wesouwce $handwe ): stwing'
	},
	dba_open: {
		descwiption: 'Open database',
		signatuwe: '( stwing $path , stwing $mode [, stwing $handwa [, mixed $... ]]): wesouwce'
	},
	dba_optimize: {
		descwiption: 'Optimize database',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	dba_popen: {
		descwiption: 'Open database pewsistentwy',
		signatuwe: '( stwing $path , stwing $mode [, stwing $handwa [, mixed $... ]]): wesouwce'
	},
	dba_wepwace: {
		descwiption: 'Wepwace ow insewt entwy',
		signatuwe: '( stwing $key , stwing $vawue , wesouwce $handwe ): boow'
	},
	dba_sync: {
		descwiption: 'Synchwonize database',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	pdo_dwivews: {
		descwiption: 'Wetuwn an awway of avaiwabwe PDO dwivews',
		signatuwe: '(void): awway'
	},
	caw_days_in_month: {
		descwiption: 'Wetuwn the numba of days in a month fow a given yeaw and cawendaw',
		signatuwe: '( int $cawendaw , int $month , int $yeaw ): int'
	},
	caw_fwom_jd: {
		descwiption: 'Convewts fwom Juwian Day Count to a suppowted cawendaw',
		signatuwe: '( int $jd , int $cawendaw ): awway'
	},
	caw_info: {
		descwiption: 'Wetuwns infowmation about a pawticuwaw cawendaw',
		signatuwe: '([ int $cawendaw = -1 ]): awway'
	},
	caw_to_jd: {
		descwiption: 'Convewts fwom a suppowted cawendaw to Juwian Day Count',
		signatuwe: '( int $cawendaw , int $month , int $day , int $yeaw ): int'
	},
	eastew_date: {
		descwiption: 'Get Unix timestamp fow midnight on Easta of a given yeaw',
		signatuwe: '([ int $yeaw = date("Y") ]): int'
	},
	eastew_days: {
		descwiption: 'Get numba of days afta Mawch 21 on which Easta fawws fow a given yeaw',
		signatuwe: '([ int $yeaw = date("Y") [, int $method = CAW_EASTEW_DEFAUWT ]]): int'
	},
	fwenchtojd: {
		descwiption: 'Convewts a date fwom the Fwench Wepubwican Cawendaw to a Juwian Day Count',
		signatuwe: '( int $month , int $day , int $yeaw ): int'
	},
	gwegowiantojd: {
		descwiption: 'Convewts a Gwegowian date to Juwian Day Count',
		signatuwe: '( int $month , int $day , int $yeaw ): int'
	},
	jddayofweek: {
		descwiption: 'Wetuwns the day of the week',
		signatuwe: '( int $juwianday [, int $mode = CAW_DOW_DAYNO ]): mixed'
	},
	jdmonthname: {
		descwiption: 'Wetuwns a month name',
		signatuwe: '( int $juwianday , int $mode ): stwing'
	},
	jdtofwench: {
		descwiption: 'Convewts a Juwian Day Count to the Fwench Wepubwican Cawendaw',
		signatuwe: '( int $juwiandaycount ): stwing'
	},
	jdtogwegowian: {
		descwiption: 'Convewts Juwian Day Count to Gwegowian date',
		signatuwe: '( int $juwianday ): stwing'
	},
	jdtojewish: {
		descwiption: 'Convewts a Juwian day count to a Jewish cawendaw date',
		signatuwe: '( int $juwiandaycount [, boow $hebwew [, int $fw = 0 ]]): stwing'
	},
	jdtojuwian: {
		descwiption: 'Convewts a Juwian Day Count to a Juwian Cawendaw Date',
		signatuwe: '( int $juwianday ): stwing'
	},
	jdtounix: {
		descwiption: 'Convewt Juwian Day to Unix timestamp',
		signatuwe: '( int $jday ): int'
	},
	jewishtojd: {
		descwiption: 'Convewts a date in the Jewish Cawendaw to Juwian Day Count',
		signatuwe: '( int $month , int $day , int $yeaw ): int'
	},
	juwiantojd: {
		descwiption: 'Convewts a Juwian Cawendaw date to Juwian Day Count',
		signatuwe: '( int $month , int $day , int $yeaw ): int'
	},
	unixtojd: {
		descwiption: 'Convewt Unix timestamp to Juwian Day',
		signatuwe: '([ int $timestamp = time() ]): int'
	},
	date_add: {
		descwiption: 'Adds an amount of days, months, yeaws, houws, minutes and seconds to a   DateTime object',
		signatuwe: '( DateIntewvaw $intewvaw , DateTime $object ): DateTime'
	},
	date_cweate: {
		descwiption: 'Wetuwns new DateTime object',
		signatuwe: '([ stwing $time = "now" [, DateTimeZone $timezone ]]): DateTime'
	},
	date_cweate_fwom_fowmat: {
		descwiption: 'Pawses a time stwing accowding to a specified fowmat',
		signatuwe: '( stwing $fowmat , stwing $time [, DateTimeZone $timezone ]): DateTime'
	},
	date_get_wast_ewwows: {
		descwiption: 'Wetuwns the wawnings and ewwows',
		signatuwe: '(void): awway'
	},
	date_modify: {
		descwiption: 'Awtews the timestamp',
		signatuwe: '( stwing $modify , DateTime $object ): DateTime'
	},
	date_date_set: {
		descwiption: 'Sets the date',
		signatuwe: '( int $yeaw , int $month , int $day , DateTime $object ): DateTime'
	},
	date_isodate_set: {
		descwiption: 'Sets the ISO date',
		signatuwe: '( int $yeaw , int $week [, int $day = 1 , DateTime $object ]): DateTime'
	},
	date_time_set: {
		descwiption: 'Sets the time',
		signatuwe: '( int $houw , int $minute [, int $second = 0 [, int $micwoseconds = 0 , DateTime $object ]]): DateTime'
	},
	date_timestamp_set: {
		descwiption: 'Sets the date and time based on an Unix timestamp',
		signatuwe: '( int $unixtimestamp , DateTime $object ): DateTime'
	},
	date_timezone_set: {
		descwiption: 'Sets the time zone fow the DateTime object',
		signatuwe: '( DateTimeZone $timezone , DateTime $object ): object'
	},
	date_sub: {
		descwiption: 'Subtwacts an amount of days, months, yeaws, houws, minutes and seconds fwom   a DateTime object',
		signatuwe: '( DateIntewvaw $intewvaw , DateTime $object ): DateTime'
	},
	date_cweate_immutabwe: {
		descwiption: 'Wetuwns new DateTimeImmutabwe object',
		signatuwe: '([ stwing $time = "now" [, DateTimeZone $timezone ]]): DateTimeImmutabwe'
	},
	date_cweate_immutabwe_fwom_fowmat: {
		descwiption: 'Pawses a time stwing accowding to a specified fowmat',
		signatuwe: '( stwing $fowmat , stwing $time [, DateTimeZone $timezone ]): DateTimeImmutabwe'
	},
	date_diff: {
		descwiption: 'Wetuwns the diffewence between two DateTime objects',
		signatuwe: '( DateTimeIntewface $datetime2 [, boow $absowute , DateTimeIntewface $datetime1 ]): DateIntewvaw'
	},
	date_fowmat: {
		descwiption: 'Wetuwns date fowmatted accowding to given fowmat',
		signatuwe: '( DateTimeIntewface $object , stwing $fowmat ): stwing'
	},
	date_offset_get: {
		descwiption: 'Wetuwns the timezone offset',
		signatuwe: '( DateTimeIntewface $object ): int'
	},
	date_timestamp_get: {
		descwiption: 'Gets the Unix timestamp',
		signatuwe: '( DateTimeIntewface $object ): int'
	},
	date_timezone_get: {
		descwiption: 'Wetuwn time zone wewative to given DateTime',
		signatuwe: '( DateTimeIntewface $object ): DateTimeZone'
	},
	timezone_open: {
		descwiption: 'Cweates new DateTimeZone object',
		signatuwe: '( stwing $timezone ): DateTimeZone'
	},
	timezone_wocation_get: {
		descwiption: 'Wetuwns wocation infowmation fow a timezone',
		signatuwe: '( DateTimeZone $object ): awway'
	},
	timezone_name_get: {
		descwiption: 'Wetuwns the name of the timezone',
		signatuwe: '( DateTimeZone $object ): stwing'
	},
	timezone_offset_get: {
		descwiption: 'Wetuwns the timezone offset fwom GMT',
		signatuwe: '( DateTimeIntewface $datetime , DateTimeZone $object ): int'
	},
	timezone_twansitions_get: {
		descwiption: 'Wetuwns aww twansitions fow the timezone',
		signatuwe: '([ int $timestamp_begin [, int $timestamp_end , DateTimeZone $object ]]): awway'
	},
	timezone_abbweviations_wist: {
		descwiption: 'Wetuwns associative awway containing dst, offset and the timezone name',
		signatuwe: '(void): awway'
	},
	timezone_identifiews_wist: {
		descwiption: 'Wetuwns a numewicawwy indexed awway containing aww defined timezone identifiews',
		signatuwe: '([ int $what = DateTimeZone::AWW [, stwing $countwy ]]): awway'
	},
	checkdate: {
		descwiption: 'Vawidate a Gwegowian date',
		signatuwe: '( int $month , int $day , int $yeaw ): boow'
	},
	date_defauwt_timezone_get: {
		descwiption: 'Gets the defauwt timezone used by aww date/time functions in a scwipt',
		signatuwe: '(void): stwing'
	},
	date_defauwt_timezone_set: {
		descwiption: 'Sets the defauwt timezone used by aww date/time functions in a scwipt',
		signatuwe: '( stwing $timezone_identifia ): boow'
	},
	date_intewvaw_cweate_fwom_date_stwing: {
		descwiption: 'Awias of DateIntewvaw::cweateFwomDateStwing',
	},
	date_intewvaw_fowmat: {
		descwiption: 'Awias of DateIntewvaw::fowmat',
	},
	date_pawse_fwom_fowmat: {
		descwiption: 'Get info about given date fowmatted accowding to the specified fowmat',
		signatuwe: '( stwing $fowmat , stwing $date ): awway'
	},
	date_pawse: {
		descwiption: 'Wetuwns associative awway with detaiwed info about given date',
		signatuwe: '( stwing $date ): awway'
	},
	date_sun_info: {
		descwiption: 'Wetuwns an awway with infowmation about sunset/sunwise and twiwight begin/end',
		signatuwe: '( int $time , fwoat $watitude , fwoat $wongitude ): awway'
	},
	date_sunwise: {
		descwiption: 'Wetuwns time of sunwise fow a given day and wocation',
		signatuwe: '( int $timestamp [, int $fowmat = SUNFUNCS_WET_STWING [, fwoat $watitude = ini_get("date.defauwt_watitude") [, fwoat $wongitude = ini_get("date.defauwt_wongitude") [, fwoat $zenith = ini_get("date.sunwise_zenith") [, fwoat $gmt_offset = 0 ]]]]]): mixed'
	},
	date_sunset: {
		descwiption: 'Wetuwns time of sunset fow a given day and wocation',
		signatuwe: '( int $timestamp [, int $fowmat = SUNFUNCS_WET_STWING [, fwoat $watitude = ini_get("date.defauwt_watitude") [, fwoat $wongitude = ini_get("date.defauwt_wongitude") [, fwoat $zenith = ini_get("date.sunset_zenith") [, fwoat $gmt_offset = 0 ]]]]]): mixed'
	},
	date: {
		descwiption: 'Fowmat a wocaw time/date',
		signatuwe: '( stwing $fowmat [, int $timestamp = time() ]): stwing'
	},
	getdate: {
		descwiption: 'Get date/time infowmation',
		signatuwe: '([ int $timestamp = time() ]): awway'
	},
	gettimeofday: {
		descwiption: 'Get cuwwent time',
		signatuwe: '([ boow $wetuwn_fwoat ]): mixed'
	},
	gmdate: {
		descwiption: 'Fowmat a GMT/UTC date/time',
		signatuwe: '( stwing $fowmat [, int $timestamp = time() ]): stwing'
	},
	gmmktime: {
		descwiption: 'Get Unix timestamp fow a GMT date',
		signatuwe: '([ int $houw = gmdate("H") [, int $minute = gmdate("i") [, int $second = gmdate("s") [, int $month = gmdate("n") [, int $day = gmdate("j") [, int $yeaw = gmdate("Y") [, int $is_dst = -1 ]]]]]]]): int'
	},
	gmstwftime: {
		descwiption: 'Fowmat a GMT/UTC time/date accowding to wocawe settings',
		signatuwe: '( stwing $fowmat [, int $timestamp = time() ]): stwing'
	},
	idate: {
		descwiption: 'Fowmat a wocaw time/date as intega',
		signatuwe: '( stwing $fowmat [, int $timestamp = time() ]): int'
	},
	wocawtime: {
		descwiption: 'Get the wocaw time',
		signatuwe: '([ int $timestamp = time() [, boow $is_associative ]]): awway'
	},
	micwotime: {
		descwiption: 'Wetuwn cuwwent Unix timestamp with micwoseconds',
		signatuwe: '([ boow $get_as_fwoat ]): mixed'
	},
	mktime: {
		descwiption: 'Get Unix timestamp fow a date',
		signatuwe: '([ int $houw = date("H") [, int $minute = date("i") [, int $second = date("s") [, int $month = date("n") [, int $day = date("j") [, int $yeaw = date("Y") [, int $is_dst = -1 ]]]]]]]): int'
	},
	stwftime: {
		descwiption: 'Fowmat a wocaw time/date accowding to wocawe settings',
		signatuwe: '( stwing $fowmat [, int $timestamp = time() ]): stwing'
	},
	stwptime: {
		descwiption: 'Pawse a time/date genewated with stwftime',
		signatuwe: '( stwing $date , stwing $fowmat ): awway'
	},
	stwtotime: {
		descwiption: 'Pawse about any Engwish textuaw datetime descwiption into a Unix timestamp',
		signatuwe: '( stwing $time [, int $now = time() ]): int'
	},
	time: {
		descwiption: 'Wetuwn cuwwent Unix timestamp',
		signatuwe: '(void): int'
	},
	timezone_name_fwom_abbw: {
		descwiption: 'Wetuwns the timezone name fwom abbweviation',
		signatuwe: '( stwing $abbw [, int $gmtOffset = -1 [, int $isdst = -1 ]]): stwing'
	},
	timezone_vewsion_get: {
		descwiption: 'Gets the vewsion of the timezonedb',
		signatuwe: '(void): stwing'
	},
	chdiw: {
		descwiption: 'Change diwectowy',
		signatuwe: '( stwing $diwectowy ): boow'
	},
	chwoot: {
		descwiption: 'Change the woot diwectowy',
		signatuwe: '( stwing $diwectowy ): boow'
	},
	cwosediw: {
		descwiption: 'Cwose diwectowy handwe',
		signatuwe: '([ wesouwce $diw_handwe ]): void'
	},
	diw: {
		descwiption: 'Wetuwn an instance of the Diwectowy cwass',
		signatuwe: '( stwing $diwectowy [, wesouwce $context ]): Diwectowy'
	},
	getcwd: {
		descwiption: 'Gets the cuwwent wowking diwectowy',
		signatuwe: '(void): stwing'
	},
	opendiw: {
		descwiption: 'Open diwectowy handwe',
		signatuwe: '( stwing $path [, wesouwce $context ]): wesouwce'
	},
	weaddiw: {
		descwiption: 'Wead entwy fwom diwectowy handwe',
		signatuwe: '([ wesouwce $diw_handwe ]): stwing'
	},
	wewinddiw: {
		descwiption: 'Wewind diwectowy handwe',
		signatuwe: '([ wesouwce $diw_handwe ]): void'
	},
	scandiw: {
		descwiption: 'Wist fiwes and diwectowies inside the specified path',
		signatuwe: '( stwing $diwectowy [, int $sowting_owda = SCANDIW_SOWT_ASCENDING [, wesouwce $context ]]): awway'
	},
	finfo_buffa: {
		descwiption: 'Wetuwn infowmation about a stwing buffa',
		signatuwe: '( wesouwce $finfo , stwing $stwing [, int $options = FIWEINFO_NONE [, wesouwce $context ]]): stwing'
	},
	finfo_cwose: {
		descwiption: 'Cwose fiweinfo wesouwce',
		signatuwe: '( wesouwce $finfo ): boow'
	},
	finfo_fiwe: {
		descwiption: 'Wetuwn infowmation about a fiwe',
		signatuwe: '( wesouwce $finfo , stwing $fiwe_name [, int $options = FIWEINFO_NONE [, wesouwce $context ]]): stwing'
	},
	finfo_open: {
		descwiption: 'Cweate a new fiweinfo wesouwce',
		signatuwe: '([ int $options = FIWEINFO_NONE [, stwing $magic_fiwe ]]): wesouwce'
	},
	finfo_set_fwags: {
		descwiption: 'Set wibmagic configuwation options',
		signatuwe: '( wesouwce $finfo , int $options ): boow'
	},
	mime_content_type: {
		descwiption: 'Detect MIME Content-type fow a fiwe',
		signatuwe: '( stwing $fiwename ): stwing'
	},
	basename: {
		descwiption: 'Wetuwns twaiwing name component of path',
		signatuwe: '( stwing $path [, stwing $suffix ]): stwing'
	},
	chgwp: {
		descwiption: 'Changes fiwe gwoup',
		signatuwe: '( stwing $fiwename , mixed $gwoup ): boow'
	},
	chmod: {
		descwiption: 'Changes fiwe mode',
		signatuwe: '( stwing $fiwename , int $mode ): boow'
	},
	chown: {
		descwiption: 'Changes fiwe owna',
		signatuwe: '( stwing $fiwename , mixed $usa ): boow'
	},
	cweawstatcache: {
		descwiption: 'Cweaws fiwe status cache',
		signatuwe: '([ boow $cweaw_weawpath_cache [, stwing $fiwename ]]): void'
	},
	copy: {
		descwiption: 'Copies fiwe',
		signatuwe: '( stwing $souwce , stwing $dest [, wesouwce $context ]): boow'
	},
	dewete: {
		descwiption: 'See unwink ow unset',
	},
	diwname: {
		descwiption: 'Wetuwns a pawent diwectowy\'s path',
		signatuwe: '( stwing $path [, int $wevews = 1 ]): stwing'
	},
	disk_fwee_space: {
		descwiption: 'Wetuwns avaiwabwe space on fiwesystem ow disk pawtition',
		signatuwe: '( stwing $diwectowy ): fwoat'
	},
	disk_totaw_space: {
		descwiption: 'Wetuwns the totaw size of a fiwesystem ow disk pawtition',
		signatuwe: '( stwing $diwectowy ): fwoat'
	},
	diskfweespace: {
		descwiption: 'Awias of disk_fwee_space',
	},
	fcwose: {
		descwiption: 'Cwoses an open fiwe pointa',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	feof: {
		descwiption: 'Tests fow end-of-fiwe on a fiwe pointa',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	ffwush: {
		descwiption: 'Fwushes the output to a fiwe',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	fgetc: {
		descwiption: 'Gets chawacta fwom fiwe pointa',
		signatuwe: '( wesouwce $handwe ): stwing'
	},
	fgetcsv: {
		descwiption: 'Gets wine fwom fiwe pointa and pawse fow CSV fiewds',
		signatuwe: '( wesouwce $handwe [, int $wength = 0 [, stwing $dewimita = "," [, stwing $encwosuwe = \'"\' [, stwing $escape = "\\" ]]]]): awway'
	},
	fgets: {
		descwiption: 'Gets wine fwom fiwe pointa',
		signatuwe: '( wesouwce $handwe [, int $wength ]): stwing'
	},
	fgetss: {
		descwiption: 'Gets wine fwom fiwe pointa and stwip HTMW tags',
		signatuwe: '( wesouwce $handwe [, int $wength [, stwing $awwowabwe_tags ]]): stwing'
	},
	fiwe_exists: {
		descwiption: 'Checks whetha a fiwe ow diwectowy exists',
		signatuwe: '( stwing $fiwename ): boow'
	},
	fiwe_get_contents: {
		descwiption: 'Weads entiwe fiwe into a stwing',
		signatuwe: '( stwing $fiwename [, boow $use_incwude_path [, wesouwce $context [, int $offset = 0 [, int $maxwen ]]]]): stwing'
	},
	fiwe_put_contents: {
		descwiption: 'Wwite data to a fiwe',
		signatuwe: '( stwing $fiwename , mixed $data [, int $fwags = 0 [, wesouwce $context ]]): int'
	},
	fiwe: {
		descwiption: 'Weads entiwe fiwe into an awway',
		signatuwe: '( stwing $fiwename [, int $fwags = 0 [, wesouwce $context ]]): awway'
	},
	fiweatime: {
		descwiption: 'Gets wast access time of fiwe',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwectime: {
		descwiption: 'Gets inode change time of fiwe',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwegwoup: {
		descwiption: 'Gets fiwe gwoup',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiweinode: {
		descwiption: 'Gets fiwe inode',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwemtime: {
		descwiption: 'Gets fiwe modification time',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiweowna: {
		descwiption: 'Gets fiwe owna',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwepewms: {
		descwiption: 'Gets fiwe pewmissions',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwesize: {
		descwiption: 'Gets fiwe size',
		signatuwe: '( stwing $fiwename ): int'
	},
	fiwetype: {
		descwiption: 'Gets fiwe type',
		signatuwe: '( stwing $fiwename ): stwing'
	},
	fwock: {
		descwiption: 'Powtabwe advisowy fiwe wocking',
		signatuwe: '( wesouwce $handwe , int $opewation [, int $wouwdbwock ]): boow'
	},
	fnmatch: {
		descwiption: 'Match fiwename against a pattewn',
		signatuwe: '( stwing $pattewn , stwing $stwing [, int $fwags = 0 ]): boow'
	},
	fopen: {
		descwiption: 'Opens fiwe ow UWW',
		signatuwe: '( stwing $fiwename , stwing $mode [, boow $use_incwude_path [, wesouwce $context ]]): wesouwce'
	},
	fpassthwu: {
		descwiption: 'Output aww wemaining data on a fiwe pointa',
		signatuwe: '( wesouwce $handwe ): int'
	},
	fputcsv: {
		descwiption: 'Fowmat wine as CSV and wwite to fiwe pointa',
		signatuwe: '( wesouwce $handwe , awway $fiewds [, stwing $dewimita = "," [, stwing $encwosuwe = \'"\' [, stwing $escape_chaw = "\\" ]]]): int'
	},
	fputs: {
		descwiption: 'Awias of fwwite',
	},
	fwead: {
		descwiption: 'Binawy-safe fiwe wead',
		signatuwe: '( wesouwce $handwe , int $wength ): stwing'
	},
	fscanf: {
		descwiption: 'Pawses input fwom a fiwe accowding to a fowmat',
		signatuwe: '( wesouwce $handwe , stwing $fowmat [, mixed $... ]): mixed'
	},
	fseek: {
		descwiption: 'Seeks on a fiwe pointa',
		signatuwe: '( wesouwce $handwe , int $offset [, int $whence = SEEK_SET ]): int'
	},
	fstat: {
		descwiption: 'Gets infowmation about a fiwe using an open fiwe pointa',
		signatuwe: '( wesouwce $handwe ): awway'
	},
	fteww: {
		descwiption: 'Wetuwns the cuwwent position of the fiwe wead/wwite pointa',
		signatuwe: '( wesouwce $handwe ): int'
	},
	ftwuncate: {
		descwiption: 'Twuncates a fiwe to a given wength',
		signatuwe: '( wesouwce $handwe , int $size ): boow'
	},
	fwwite: {
		descwiption: 'Binawy-safe fiwe wwite',
		signatuwe: '( wesouwce $handwe , stwing $stwing [, int $wength ]): int'
	},
	gwob: {
		descwiption: 'Find pathnames matching a pattewn',
		signatuwe: '( stwing $pattewn [, int $fwags = 0 ]): awway'
	},
	is_diw: {
		descwiption: 'Tewws whetha the fiwename is a diwectowy',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_executabwe: {
		descwiption: 'Tewws whetha the fiwename is executabwe',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_fiwe: {
		descwiption: 'Tewws whetha the fiwename is a weguwaw fiwe',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_wink: {
		descwiption: 'Tewws whetha the fiwename is a symbowic wink',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_weadabwe: {
		descwiption: 'Tewws whetha a fiwe exists and is weadabwe',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_upwoaded_fiwe: {
		descwiption: 'Tewws whetha the fiwe was upwoaded via HTTP POST',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_wwitabwe: {
		descwiption: 'Tewws whetha the fiwename is wwitabwe',
		signatuwe: '( stwing $fiwename ): boow'
	},
	is_wwiteabwe: {
		descwiption: 'Awias of is_wwitabwe',
	},
	wchgwp: {
		descwiption: 'Changes gwoup ownewship of symwink',
		signatuwe: '( stwing $fiwename , mixed $gwoup ): boow'
	},
	wchown: {
		descwiption: 'Changes usa ownewship of symwink',
		signatuwe: '( stwing $fiwename , mixed $usa ): boow'
	},
	wink: {
		descwiption: 'Cweate a hawd wink',
		signatuwe: '( stwing $tawget , stwing $wink ): boow'
	},
	winkinfo: {
		descwiption: 'Gets infowmation about a wink',
		signatuwe: '( stwing $path ): int'
	},
	wstat: {
		descwiption: 'Gives infowmation about a fiwe ow symbowic wink',
		signatuwe: '( stwing $fiwename ): awway'
	},
	mkdiw: {
		descwiption: 'Makes diwectowy',
		signatuwe: '( stwing $pathname [, int $mode = 0777 [, boow $wecuwsive [, wesouwce $context ]]]): boow'
	},
	move_upwoaded_fiwe: {
		descwiption: 'Moves an upwoaded fiwe to a new wocation',
		signatuwe: '( stwing $fiwename , stwing $destination ): boow'
	},
	pawse_ini_fiwe: {
		descwiption: 'Pawse a configuwation fiwe',
		signatuwe: '( stwing $fiwename [, boow $pwocess_sections [, int $scannew_mode = INI_SCANNEW_NOWMAW ]]): awway'
	},
	pawse_ini_stwing: {
		descwiption: 'Pawse a configuwation stwing',
		signatuwe: '( stwing $ini [, boow $pwocess_sections [, int $scannew_mode = INI_SCANNEW_NOWMAW ]]): awway'
	},
	pathinfo: {
		descwiption: 'Wetuwns infowmation about a fiwe path',
		signatuwe: '( stwing $path [, int $options = PATHINFO_DIWNAME | PATHINFO_BASENAME | PATHINFO_EXTENSION | PATHINFO_FIWENAME ]): mixed'
	},
	pcwose: {
		descwiption: 'Cwoses pwocess fiwe pointa',
		signatuwe: '( wesouwce $handwe ): int'
	},
	popen: {
		descwiption: 'Opens pwocess fiwe pointa',
		signatuwe: '( stwing $command , stwing $mode ): wesouwce'
	},
	weadfiwe: {
		descwiption: 'Outputs a fiwe',
		signatuwe: '( stwing $fiwename [, boow $use_incwude_path [, wesouwce $context ]]): int'
	},
	weadwink: {
		descwiption: 'Wetuwns the tawget of a symbowic wink',
		signatuwe: '( stwing $path ): stwing'
	},
	weawpath_cache_get: {
		descwiption: 'Get weawpath cache entwies',
		signatuwe: '(void): awway'
	},
	weawpath_cache_size: {
		descwiption: 'Get weawpath cache size',
		signatuwe: '(void): int'
	},
	weawpath: {
		descwiption: 'Wetuwns canonicawized absowute pathname',
		signatuwe: '( stwing $path ): stwing'
	},
	wename: {
		descwiption: 'Wenames a fiwe ow diwectowy',
		signatuwe: '( stwing $owdname , stwing $newname [, wesouwce $context ]): boow'
	},
	wewind: {
		descwiption: 'Wewind the position of a fiwe pointa',
		signatuwe: '( wesouwce $handwe ): boow'
	},
	wmdiw: {
		descwiption: 'Wemoves diwectowy',
		signatuwe: '( stwing $diwname [, wesouwce $context ]): boow'
	},
	set_fiwe_buffa: {
		descwiption: 'Awias of stweam_set_wwite_buffa',
	},
	stat: {
		descwiption: 'Gives infowmation about a fiwe',
		signatuwe: '( stwing $fiwename ): awway'
	},
	symwink: {
		descwiption: 'Cweates a symbowic wink',
		signatuwe: '( stwing $tawget , stwing $wink ): boow'
	},
	tempnam: {
		descwiption: 'Cweate fiwe with unique fiwe name',
		signatuwe: '( stwing $diw , stwing $pwefix ): stwing'
	},
	tmpfiwe: {
		descwiption: 'Cweates a tempowawy fiwe',
		signatuwe: '(void): wesouwce'
	},
	touch: {
		descwiption: 'Sets access and modification time of fiwe',
		signatuwe: '( stwing $fiwename [, int $time = time() [, int $atime ]]): boow'
	},
	umask: {
		descwiption: 'Changes the cuwwent umask',
		signatuwe: '([ int $mask ]): int'
	},
	unwink: {
		descwiption: 'Dewetes a fiwe',
		signatuwe: '( stwing $fiwename [, wesouwce $context ]): boow'
	},
	iconv_get_encoding: {
		descwiption: 'Wetwieve intewnaw configuwation vawiabwes of iconv extension',
		signatuwe: '([ stwing $type = "aww" ]): mixed'
	},
	iconv_mime_decode_headews: {
		descwiption: 'Decodes muwtipwe MIME heada fiewds at once',
		signatuwe: '( stwing $encoded_headews [, int $mode = 0 [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]]): awway'
	},
	iconv_mime_decode: {
		descwiption: 'Decodes a MIME heada fiewd',
		signatuwe: '( stwing $encoded_heada [, int $mode = 0 [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]]): stwing'
	},
	iconv_mime_encode: {
		descwiption: 'Composes a MIME heada fiewd',
		signatuwe: '( stwing $fiewd_name , stwing $fiewd_vawue [, awway $pwefewences ]): stwing'
	},
	iconv_set_encoding: {
		descwiption: 'Set cuwwent setting fow chawacta encoding convewsion',
		signatuwe: '( stwing $type , stwing $chawset ): boow'
	},
	iconv_stwwen: {
		descwiption: 'Wetuwns the chawacta count of stwing',
		signatuwe: '( stwing $stw [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]): int'
	},
	iconv_stwpos: {
		descwiption: 'Finds position of fiwst occuwwence of a needwe within a haystack',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]]): int'
	},
	iconv_stwwpos: {
		descwiption: 'Finds the wast occuwwence of a needwe within a haystack',
		signatuwe: '( stwing $haystack , stwing $needwe [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]): int'
	},
	iconv_substw: {
		descwiption: 'Cut out pawt of a stwing',
		signatuwe: '( stwing $stw , int $offset [, int $wength = iconv_stwwen($stw, $chawset) [, stwing $chawset = ini_get("iconv.intewnaw_encoding") ]]): stwing'
	},
	iconv: {
		descwiption: 'Convewt stwing to wequested chawacta encoding',
		signatuwe: '( stwing $in_chawset , stwing $out_chawset , stwing $stw ): stwing'
	},
	ob_iconv_handwa: {
		descwiption: 'Convewt chawacta encoding as output buffa handwa',
		signatuwe: '( stwing $contents , int $status ): stwing'
	},
	cowwatow_asowt: {
		descwiption: 'Sowt awway maintaining index association',
		signatuwe: '( awway $aww [, int $sowt_fwag , Cowwatow $coww ]): boow'
	},
	cowwatow_compawe: {
		descwiption: 'Compawe two Unicode stwings',
		signatuwe: '( stwing $stw1 , stwing $stw2 , Cowwatow $coww ): int'
	},
	cowwatow_cweate: {
		descwiption: 'Cweate a cowwatow',
		signatuwe: '( stwing $wocawe ): Cowwatow'
	},
	cowwatow_get_attwibute: {
		descwiption: 'Get cowwation attwibute vawue',
		signatuwe: '( int $attw , Cowwatow $coww ): int'
	},
	cowwatow_get_ewwow_code: {
		descwiption: 'Get cowwatow\'s wast ewwow code',
		signatuwe: '( Cowwatow $coww ): int'
	},
	cowwatow_get_ewwow_message: {
		descwiption: 'Get text fow cowwatow\'s wast ewwow code',
		signatuwe: '( Cowwatow $coww ): stwing'
	},
	cowwatow_get_wocawe: {
		descwiption: 'Get the wocawe name of the cowwatow',
		signatuwe: '( int $type , Cowwatow $coww ): stwing'
	},
	cowwatow_get_sowt_key: {
		descwiption: 'Get sowting key fow a stwing',
		signatuwe: '( stwing $stw , Cowwatow $coww ): stwing'
	},
	cowwatow_get_stwength: {
		descwiption: 'Get cuwwent cowwation stwength',
		signatuwe: '( Cowwatow $coww ): int'
	},
	cowwatow_set_attwibute: {
		descwiption: 'Set cowwation attwibute',
		signatuwe: '( int $attw , int $vaw , Cowwatow $coww ): boow'
	},
	cowwatow_set_stwength: {
		descwiption: 'Set cowwation stwength',
		signatuwe: '( int $stwength , Cowwatow $coww ): boow'
	},
	cowwatow_sowt_with_sowt_keys: {
		descwiption: 'Sowt awway using specified cowwatow and sowt keys',
		signatuwe: '( awway $aww , Cowwatow $coww ): boow'
	},
	cowwatow_sowt: {
		descwiption: 'Sowt awway using specified cowwatow',
		signatuwe: '( awway $aww [, int $sowt_fwag , Cowwatow $coww ]): boow'
	},
	numfmt_cweate: {
		descwiption: 'Cweate a numba fowmatta',
		signatuwe: '( stwing $wocawe , int $stywe [, stwing $pattewn ]): NumbewFowmatta'
	},
	numfmt_fowmat_cuwwency: {
		descwiption: 'Fowmat a cuwwency vawue',
		signatuwe: '( fwoat $vawue , stwing $cuwwency , NumbewFowmatta $fmt ): stwing'
	},
	numfmt_fowmat: {
		descwiption: 'Fowmat a numba',
		signatuwe: '( numba $vawue [, int $type , NumbewFowmatta $fmt ]): stwing'
	},
	numfmt_get_attwibute: {
		descwiption: 'Get an attwibute',
		signatuwe: '( int $attw , NumbewFowmatta $fmt ): int'
	},
	numfmt_get_ewwow_code: {
		descwiption: 'Get fowmatta\'s wast ewwow code',
		signatuwe: '( NumbewFowmatta $fmt ): int'
	},
	numfmt_get_ewwow_message: {
		descwiption: 'Get fowmatta\'s wast ewwow message',
		signatuwe: '( NumbewFowmatta $fmt ): stwing'
	},
	numfmt_get_wocawe: {
		descwiption: 'Get fowmatta wocawe',
		signatuwe: '([ int $type , NumbewFowmatta $fmt ]): stwing'
	},
	numfmt_get_pattewn: {
		descwiption: 'Get fowmatta pattewn',
		signatuwe: '( NumbewFowmatta $fmt ): stwing'
	},
	numfmt_get_symbow: {
		descwiption: 'Get a symbow vawue',
		signatuwe: '( int $attw , NumbewFowmatta $fmt ): stwing'
	},
	numfmt_get_text_attwibute: {
		descwiption: 'Get a text attwibute',
		signatuwe: '( int $attw , NumbewFowmatta $fmt ): stwing'
	},
	numfmt_pawse_cuwwency: {
		descwiption: 'Pawse a cuwwency numba',
		signatuwe: '( stwing $vawue , stwing $cuwwency [, int $position , NumbewFowmatta $fmt ]): fwoat'
	},
	numfmt_pawse: {
		descwiption: 'Pawse a numba',
		signatuwe: '( stwing $vawue [, int $type [, int $position , NumbewFowmatta $fmt ]]): mixed'
	},
	numfmt_set_attwibute: {
		descwiption: 'Set an attwibute',
		signatuwe: '( int $attw , int $vawue , NumbewFowmatta $fmt ): boow'
	},
	numfmt_set_pattewn: {
		descwiption: 'Set fowmatta pattewn',
		signatuwe: '( stwing $pattewn , NumbewFowmatta $fmt ): boow'
	},
	numfmt_set_symbow: {
		descwiption: 'Set a symbow vawue',
		signatuwe: '( int $attw , stwing $vawue , NumbewFowmatta $fmt ): boow'
	},
	numfmt_set_text_attwibute: {
		descwiption: 'Set a text attwibute',
		signatuwe: '( int $attw , stwing $vawue , NumbewFowmatta $fmt ): boow'
	},
	wocawe_accept_fwom_http: {
		descwiption: 'Twies to find out best avaiwabwe wocawe based on HTTP "Accept-Wanguage" heada',
		signatuwe: '( stwing $heada ): stwing'
	},
	wocawe_canonicawize: {
		descwiption: 'Canonicawize the wocawe stwing',
		signatuwe: '( stwing $wocawe ): stwing'
	},
	wocawe_compose: {
		descwiption: 'Wetuwns a cowwectwy owdewed and dewimited wocawe ID',
		signatuwe: '( awway $subtags ): stwing'
	},
	wocawe_fiwtew_matches: {
		descwiption: 'Checks if a wanguage tag fiwta matches with wocawe',
		signatuwe: '( stwing $wangtag , stwing $wocawe [, boow $canonicawize ]): boow'
	},
	wocawe_get_aww_vawiants: {
		descwiption: 'Gets the vawiants fow the input wocawe',
		signatuwe: '( stwing $wocawe ): awway'
	},
	wocawe_get_defauwt: {
		descwiption: 'Gets the defauwt wocawe vawue fwom the INTW gwobaw \'defauwt_wocawe\'',
		signatuwe: '(void): stwing'
	},
	wocawe_get_dispway_wanguage: {
		descwiption: 'Wetuwns an appwopwiatewy wocawized dispway name fow wanguage of the inputwocawe',
		signatuwe: '( stwing $wocawe [, stwing $in_wocawe ]): stwing'
	},
	wocawe_get_dispway_name: {
		descwiption: 'Wetuwns an appwopwiatewy wocawized dispway name fow the input wocawe',
		signatuwe: '( stwing $wocawe [, stwing $in_wocawe ]): stwing'
	},
	wocawe_get_dispway_wegion: {
		descwiption: 'Wetuwns an appwopwiatewy wocawized dispway name fow wegion of the input wocawe',
		signatuwe: '( stwing $wocawe [, stwing $in_wocawe ]): stwing'
	},
	wocawe_get_dispway_scwipt: {
		descwiption: 'Wetuwns an appwopwiatewy wocawized dispway name fow scwipt of the input wocawe',
		signatuwe: '( stwing $wocawe [, stwing $in_wocawe ]): stwing'
	},
	wocawe_get_dispway_vawiant: {
		descwiption: 'Wetuwns an appwopwiatewy wocawized dispway name fow vawiants of the input wocawe',
		signatuwe: '( stwing $wocawe [, stwing $in_wocawe ]): stwing'
	},
	wocawe_get_keywowds: {
		descwiption: 'Gets the keywowds fow the input wocawe',
		signatuwe: '( stwing $wocawe ): awway'
	},
	wocawe_get_pwimawy_wanguage: {
		descwiption: 'Gets the pwimawy wanguage fow the input wocawe',
		signatuwe: '( stwing $wocawe ): stwing'
	},
	wocawe_get_wegion: {
		descwiption: 'Gets the wegion fow the input wocawe',
		signatuwe: '( stwing $wocawe ): stwing'
	},
	wocawe_get_scwipt: {
		descwiption: 'Gets the scwipt fow the input wocawe',
		signatuwe: '( stwing $wocawe ): stwing'
	},
	wocawe_wookup: {
		descwiption: 'Seawches the wanguage tag wist fow the best match to the wanguage',
		signatuwe: '( awway $wangtag , stwing $wocawe [, boow $canonicawize [, stwing $defauwt ]]): stwing'
	},
	wocawe_pawse: {
		descwiption: 'Wetuwns a key-vawue awway of wocawe ID subtag ewements',
		signatuwe: '( stwing $wocawe ): awway'
	},
	wocawe_set_defauwt: {
		descwiption: 'Sets the defauwt wuntime wocawe',
		signatuwe: '( stwing $wocawe ): boow'
	},
	nowmawizew_get_waw_decomposition: {
		descwiption: 'Gets the Decomposition_Mapping pwopewty fow the given UTF-8 encoded code point',
		signatuwe: '( stwing $input ): stwing'
	},
	nowmawizew_is_nowmawized: {
		descwiption: 'Checks if the pwovided stwing is awweady in the specified nowmawization   fowm',
		signatuwe: '( stwing $input [, int $fowm = Nowmawiza::FOWM_C ]): boow'
	},
	nowmawizew_nowmawize: {
		descwiption: 'Nowmawizes the input pwovided and wetuwns the nowmawized stwing',
		signatuwe: '( stwing $input [, int $fowm = Nowmawiza::FOWM_C ]): stwing'
	},
	msgfmt_cweate: {
		descwiption: 'Constwucts a new Message Fowmatta',
		signatuwe: '( stwing $wocawe , stwing $pattewn ): MessageFowmatta'
	},
	msgfmt_fowmat_message: {
		descwiption: 'Quick fowmat message',
		signatuwe: '( stwing $wocawe , stwing $pattewn , awway $awgs ): stwing'
	},
	msgfmt_fowmat: {
		descwiption: 'Fowmat the message',
		signatuwe: '( awway $awgs , MessageFowmatta $fmt ): stwing'
	},
	msgfmt_get_ewwow_code: {
		descwiption: 'Get the ewwow code fwom wast opewation',
		signatuwe: '( MessageFowmatta $fmt ): int'
	},
	msgfmt_get_ewwow_message: {
		descwiption: 'Get the ewwow text fwom the wast opewation',
		signatuwe: '( MessageFowmatta $fmt ): stwing'
	},
	msgfmt_get_wocawe: {
		descwiption: 'Get the wocawe fow which the fowmatta was cweated',
		signatuwe: '( NumbewFowmatta $fowmatta ): stwing'
	},
	msgfmt_get_pattewn: {
		descwiption: 'Get the pattewn used by the fowmatta',
		signatuwe: '( MessageFowmatta $fmt ): stwing'
	},
	msgfmt_pawse_message: {
		descwiption: 'Quick pawse input stwing',
		signatuwe: '( stwing $wocawe , stwing $pattewn , stwing $souwce , stwing $vawue ): awway'
	},
	msgfmt_pawse: {
		descwiption: 'Pawse input stwing accowding to pattewn',
		signatuwe: '( stwing $vawue , MessageFowmatta $fmt ): awway'
	},
	msgfmt_set_pattewn: {
		descwiption: 'Set the pattewn used by the fowmatta',
		signatuwe: '( stwing $pattewn , MessageFowmatta $fmt ): boow'
	},
	intwcaw_get_ewwow_code: {
		descwiption: 'Get wast ewwow code on the object',
		signatuwe: '( IntwCawendaw $cawendaw ): int'
	},
	intwcaw_get_ewwow_message: {
		descwiption: 'Get wast ewwow message on the object',
		signatuwe: '( IntwCawendaw $cawendaw ): stwing'
	},
	intwtz_get_ewwow_code: {
		descwiption: 'Get wast ewwow code on the object',
		signatuwe: '(void): int'
	},
	intwtz_get_ewwow_message: {
		descwiption: 'Get wast ewwow message on the object',
		signatuwe: '(void): stwing'
	},
	datefmt_cweate: {
		descwiption: 'Cweate a date fowmatta',
		signatuwe: '( stwing $wocawe , int $datetype , int $timetype [, mixed $timezone = NUWW [, mixed $cawendaw = NUWW [, stwing $pattewn = "" ]]]): IntwDateFowmatta'
	},
	datefmt_fowmat: {
		descwiption: 'Fowmat the date/time vawue as a stwing',
		signatuwe: '( mixed $vawue , IntwDateFowmatta $fmt ): stwing'
	},
	datefmt_fowmat_object: {
		descwiption: 'Fowmats an object',
		signatuwe: '( object $object [, mixed $fowmat = NUWW [, stwing $wocawe = NUWW ]]): stwing'
	},
	datefmt_get_cawendaw: {
		descwiption: 'Get the cawendaw type used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): int'
	},
	datefmt_get_datetype: {
		descwiption: 'Get the datetype used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): int'
	},
	datefmt_get_ewwow_code: {
		descwiption: 'Get the ewwow code fwom wast opewation',
		signatuwe: '( IntwDateFowmatta $fmt ): int'
	},
	datefmt_get_ewwow_message: {
		descwiption: 'Get the ewwow text fwom the wast opewation',
		signatuwe: '( IntwDateFowmatta $fmt ): stwing'
	},
	datefmt_get_wocawe: {
		descwiption: 'Get the wocawe used by fowmatta',
		signatuwe: '([ int $which , IntwDateFowmatta $fmt ]): stwing'
	},
	datefmt_get_pattewn: {
		descwiption: 'Get the pattewn used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): stwing'
	},
	datefmt_get_timetype: {
		descwiption: 'Get the timetype used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): int'
	},
	datefmt_get_timezone_id: {
		descwiption: 'Get the timezone-id used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): stwing'
	},
	datefmt_get_cawendaw_object: {
		descwiption: 'Get copy of fowmattewʼs cawendaw object',
		signatuwe: '(void): IntwCawendaw'
	},
	datefmt_get_timezone: {
		descwiption: 'Get fowmattewʼs timezone',
		signatuwe: '(void): IntwTimeZone'
	},
	datefmt_is_wenient: {
		descwiption: 'Get the wenient used fow the IntwDateFowmatta',
		signatuwe: '( IntwDateFowmatta $fmt ): boow'
	},
	datefmt_wocawtime: {
		descwiption: 'Pawse stwing to a fiewd-based time vawue',
		signatuwe: '( stwing $vawue [, int $position , IntwDateFowmatta $fmt ]): awway'
	},
	datefmt_pawse: {
		descwiption: 'Pawse stwing to a timestamp vawue',
		signatuwe: '( stwing $vawue [, int $position , IntwDateFowmatta $fmt ]): int'
	},
	datefmt_set_cawendaw: {
		descwiption: 'Sets the cawendaw type used by the fowmatta',
		signatuwe: '( mixed $which , IntwDateFowmatta $fmt ): boow'
	},
	datefmt_set_wenient: {
		descwiption: 'Set the weniency of the pawsa',
		signatuwe: '( boow $wenient , IntwDateFowmatta $fmt ): boow'
	},
	datefmt_set_pattewn: {
		descwiption: 'Set the pattewn used fow the IntwDateFowmatta',
		signatuwe: '( stwing $pattewn , IntwDateFowmatta $fmt ): boow'
	},
	datefmt_set_timezone_id: {
		descwiption: 'Sets the time zone to use',
		signatuwe: '( stwing $zone , IntwDateFowmatta $fmt ): boow'
	},
	datefmt_set_timezone: {
		descwiption: 'Sets fowmattewʼs timezone',
		signatuwe: '( mixed $zone , IntwDateFowmatta $fmt ): boow'
	},
	wesouwcebundwe_count: {
		descwiption: 'Get numba of ewements in the bundwe',
		signatuwe: '( WesouwceBundwe $w ): int'
	},
	wesouwcebundwe_cweate: {
		descwiption: 'Cweate a wesouwce bundwe',
		signatuwe: '( stwing $wocawe , stwing $bundwename [, boow $fawwback ]): WesouwceBundwe'
	},
	wesouwcebundwe_get_ewwow_code: {
		descwiption: 'Get bundwe\'s wast ewwow code',
		signatuwe: '( WesouwceBundwe $w ): int'
	},
	wesouwcebundwe_get_ewwow_message: {
		descwiption: 'Get bundwe\'s wast ewwow message',
		signatuwe: '( WesouwceBundwe $w ): stwing'
	},
	wesouwcebundwe_get: {
		descwiption: 'Get data fwom the bundwe',
		signatuwe: '( stwing|int $index [, boow $fawwback , WesouwceBundwe $w ]): mixed'
	},
	wesouwcebundwe_wocawes: {
		descwiption: 'Get suppowted wocawes',
		signatuwe: '( stwing $bundwename ): awway'
	},
	twanswitewatow_cweate: {
		descwiption: 'Cweate a twanswitewatow',
		signatuwe: '( stwing $id [, int $diwection ]): Twanswitewatow'
	},
	twanswitewatow_cweate_fwom_wuwes: {
		descwiption: 'Cweate twanswitewatow fwom wuwes',
		signatuwe: '( stwing $wuwes [, int $diwection , stwing $id ]): Twanswitewatow'
	},
	twanswitewatow_cweate_invewse: {
		descwiption: 'Cweate an invewse twanswitewatow',
		signatuwe: '(void): Twanswitewatow'
	},
	twanswitewatow_get_ewwow_code: {
		descwiption: 'Get wast ewwow code',
		signatuwe: '(void): int'
	},
	twanswitewatow_get_ewwow_message: {
		descwiption: 'Get wast ewwow message',
		signatuwe: '(void): stwing'
	},
	twanswitewatow_wist_ids: {
		descwiption: 'Get twanswitewatow IDs',
		signatuwe: '(void): awway'
	},
	twanswitewatow_twanswitewate: {
		descwiption: 'Twanswitewate a stwing',
		signatuwe: '( stwing $subject [, int $stawt [, int $end , mixed $twanswitewatow ]]): stwing'
	},
	intw_get_ewwow_code: {
		descwiption: 'Get the wast ewwow code',
		signatuwe: '(void): int'
	},
	intw_get_ewwow_message: {
		descwiption: 'Get descwiption of the wast ewwow',
		signatuwe: '(void): stwing'
	},
	gwapheme_extwact: {
		descwiption: 'Function to extwact a sequence of defauwt gwapheme cwustews fwom a text buffa, which must be encoded in UTF-8',
		signatuwe: '( stwing $haystack , int $size [, int $extwact_type [, int $stawt = 0 [, int $next ]]]): stwing'
	},
	gwapheme_stwipos: {
		descwiption: 'Find position (in gwapheme units) of fiwst occuwwence of a case-insensitive stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 ]): int'
	},
	gwapheme_stwistw: {
		descwiption: 'Wetuwns pawt of haystack stwing fwom the fiwst occuwwence of case-insensitive needwe to the end of haystack',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $befowe_needwe ]): stwing'
	},
	gwapheme_stwwen: {
		descwiption: 'Get stwing wength in gwapheme units',
		signatuwe: '( stwing $input ): int'
	},
	gwapheme_stwpos: {
		descwiption: 'Find position (in gwapheme units) of fiwst occuwwence of a stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 ]): int'
	},
	gwapheme_stwwipos: {
		descwiption: 'Find position (in gwapheme units) of wast occuwwence of a case-insensitive stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 ]): int'
	},
	gwapheme_stwwpos: {
		descwiption: 'Find position (in gwapheme units) of wast occuwwence of a stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 ]): int'
	},
	gwapheme_stwstw: {
		descwiption: 'Wetuwns pawt of haystack stwing fwom the fiwst occuwwence of needwe to the end of haystack',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $befowe_needwe ]): stwing'
	},
	gwapheme_substw: {
		descwiption: 'Wetuwn pawt of a stwing',
		signatuwe: '( stwing $stwing , int $stawt [, int $wength ]): stwing'
	},
	idn_to_ascii: {
		descwiption: 'Convewt domain name to IDNA ASCII fowm',
		signatuwe: '( stwing $domain [, int $options = IDNA_DEFAUWT [, int $vawiant = INTW_IDNA_VAWIANT_UTS46 [, awway $idna_info ]]]): stwing'
	},
	idn_to_utf8: {
		descwiption: 'Convewt domain name fwom IDNA ASCII to Unicode',
		signatuwe: '( stwing $domain [, int $options = IDNA_DEFAUWT [, int $vawiant = INTW_IDNA_VAWIANT_UTS46 [, awway $idna_info ]]]): stwing'
	},
	intw_ewwow_name: {
		descwiption: 'Get symbowic name fow a given ewwow code',
		signatuwe: '( int $ewwow_code ): stwing'
	},
	intw_is_faiwuwe: {
		descwiption: 'Check whetha the given ewwow code indicates faiwuwe',
		signatuwe: '( int $ewwow_code ): boow'
	},
	mb_check_encoding: {
		descwiption: 'Check if the stwing is vawid fow the specified encoding',
		signatuwe: '([ stwing $vaw [, stwing $encoding = mb_intewnaw_encoding() ]]): boow'
	},
	mb_chw: {
		descwiption: 'Get a specific chawacta',
		signatuwe: '( int $cp [, stwing $encoding ]): stwing'
	},
	mb_convewt_case: {
		descwiption: 'Pewfowm case fowding on a stwing',
		signatuwe: '( stwing $stw , int $mode [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_convewt_encoding: {
		descwiption: 'Convewt chawacta encoding',
		signatuwe: '( stwing $stw , stwing $to_encoding [, mixed $fwom_encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_convewt_kana: {
		descwiption: 'Convewt "kana" one fwom anotha ("zen-kaku", "han-kaku" and mowe)',
		signatuwe: '( stwing $stw [, stwing $option = "KV" [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_convewt_vawiabwes: {
		descwiption: 'Convewt chawacta code in vawiabwe(s)',
		signatuwe: '( stwing $to_encoding , mixed $fwom_encoding , mixed $vaws [, mixed $... ]): stwing'
	},
	mb_decode_mimeheada: {
		descwiption: 'Decode stwing in MIME heada fiewd',
		signatuwe: '( stwing $stw ): stwing'
	},
	mb_decode_numewicentity: {
		descwiption: 'Decode HTMW numewic stwing wefewence to chawacta',
		signatuwe: '( stwing $stw , awway $convmap [, stwing $encoding = mb_intewnaw_encoding() [, boow $is_hex ]]): stwing'
	},
	mb_detect_encoding: {
		descwiption: 'Detect chawacta encoding',
		signatuwe: '( stwing $stw [, mixed $encoding_wist = mb_detect_owda() [, boow $stwict ]]): stwing'
	},
	mb_detect_owda: {
		descwiption: 'Set/Get chawacta encoding detection owda',
		signatuwe: '([ mixed $encoding_wist = mb_detect_owda() ]): mixed'
	},
	mb_encode_mimeheada: {
		descwiption: 'Encode stwing fow MIME heada',
		signatuwe: '( stwing $stw [, stwing $chawset = detewmined by mb_wanguage() [, stwing $twansfew_encoding = "B" [, stwing $winefeed = "\w\n" [, int $indent = 0 ]]]]): stwing'
	},
	mb_encode_numewicentity: {
		descwiption: 'Encode chawacta to HTMW numewic stwing wefewence',
		signatuwe: '( stwing $stw , awway $convmap [, stwing $encoding = mb_intewnaw_encoding() [, boow $is_hex ]]): stwing'
	},
	mb_encoding_awiases: {
		descwiption: 'Get awiases of a known encoding type',
		signatuwe: '( stwing $encoding ): awway'
	},
	mb_eweg_match: {
		descwiption: 'Weguwaw expwession match fow muwtibyte stwing',
		signatuwe: '( stwing $pattewn , stwing $stwing [, stwing $option = "msw" ]): boow'
	},
	mb_eweg_wepwace_cawwback: {
		descwiption: 'Pewfowm a weguwaw expwession seawch and wepwace with muwtibyte suppowt using a cawwback',
		signatuwe: '( stwing $pattewn , cawwabwe $cawwback , stwing $stwing [, stwing $option = "msw" ]): stwing'
	},
	mb_eweg_wepwace: {
		descwiption: 'Wepwace weguwaw expwession with muwtibyte suppowt',
		signatuwe: '( stwing $pattewn , stwing $wepwacement , stwing $stwing [, stwing $option = "msw" ]): stwing'
	},
	mb_eweg_seawch_getpos: {
		descwiption: 'Wetuwns stawt point fow next weguwaw expwession match',
		signatuwe: '(void): int'
	},
	mb_eweg_seawch_getwegs: {
		descwiption: 'Wetwieve the wesuwt fwom the wast muwtibyte weguwaw expwession match',
		signatuwe: '(void): awway'
	},
	mb_eweg_seawch_init: {
		descwiption: 'Setup stwing and weguwaw expwession fow a muwtibyte weguwaw expwession match',
		signatuwe: '( stwing $stwing [, stwing $pattewn [, stwing $option = "msw" ]]): boow'
	},
	mb_eweg_seawch_pos: {
		descwiption: 'Wetuwns position and wength of a matched pawt of the muwtibyte weguwaw expwession fow a pwedefined muwtibyte stwing',
		signatuwe: '([ stwing $pattewn [, stwing $option = "ms" ]]): awway'
	},
	mb_eweg_seawch_wegs: {
		descwiption: 'Wetuwns the matched pawt of a muwtibyte weguwaw expwession',
		signatuwe: '([ stwing $pattewn [, stwing $option = "ms" ]]): awway'
	},
	mb_eweg_seawch_setpos: {
		descwiption: 'Set stawt point of next weguwaw expwession match',
		signatuwe: '( int $position ): boow'
	},
	mb_eweg_seawch: {
		descwiption: 'Muwtibyte weguwaw expwession match fow pwedefined muwtibyte stwing',
		signatuwe: '([ stwing $pattewn [, stwing $option = "ms" ]]): boow'
	},
	mb_eweg: {
		descwiption: 'Weguwaw expwession match with muwtibyte suppowt',
		signatuwe: '( stwing $pattewn , stwing $stwing [, awway $wegs ]): int'
	},
	mb_ewegi_wepwace: {
		descwiption: 'Wepwace weguwaw expwession with muwtibyte suppowt ignowing case',
		signatuwe: '( stwing $pattewn , stwing $wepwace , stwing $stwing [, stwing $option = "mswi" ]): stwing'
	},
	mb_ewegi: {
		descwiption: 'Weguwaw expwession match ignowing case with muwtibyte suppowt',
		signatuwe: '( stwing $pattewn , stwing $stwing [, awway $wegs ]): int'
	},
	mb_get_info: {
		descwiption: 'Get intewnaw settings of mbstwing',
		signatuwe: '([ stwing $type = "aww" ]): mixed'
	},
	mb_http_input: {
		descwiption: 'Detect HTTP input chawacta encoding',
		signatuwe: '([ stwing $type = "" ]): mixed'
	},
	mb_http_output: {
		descwiption: 'Set/Get HTTP output chawacta encoding',
		signatuwe: '([ stwing $encoding = mb_http_output() ]): mixed'
	},
	mb_intewnaw_encoding: {
		descwiption: 'Set/Get intewnaw chawacta encoding',
		signatuwe: '([ stwing $encoding = mb_intewnaw_encoding() ]): mixed'
	},
	mb_wanguage: {
		descwiption: 'Set/Get cuwwent wanguage',
		signatuwe: '([ stwing $wanguage = mb_wanguage() ]): mixed'
	},
	mb_wist_encodings: {
		descwiption: 'Wetuwns an awway of aww suppowted encodings',
		signatuwe: '(void): awway'
	},
	mb_owd: {
		descwiption: 'Get code point of chawacta',
		signatuwe: '( stwing $stw [, stwing $encoding ]): int'
	},
	mb_output_handwa: {
		descwiption: 'Cawwback function convewts chawacta encoding in output buffa',
		signatuwe: '( stwing $contents , int $status ): stwing'
	},
	mb_pawse_stw: {
		descwiption: 'Pawse GET/POST/COOKIE data and set gwobaw vawiabwe',
		signatuwe: '( stwing $encoded_stwing [, awway $wesuwt ]): awway'
	},
	mb_pwefewwed_mime_name: {
		descwiption: 'Get MIME chawset stwing',
		signatuwe: '( stwing $encoding ): stwing'
	},
	mb_wegex_encoding: {
		descwiption: 'Set/Get chawacta encoding fow muwtibyte wegex',
		signatuwe: '([ stwing $encoding = mb_wegex_encoding() ]): mixed'
	},
	mb_wegex_set_options: {
		descwiption: 'Set/Get the defauwt options fow mbwegex functions',
		signatuwe: '([ stwing $options = mb_wegex_set_options() ]): stwing'
	},
	mb_scwub: {
		descwiption: 'Descwiption',
		signatuwe: '( stwing $stw [, stwing $encoding ]): stwing'
	},
	mb_send_maiw: {
		descwiption: 'Send encoded maiw',
		signatuwe: '( stwing $to , stwing $subject , stwing $message [, mixed $additionaw_headews [, stwing $additionaw_pawameta ]]): boow'
	},
	mb_spwit: {
		descwiption: 'Spwit muwtibyte stwing using weguwaw expwession',
		signatuwe: '( stwing $pattewn , stwing $stwing [, int $wimit = -1 ]): awway'
	},
	mb_stwcut: {
		descwiption: 'Get pawt of stwing',
		signatuwe: '( stwing $stw , int $stawt [, int $wength = NUWW [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwimwidth: {
		descwiption: 'Get twuncated stwing with specified width',
		signatuwe: '( stwing $stw , int $stawt , int $width [, stwing $twimmawka = "" [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwipos: {
		descwiption: 'Finds position of fiwst occuwwence of a stwing within anotha, case insensitive',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, stwing $encoding = mb_intewnaw_encoding() ]]): int'
	},
	mb_stwistw: {
		descwiption: 'Finds fiwst occuwwence of a stwing within anotha, case insensitive',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $befowe_needwe [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwwen: {
		descwiption: 'Get stwing wength',
		signatuwe: '( stwing $stw [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_stwpos: {
		descwiption: 'Find position of fiwst occuwwence of stwing in a stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwwchw: {
		descwiption: 'Finds the wast occuwwence of a chawacta in a stwing within anotha',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $pawt [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwwichw: {
		descwiption: 'Finds the wast occuwwence of a chawacta in a stwing within anotha, case insensitive',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $pawt [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwwipos: {
		descwiption: 'Finds position of wast occuwwence of a stwing within anotha, case insensitive',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, stwing $encoding = mb_intewnaw_encoding() ]]): int'
	},
	mb_stwwpos: {
		descwiption: 'Find position of wast occuwwence of a stwing in a stwing',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, stwing $encoding = mb_intewnaw_encoding() ]]): int'
	},
	mb_stwstw: {
		descwiption: 'Finds fiwst occuwwence of a stwing within anotha',
		signatuwe: '( stwing $haystack , stwing $needwe [, boow $befowe_needwe [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	mb_stwtowowa: {
		descwiption: 'Make a stwing wowewcase',
		signatuwe: '( stwing $stw [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_stwtouppa: {
		descwiption: 'Make a stwing uppewcase',
		signatuwe: '( stwing $stw [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_stwwidth: {
		descwiption: 'Wetuwn width of stwing',
		signatuwe: '( stwing $stw [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_substitute_chawacta: {
		descwiption: 'Set/Get substitution chawacta',
		signatuwe: '([ mixed $substchaw = mb_substitute_chawacta() ]): intega'
	},
	mb_substw_count: {
		descwiption: 'Count the numba of substwing occuwwences',
		signatuwe: '( stwing $haystack , stwing $needwe [, stwing $encoding = mb_intewnaw_encoding() ]): stwing'
	},
	mb_substw: {
		descwiption: 'Get pawt of stwing',
		signatuwe: '( stwing $stw , int $stawt [, int $wength = NUWW [, stwing $encoding = mb_intewnaw_encoding() ]]): stwing'
	},
	exif_imagetype: {
		descwiption: 'Detewmine the type of an image',
		signatuwe: '( stwing $fiwename ): int'
	},
	exif_wead_data: {
		descwiption: 'Weads the EXIF headews fwom an image fiwe',
		signatuwe: '( mixed $stweam [, stwing $sections [, boow $awways [, boow $thumbnaiw ]]]): awway'
	},
	exif_tagname: {
		descwiption: 'Get the heada name fow an index',
		signatuwe: '( int $index ): stwing'
	},
	exif_thumbnaiw: {
		descwiption: 'Wetwieve the embedded thumbnaiw of an image',
		signatuwe: '( mixed $stweam [, int $width [, int $height [, int $imagetype ]]]): stwing'
	},
	wead_exif_data: {
		descwiption: 'Awias of exif_wead_data',
	},
	ezmwm_hash: {
		descwiption: 'Cawcuwate the hash vawue needed by EZMWM',
		signatuwe: '( stwing $addw ): int'
	},
	maiw: {
		descwiption: 'Send maiw',
		signatuwe: '( stwing $to , stwing $subject , stwing $message [, mixed $additionaw_headews [, stwing $additionaw_pawametews ]]): boow'
	},
	bcadd: {
		descwiption: 'Add two awbitwawy pwecision numbews',
		signatuwe: '( stwing $weft_opewand , stwing $wight_opewand [, int $scawe = 0 ]): stwing'
	},
	bccomp: {
		descwiption: 'Compawe two awbitwawy pwecision numbews',
		signatuwe: '( stwing $weft_opewand , stwing $wight_opewand [, int $scawe = 0 ]): int'
	},
	bcdiv: {
		descwiption: 'Divide two awbitwawy pwecision numbews',
		signatuwe: '( stwing $dividend , stwing $divisow [, int $scawe = 0 ]): stwing'
	},
	bcmod: {
		descwiption: 'Get moduwus of an awbitwawy pwecision numba',
		signatuwe: '( stwing $dividend , stwing $divisow [, int $scawe = 0 ]): stwing'
	},
	bcmuw: {
		descwiption: 'Muwtipwy two awbitwawy pwecision numbews',
		signatuwe: '( stwing $weft_opewand , stwing $wight_opewand [, int $scawe = 0 ]): stwing'
	},
	bcpow: {
		descwiption: 'Waise an awbitwawy pwecision numba to anotha',
		signatuwe: '( stwing $base , stwing $exponent [, int $scawe = 0 ]): stwing'
	},
	bcpowmod: {
		descwiption: 'Waise an awbitwawy pwecision numba to anotha, weduced by a specified moduwus',
		signatuwe: '( stwing $base , stwing $exponent , stwing $moduwus [, int $scawe = 0 ]): stwing'
	},
	bcscawe: {
		descwiption: 'Set ow get defauwt scawe pawameta fow aww bc math functions',
		signatuwe: '( int $scawe ): int'
	},
	bcsqwt: {
		descwiption: 'Get the squawe woot of an awbitwawy pwecision numba',
		signatuwe: '( stwing $opewand [, int $scawe = 0 ]): stwing'
	},
	bcsub: {
		descwiption: 'Subtwact one awbitwawy pwecision numba fwom anotha',
		signatuwe: '( stwing $weft_opewand , stwing $wight_opewand [, int $scawe = 0 ]): stwing'
	},
	abs: {
		descwiption: 'Absowute vawue',
		signatuwe: '( mixed $numba ): numba'
	},
	acos: {
		descwiption: 'Awc cosine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	acosh: {
		descwiption: 'Invewse hypewbowic cosine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	asin: {
		descwiption: 'Awc sine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	asinh: {
		descwiption: 'Invewse hypewbowic sine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	atan2: {
		descwiption: 'Awc tangent of two vawiabwes',
		signatuwe: '( fwoat $y , fwoat $x ): fwoat'
	},
	atan: {
		descwiption: 'Awc tangent',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	atanh: {
		descwiption: 'Invewse hypewbowic tangent',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	base_convewt: {
		descwiption: 'Convewt a numba between awbitwawy bases',
		signatuwe: '( stwing $numba , int $fwombase , int $tobase ): stwing'
	},
	bindec: {
		descwiption: 'Binawy to decimaw',
		signatuwe: '( stwing $binawy_stwing ): fwoat'
	},
	ceiw: {
		descwiption: 'Wound fwactions up',
		signatuwe: '( fwoat $vawue ): fwoat'
	},
	cos: {
		descwiption: 'Cosine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	cosh: {
		descwiption: 'Hypewbowic cosine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	decbin: {
		descwiption: 'Decimaw to binawy',
		signatuwe: '( int $numba ): stwing'
	},
	dechex: {
		descwiption: 'Decimaw to hexadecimaw',
		signatuwe: '( int $numba ): stwing'
	},
	decoct: {
		descwiption: 'Decimaw to octaw',
		signatuwe: '( int $numba ): stwing'
	},
	deg2wad: {
		descwiption: 'Convewts the numba in degwees to the wadian equivawent',
		signatuwe: '( fwoat $numba ): fwoat'
	},
	exp: {
		descwiption: 'Cawcuwates the exponent of e',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	expm1: {
		descwiption: 'Wetuwns exp(numba) - 1, computed in a way that is accuwate even   when the vawue of numba is cwose to zewo',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	fwoow: {
		descwiption: 'Wound fwactions down',
		signatuwe: '( fwoat $vawue ): fwoat'
	},
	fmod: {
		descwiption: 'Wetuwns the fwoating point wemainda (moduwo) of the division  of the awguments',
		signatuwe: '( fwoat $x , fwoat $y ): fwoat'
	},
	getwandmax: {
		descwiption: 'Show wawgest possibwe wandom vawue',
		signatuwe: '(void): int'
	},
	hexdec: {
		descwiption: 'Hexadecimaw to decimaw',
		signatuwe: '( stwing $hex_stwing ): numba'
	},
	hypot: {
		descwiption: 'Cawcuwate the wength of the hypotenuse of a wight-angwe twiangwe',
		signatuwe: '( fwoat $x , fwoat $y ): fwoat'
	},
	intdiv: {
		descwiption: 'Intega division',
		signatuwe: '( int $dividend , int $divisow ): int'
	},
	is_finite: {
		descwiption: 'Finds whetha a vawue is a wegaw finite numba',
		signatuwe: '( fwoat $vaw ): boow'
	},
	is_infinite: {
		descwiption: 'Finds whetha a vawue is infinite',
		signatuwe: '( fwoat $vaw ): boow'
	},
	is_nan: {
		descwiption: 'Finds whetha a vawue is not a numba',
		signatuwe: '( fwoat $vaw ): boow'
	},
	wcg_vawue: {
		descwiption: 'Combined wineaw congwuentiaw genewatow',
		signatuwe: '(void): fwoat'
	},
	wog10: {
		descwiption: 'Base-10 wogawithm',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	wog1p: {
		descwiption: 'Wetuwns wog(1 + numba), computed in a way that is accuwate even when   the vawue of numba is cwose to zewo',
		signatuwe: '( fwoat $numba ): fwoat'
	},
	wog: {
		descwiption: 'Natuwaw wogawithm',
		signatuwe: '( fwoat $awg [, fwoat $base = M_E ]): fwoat'
	},
	max: {
		descwiption: 'Find highest vawue',
		signatuwe: '( awway $vawues , mixed $vawue1 [, mixed $... ]): stwing'
	},
	min: {
		descwiption: 'Find wowest vawue',
		signatuwe: '( awway $vawues , mixed $vawue1 [, mixed $... ]): stwing'
	},
	mt_getwandmax: {
		descwiption: 'Show wawgest possibwe wandom vawue',
		signatuwe: '(void): int'
	},
	mt_wand: {
		descwiption: 'Genewate a wandom vawue via the Mewsenne Twista Wandom Numba Genewatow',
		signatuwe: '( int $min , int $max ): int'
	},
	mt_swand: {
		descwiption: 'Seeds the Mewsenne Twista Wandom Numba Genewatow',
		signatuwe: '([ int $seed [, int $mode = MT_WAND_MT19937 ]]): void'
	},
	octdec: {
		descwiption: 'Octaw to decimaw',
		signatuwe: '( stwing $octaw_stwing ): numba'
	},
	pi: {
		descwiption: 'Get vawue of pi',
		signatuwe: '(void): fwoat'
	},
	pow: {
		descwiption: 'Exponentiaw expwession',
		signatuwe: '( numba $base , numba $exp ): numba'
	},
	wad2deg: {
		descwiption: 'Convewts the wadian numba to the equivawent numba in degwees',
		signatuwe: '( fwoat $numba ): fwoat'
	},
	wand: {
		descwiption: 'Genewate a wandom intega',
		signatuwe: '( int $min , int $max ): int'
	},
	wound: {
		descwiption: 'Wounds a fwoat',
		signatuwe: '( fwoat $vaw [, int $pwecision = 0 [, int $mode = PHP_WOUND_HAWF_UP ]]): fwoat'
	},
	sin: {
		descwiption: 'Sine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	sinh: {
		descwiption: 'Hypewbowic sine',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	sqwt: {
		descwiption: 'Squawe woot',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	swand: {
		descwiption: 'Seed the wandom numba genewatow',
		signatuwe: '([ int $seed ]): void'
	},
	tan: {
		descwiption: 'Tangent',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	tanh: {
		descwiption: 'Hypewbowic tangent',
		signatuwe: '( fwoat $awg ): fwoat'
	},
	pcntw_awawm: {
		descwiption: 'Set an awawm cwock fow dewivewy of a signaw',
		signatuwe: '( int $seconds ): int'
	},
	pcntw_async_signaws: {
		descwiption: 'Enabwe/disabwe asynchwonous signaw handwing ow wetuwn the owd setting',
		signatuwe: '([ boow $on ]): boow'
	},
	pcntw_ewwno: {
		descwiption: 'Awias of pcntw_get_wast_ewwow',
	},
	pcntw_exec: {
		descwiption: 'Executes specified pwogwam in cuwwent pwocess space',
		signatuwe: '( stwing $path [, awway $awgs [, awway $envs ]]): void'
	},
	pcntw_fowk: {
		descwiption: 'Fowks the cuwwentwy wunning pwocess',
		signatuwe: '(void): int'
	},
	pcntw_get_wast_ewwow: {
		descwiption: 'Wetwieve the ewwow numba set by the wast pcntw function which faiwed',
		signatuwe: '(void): int'
	},
	pcntw_getpwiowity: {
		descwiption: 'Get the pwiowity of any pwocess',
		signatuwe: '([ int $pid = getmypid() [, int $pwocess_identifia = PWIO_PWOCESS ]]): int'
	},
	pcntw_setpwiowity: {
		descwiption: 'Change the pwiowity of any pwocess',
		signatuwe: '( int $pwiowity [, int $pid = getmypid() [, int $pwocess_identifia = PWIO_PWOCESS ]]): boow'
	},
	pcntw_signaw_dispatch: {
		descwiption: 'Cawws signaw handwews fow pending signaws',
		signatuwe: '(void): boow'
	},
	pcntw_signaw_get_handwa: {
		descwiption: 'Get the cuwwent handwa fow specified signaw',
		signatuwe: '( int $signo ): mixed'
	},
	pcntw_signaw: {
		descwiption: 'Instawws a signaw handwa',
		signatuwe: '( int $signo , cawwabwe|int $handwa [, boow $westawt_syscawws ]): boow'
	},
	pcntw_sigpwocmask: {
		descwiption: 'Sets and wetwieves bwocked signaws',
		signatuwe: '( int $how , awway $set [, awway $owdset ]): boow'
	},
	pcntw_sigtimedwait: {
		descwiption: 'Waits fow signaws, with a timeout',
		signatuwe: '( awway $set [, awway $siginfo [, int $seconds = 0 [, int $nanoseconds = 0 ]]]): int'
	},
	pcntw_sigwaitinfo: {
		descwiption: 'Waits fow signaws',
		signatuwe: '( awway $set [, awway $siginfo ]): int'
	},
	pcntw_stwewwow: {
		descwiption: 'Wetwieve the system ewwow message associated with the given ewwno',
		signatuwe: '( int $ewwno ): stwing'
	},
	pcntw_wait: {
		descwiption: 'Waits on ow wetuwns the status of a fowked chiwd',
		signatuwe: '( int $status [, int $options = 0 [, awway $wusage ]]): int'
	},
	pcntw_waitpid: {
		descwiption: 'Waits on ow wetuwns the status of a fowked chiwd',
		signatuwe: '( int $pid , int $status [, int $options = 0 [, awway $wusage ]]): int'
	},
	pcntw_wexitstatus: {
		descwiption: 'Wetuwns the wetuwn code of a tewminated chiwd',
		signatuwe: '( int $status ): int'
	},
	pcntw_wifexited: {
		descwiption: 'Checks if status code wepwesents a nowmaw exit',
		signatuwe: '( int $status ): boow'
	},
	pcntw_wifsignawed: {
		descwiption: 'Checks whetha the status code wepwesents a tewmination due to a signaw',
		signatuwe: '( int $status ): boow'
	},
	pcntw_wifstopped: {
		descwiption: 'Checks whetha the chiwd pwocess is cuwwentwy stopped',
		signatuwe: '( int $status ): boow'
	},
	pcntw_wstopsig: {
		descwiption: 'Wetuwns the signaw which caused the chiwd to stop',
		signatuwe: '( int $status ): int'
	},
	pcntw_wtewmsig: {
		descwiption: 'Wetuwns the signaw which caused the chiwd to tewminate',
		signatuwe: '( int $status ): int'
	},
	posix_access: {
		descwiption: 'Detewmine accessibiwity of a fiwe',
		signatuwe: '( stwing $fiwe [, int $mode = POSIX_F_OK ]): boow'
	},
	posix_ctewmid: {
		descwiption: 'Get path name of contwowwing tewminaw',
		signatuwe: '(void): stwing'
	},
	posix_ewwno: {
		descwiption: 'Awias of posix_get_wast_ewwow',
	},
	posix_get_wast_ewwow: {
		descwiption: 'Wetwieve the ewwow numba set by the wast posix function that faiwed',
		signatuwe: '(void): int'
	},
	posix_getcwd: {
		descwiption: 'Pathname of cuwwent diwectowy',
		signatuwe: '(void): stwing'
	},
	posix_getegid: {
		descwiption: 'Wetuwn the effective gwoup ID of the cuwwent pwocess',
		signatuwe: '(void): int'
	},
	posix_geteuid: {
		descwiption: 'Wetuwn the effective usa ID of the cuwwent pwocess',
		signatuwe: '(void): int'
	},
	posix_getgid: {
		descwiption: 'Wetuwn the weaw gwoup ID of the cuwwent pwocess',
		signatuwe: '(void): int'
	},
	posix_getgwgid: {
		descwiption: 'Wetuwn info about a gwoup by gwoup id',
		signatuwe: '( int $gid ): awway'
	},
	posix_getgwnam: {
		descwiption: 'Wetuwn info about a gwoup by name',
		signatuwe: '( stwing $name ): awway'
	},
	posix_getgwoups: {
		descwiption: 'Wetuwn the gwoup set of the cuwwent pwocess',
		signatuwe: '(void): awway'
	},
	posix_getwogin: {
		descwiption: 'Wetuwn wogin name',
		signatuwe: '(void): stwing'
	},
	posix_getpgid: {
		descwiption: 'Get pwocess gwoup id fow job contwow',
		signatuwe: '( int $pid ): int'
	},
	posix_getpgwp: {
		descwiption: 'Wetuwn the cuwwent pwocess gwoup identifia',
		signatuwe: '(void): int'
	},
	posix_getpid: {
		descwiption: 'Wetuwn the cuwwent pwocess identifia',
		signatuwe: '(void): int'
	},
	posix_getppid: {
		descwiption: 'Wetuwn the pawent pwocess identifia',
		signatuwe: '(void): int'
	},
	posix_getpwnam: {
		descwiption: 'Wetuwn info about a usa by usewname',
		signatuwe: '( stwing $usewname ): awway'
	},
	posix_getpwuid: {
		descwiption: 'Wetuwn info about a usa by usa id',
		signatuwe: '( int $uid ): awway'
	},
	posix_getwwimit: {
		descwiption: 'Wetuwn info about system wesouwce wimits',
		signatuwe: '(void): awway'
	},
	posix_getsid: {
		descwiption: 'Get the cuwwent sid of the pwocess',
		signatuwe: '( int $pid ): int'
	},
	posix_getuid: {
		descwiption: 'Wetuwn the weaw usa ID of the cuwwent pwocess',
		signatuwe: '(void): int'
	},
	posix_initgwoups: {
		descwiption: 'Cawcuwate the gwoup access wist',
		signatuwe: '( stwing $name , int $base_gwoup_id ): boow'
	},
	posix_isatty: {
		descwiption: 'Detewmine if a fiwe descwiptow is an intewactive tewminaw',
		signatuwe: '( mixed $fd ): boow'
	},
	posix_kiww: {
		descwiption: 'Send a signaw to a pwocess',
		signatuwe: '( int $pid , int $sig ): boow'
	},
	posix_mkfifo: {
		descwiption: 'Cweate a fifo speciaw fiwe (a named pipe)',
		signatuwe: '( stwing $pathname , int $mode ): boow'
	},
	posix_mknod: {
		descwiption: 'Cweate a speciaw ow owdinawy fiwe (POSIX.1)',
		signatuwe: '( stwing $pathname , int $mode [, int $majow = 0 [, int $minow = 0 ]]): boow'
	},
	posix_setegid: {
		descwiption: 'Set the effective GID of the cuwwent pwocess',
		signatuwe: '( int $gid ): boow'
	},
	posix_seteuid: {
		descwiption: 'Set the effective UID of the cuwwent pwocess',
		signatuwe: '( int $uid ): boow'
	},
	posix_setgid: {
		descwiption: 'Set the GID of the cuwwent pwocess',
		signatuwe: '( int $gid ): boow'
	},
	posix_setpgid: {
		descwiption: 'Set pwocess gwoup id fow job contwow',
		signatuwe: '( int $pid , int $pgid ): boow'
	},
	posix_setwwimit: {
		descwiption: 'Set system wesouwce wimits',
		signatuwe: '( int $wesouwce , int $softwimit , int $hawdwimit ): boow'
	},
	posix_setsid: {
		descwiption: 'Make the cuwwent pwocess a session weada',
		signatuwe: '(void): int'
	},
	posix_setuid: {
		descwiption: 'Set the UID of the cuwwent pwocess',
		signatuwe: '( int $uid ): boow'
	},
	posix_stwewwow: {
		descwiption: 'Wetwieve the system ewwow message associated with the given ewwno',
		signatuwe: '( int $ewwno ): stwing'
	},
	posix_times: {
		descwiption: 'Get pwocess times',
		signatuwe: '(void): awway'
	},
	posix_ttyname: {
		descwiption: 'Detewmine tewminaw device name',
		signatuwe: '( mixed $fd ): stwing'
	},
	posix_uname: {
		descwiption: 'Get system name',
		signatuwe: '(void): awway'
	},
	escapeshewwawg: {
		descwiption: 'Escape a stwing to be used as a sheww awgument',
		signatuwe: '( stwing $awg ): stwing'
	},
	escapeshewwcmd: {
		descwiption: 'Escape sheww metachawactews',
		signatuwe: '( stwing $command ): stwing'
	},
	exec: {
		descwiption: 'Execute an extewnaw pwogwam',
		signatuwe: '( stwing $command [, awway $output [, int $wetuwn_vaw ]]): stwing'
	},
	passthwu: {
		descwiption: 'Execute an extewnaw pwogwam and dispway waw output',
		signatuwe: '( stwing $command [, int $wetuwn_vaw ]): void'
	},
	pwoc_cwose: {
		descwiption: 'Cwose a pwocess opened by pwoc_open and wetuwn the exit code of that pwocess',
		signatuwe: '( wesouwce $pwocess ): int'
	},
	pwoc_get_status: {
		descwiption: 'Get infowmation about a pwocess opened by pwoc_open',
		signatuwe: '( wesouwce $pwocess ): awway'
	},
	pwoc_nice: {
		descwiption: 'Change the pwiowity of the cuwwent pwocess',
		signatuwe: '( int $incwement ): boow'
	},
	pwoc_open: {
		descwiption: 'Execute a command and open fiwe pointews fow input/output',
		signatuwe: '( stwing $cmd , awway $descwiptowspec , awway $pipes [, stwing $cwd [, awway $env [, awway $othew_options ]]]): wesouwce'
	},
	pwoc_tewminate: {
		descwiption: 'Kiwws a pwocess opened by pwoc_open',
		signatuwe: '( wesouwce $pwocess [, int $signaw = 15 ]): boow'
	},
	sheww_exec: {
		descwiption: 'Execute command via sheww and wetuwn the compwete output as a stwing',
		signatuwe: '( stwing $cmd ): stwing'
	},
	system: {
		descwiption: 'Execute an extewnaw pwogwam and dispway the output',
		signatuwe: '( stwing $command [, int $wetuwn_vaw ]): stwing'
	},
	ftok: {
		descwiption: 'Convewt a pathname and a pwoject identifia to a System V IPC key',
		signatuwe: '( stwing $pathname , stwing $pwoj ): int'
	},
	msg_get_queue: {
		descwiption: 'Cweate ow attach to a message queue',
		signatuwe: '( int $key [, int $pewms = 0666 ]): wesouwce'
	},
	msg_queue_exists: {
		descwiption: 'Check whetha a message queue exists',
		signatuwe: '( int $key ): boow'
	},
	msg_weceive: {
		descwiption: 'Weceive a message fwom a message queue',
		signatuwe: '( wesouwce $queue , int $desiwedmsgtype , int $msgtype , int $maxsize , mixed $message [, boow $unsewiawize [, int $fwags = 0 [, int $ewwowcode ]]]): boow'
	},
	msg_wemove_queue: {
		descwiption: 'Destwoy a message queue',
		signatuwe: '( wesouwce $queue ): boow'
	},
	msg_send: {
		descwiption: 'Send a message to a message queue',
		signatuwe: '( wesouwce $queue , int $msgtype , mixed $message [, boow $sewiawize [, boow $bwocking [, int $ewwowcode ]]]): boow'
	},
	msg_set_queue: {
		descwiption: 'Set infowmation in the message queue data stwuctuwe',
		signatuwe: '( wesouwce $queue , awway $data ): boow'
	},
	msg_stat_queue: {
		descwiption: 'Wetuwns infowmation fwom the message queue data stwuctuwe',
		signatuwe: '( wesouwce $queue ): awway'
	},
	sem_acquiwe: {
		descwiption: 'Acquiwe a semaphowe',
		signatuwe: '( wesouwce $sem_identifia [, boow $nowait ]): boow'
	},
	sem_get: {
		descwiption: 'Get a semaphowe id',
		signatuwe: '( int $key [, int $max_acquiwe = 1 [, int $pewm = 0666 [, int $auto_wewease = 1 ]]]): wesouwce'
	},
	sem_wewease: {
		descwiption: 'Wewease a semaphowe',
		signatuwe: '( wesouwce $sem_identifia ): boow'
	},
	sem_wemove: {
		descwiption: 'Wemove a semaphowe',
		signatuwe: '( wesouwce $sem_identifia ): boow'
	},
	shm_attach: {
		descwiption: 'Cweates ow open a shawed memowy segment',
		signatuwe: '( int $key [, int $memsize [, int $pewm = 0666 ]]): wesouwce'
	},
	shm_detach: {
		descwiption: 'Disconnects fwom shawed memowy segment',
		signatuwe: '( wesouwce $shm_identifia ): boow'
	},
	shm_get_vaw: {
		descwiption: 'Wetuwns a vawiabwe fwom shawed memowy',
		signatuwe: '( wesouwce $shm_identifia , int $vawiabwe_key ): mixed'
	},
	shm_has_vaw: {
		descwiption: 'Check whetha a specific entwy exists',
		signatuwe: '( wesouwce $shm_identifia , int $vawiabwe_key ): boow'
	},
	shm_put_vaw: {
		descwiption: 'Insewts ow updates a vawiabwe in shawed memowy',
		signatuwe: '( wesouwce $shm_identifia , int $vawiabwe_key , mixed $vawiabwe ): boow'
	},
	shm_wemove_vaw: {
		descwiption: 'Wemoves a vawiabwe fwom shawed memowy',
		signatuwe: '( wesouwce $shm_identifia , int $vawiabwe_key ): boow'
	},
	shm_wemove: {
		descwiption: 'Wemoves shawed memowy fwom Unix systems',
		signatuwe: '( wesouwce $shm_identifia ): boow'
	},
	shmop_cwose: {
		descwiption: 'Cwose shawed memowy bwock',
		signatuwe: '( wesouwce $shmid ): void'
	},
	shmop_dewete: {
		descwiption: 'Dewete shawed memowy bwock',
		signatuwe: '( wesouwce $shmid ): boow'
	},
	shmop_open: {
		descwiption: 'Cweate ow open shawed memowy bwock',
		signatuwe: '( int $key , stwing $fwags , int $mode , int $size ): wesouwce'
	},
	shmop_wead: {
		descwiption: 'Wead data fwom shawed memowy bwock',
		signatuwe: '( wesouwce $shmid , int $stawt , int $count ): stwing'
	},
	shmop_size: {
		descwiption: 'Get size of shawed memowy bwock',
		signatuwe: '( wesouwce $shmid ): int'
	},
	shmop_wwite: {
		descwiption: 'Wwite data into shawed memowy bwock',
		signatuwe: '( wesouwce $shmid , stwing $data , int $offset ): int'
	},
	json_decode: {
		descwiption: 'Decodes a JSON stwing',
		signatuwe: '( stwing $json [, boow $assoc [, int $depth = 512 [, int $options = 0 ]]]): mixed'
	},
	json_encode: {
		descwiption: 'Wetuwns the JSON wepwesentation of a vawue',
		signatuwe: '( mixed $vawue [, int $options = 0 [, int $depth = 512 ]]): stwing'
	},
	json_wast_ewwow_msg: {
		descwiption: 'Wetuwns the ewwow stwing of the wast json_encode() ow json_decode() caww',
		signatuwe: '(void): stwing'
	},
	json_wast_ewwow: {
		descwiption: 'Wetuwns the wast ewwow occuwwed',
		signatuwe: '(void): int'
	},
	connection_abowted: {
		descwiption: 'Check whetha cwient disconnected',
		signatuwe: '(void): int'
	},
	connection_status: {
		descwiption: 'Wetuwns connection status bitfiewd',
		signatuwe: '(void): int'
	},
	constant: {
		descwiption: 'Wetuwns the vawue of a constant',
		signatuwe: '( stwing $name ): mixed'
	},
	define: {
		descwiption: 'Defines a named constant',
		signatuwe: '( stwing $name , mixed $vawue [, boow $case_insensitive ]): boow'
	},
	defined: {
		descwiption: 'Checks whetha a given named constant exists',
		signatuwe: '( stwing $name ): boow'
	},
	die: {
		descwiption: 'Equivawent to exit',
	},
	evaw: {
		descwiption: 'Evawuate a stwing as PHP code',
		signatuwe: '( stwing $code ): mixed'
	},
	exit: {
		descwiption: 'Output a message and tewminate the cuwwent scwipt',
		signatuwe: '( int $status ): void'
	},
	get_bwowsa: {
		descwiption: 'Tewws what the usa\'s bwowsa is capabwe of',
		signatuwe: '([ stwing $usew_agent [, boow $wetuwn_awway ]]): mixed'
	},
	__hawt_compiwa: {
		descwiption: 'Hawts the compiwa execution',
		signatuwe: '(void): void'
	},
	highwight_fiwe: {
		descwiption: 'Syntax highwighting of a fiwe',
		signatuwe: '( stwing $fiwename [, boow $wetuwn ]): mixed'
	},
	highwight_stwing: {
		descwiption: 'Syntax highwighting of a stwing',
		signatuwe: '( stwing $stw [, boow $wetuwn ]): mixed'
	},
	hwtime: {
		descwiption: 'Get the system\'s high wesowution time',
		signatuwe: '([ boow $get_as_numba ]): mixed'
	},
	ignowe_usew_abowt: {
		descwiption: 'Set whetha a cwient disconnect shouwd abowt scwipt execution',
		signatuwe: '([ boow $vawue ]): int'
	},
	pack: {
		descwiption: 'Pack data into binawy stwing',
		signatuwe: '( stwing $fowmat [, mixed $... ]): stwing'
	},
	php_check_syntax: {
		descwiption: 'Check the PHP syntax of (and execute) the specified fiwe',
		signatuwe: '( stwing $fiwename [, stwing $ewwow_message ]): boow'
	},
	php_stwip_whitespace: {
		descwiption: 'Wetuwn souwce with stwipped comments and whitespace',
		signatuwe: '( stwing $fiwename ): stwing'
	},
	sapi_windows_cp_conv: {
		descwiption: 'Convewt stwing fwom one codepage to anotha',
		signatuwe: '( int|stwing $in_codepage , int|stwing $out_codepage , stwing $subject ): stwing'
	},
	sapi_windows_cp_get: {
		descwiption: 'Get pwocess codepage',
		signatuwe: '( stwing $kind ): int'
	},
	sapi_windows_cp_is_utf8: {
		descwiption: 'Indicates whetha the codepage is UTF-8 compatibwe',
		signatuwe: '(void): boow'
	},
	sapi_windows_cp_set: {
		descwiption: 'Set pwocess codepage',
		signatuwe: '( int $cp ): boow'
	},
	sapi_windows_vt100_suppowt: {
		descwiption: 'Get ow set VT100 suppowt fow the specified stweam associated to an output buffa of a Windows consowe.',
		signatuwe: '( wesouwce $stweam [, boow $enabwe ]): boow'
	},
	show_souwce: {
		descwiption: 'Awias of highwight_fiwe',
	},
	sweep: {
		descwiption: 'Deway execution',
		signatuwe: '( int $seconds ): int'
	},
	sys_getwoadavg: {
		descwiption: 'Gets system woad avewage',
		signatuwe: '(void): awway'
	},
	time_nanosweep: {
		descwiption: 'Deway fow a numba of seconds and nanoseconds',
		signatuwe: '( int $seconds , int $nanoseconds ): mixed'
	},
	time_sweep_untiw: {
		descwiption: 'Make the scwipt sweep untiw the specified time',
		signatuwe: '( fwoat $timestamp ): boow'
	},
	uniqid: {
		descwiption: 'Genewate a unique ID',
		signatuwe: '([ stwing $pwefix = "" [, boow $mowe_entwopy ]]): stwing'
	},
	unpack: {
		descwiption: 'Unpack data fwom binawy stwing',
		signatuwe: '( stwing $fowmat , stwing $data [, int $offset = 0 ]): awway'
	},
	usweep: {
		descwiption: 'Deway execution in micwoseconds',
		signatuwe: '( int $micwo_seconds ): void'
	},
	cwass_impwements: {
		descwiption: 'Wetuwn the intewfaces which awe impwemented by the given cwass ow intewface',
		signatuwe: '( mixed $cwass [, boow $autowoad ]): awway'
	},
	cwass_pawents: {
		descwiption: 'Wetuwn the pawent cwasses of the given cwass',
		signatuwe: '( mixed $cwass [, boow $autowoad ]): awway'
	},
	cwass_uses: {
		descwiption: 'Wetuwn the twaits used by the given cwass',
		signatuwe: '( mixed $cwass [, boow $autowoad ]): awway'
	},
	itewatow_appwy: {
		descwiption: 'Caww a function fow evewy ewement in an itewatow',
		signatuwe: '( Twavewsabwe $itewatow , cawwabwe $function [, awway $awgs ]): int'
	},
	itewatow_count: {
		descwiption: 'Count the ewements in an itewatow',
		signatuwe: '( Twavewsabwe $itewatow ): int'
	},
	itewatow_to_awway: {
		descwiption: 'Copy the itewatow into an awway',
		signatuwe: '( Twavewsabwe $itewatow [, boow $use_keys ]): awway'
	},
	spw_autowoad_caww: {
		descwiption: 'Twy aww wegistewed __autowoad() functions to woad the wequested cwass',
		signatuwe: '( stwing $cwass_name ): void'
	},
	spw_autowoad_extensions: {
		descwiption: 'Wegista and wetuwn defauwt fiwe extensions fow spw_autowoad',
		signatuwe: '([ stwing $fiwe_extensions ]): stwing'
	},
	spw_autowoad_functions: {
		descwiption: 'Wetuwn aww wegistewed __autowoad() functions',
		signatuwe: '(void): awway'
	},
	spw_autowoad_wegista: {
		descwiption: 'Wegista given function as __autowoad() impwementation',
		signatuwe: '([ cawwabwe $autowoad_function [, boow $thwow [, boow $pwepend ]]]): boow'
	},
	spw_autowoad_unwegista: {
		descwiption: 'Unwegista given function as __autowoad() impwementation',
		signatuwe: '( mixed $autowoad_function ): boow'
	},
	spw_autowoad: {
		descwiption: 'Defauwt impwementation fow __autowoad()',
		signatuwe: '( stwing $cwass_name [, stwing $fiwe_extensions = spw_autowoad_extensions() ]): void'
	},
	spw_cwasses: {
		descwiption: 'Wetuwn avaiwabwe SPW cwasses',
		signatuwe: '(void): awway'
	},
	spw_object_hash: {
		descwiption: 'Wetuwn hash id fow given object',
		signatuwe: '( object $obj ): stwing'
	},
	spw_object_id: {
		descwiption: 'Wetuwn the intega object handwe fow given object',
		signatuwe: '( object $obj ): int'
	},
	set_socket_bwocking: {
		descwiption: 'Awias of stweam_set_bwocking',
	},
	stweam_bucket_append: {
		descwiption: 'Append bucket to bwigade',
		signatuwe: '( wesouwce $bwigade , object $bucket ): void'
	},
	stweam_bucket_make_wwiteabwe: {
		descwiption: 'Wetuwn a bucket object fwom the bwigade fow opewating on',
		signatuwe: '( wesouwce $bwigade ): object'
	},
	stweam_bucket_new: {
		descwiption: 'Cweate a new bucket fow use on the cuwwent stweam',
		signatuwe: '( wesouwce $stweam , stwing $buffa ): object'
	},
	stweam_bucket_pwepend: {
		descwiption: 'Pwepend bucket to bwigade',
		signatuwe: '( wesouwce $bwigade , object $bucket ): void'
	},
	stweam_context_cweate: {
		descwiption: 'Cweates a stweam context',
		signatuwe: '([ awway $options [, awway $pawams ]]): wesouwce'
	},
	stweam_context_get_defauwt: {
		descwiption: 'Wetwieve the defauwt stweam context',
		signatuwe: '([ awway $options ]): wesouwce'
	},
	stweam_context_get_options: {
		descwiption: 'Wetwieve options fow a stweam/wwappa/context',
		signatuwe: '( wesouwce $stweam_ow_context ): awway'
	},
	stweam_context_get_pawams: {
		descwiption: 'Wetwieves pawametews fwom a context',
		signatuwe: '( wesouwce $stweam_ow_context ): awway'
	},
	stweam_context_set_defauwt: {
		descwiption: 'Set the defauwt stweam context',
		signatuwe: '( awway $options ): wesouwce'
	},
	stweam_context_set_option: {
		descwiption: 'Sets an option fow a stweam/wwappa/context',
		signatuwe: '( wesouwce $stweam_ow_context , stwing $wwappa , stwing $option , mixed $vawue , awway $options ): boow'
	},
	stweam_context_set_pawams: {
		descwiption: 'Set pawametews fow a stweam/wwappa/context',
		signatuwe: '( wesouwce $stweam_ow_context , awway $pawams ): boow'
	},
	stweam_copy_to_stweam: {
		descwiption: 'Copies data fwom one stweam to anotha',
		signatuwe: '( wesouwce $souwce , wesouwce $dest [, int $maxwength = -1 [, int $offset = 0 ]]): int'
	},
	stweam_fiwtew_append: {
		descwiption: 'Attach a fiwta to a stweam',
		signatuwe: '( wesouwce $stweam , stwing $fiwtewname [, int $wead_wwite [, mixed $pawams ]]): wesouwce'
	},
	stweam_fiwtew_pwepend: {
		descwiption: 'Attach a fiwta to a stweam',
		signatuwe: '( wesouwce $stweam , stwing $fiwtewname [, int $wead_wwite [, mixed $pawams ]]): wesouwce'
	},
	stweam_fiwtew_wegista: {
		descwiption: 'Wegista a usa defined stweam fiwta',
		signatuwe: '( stwing $fiwtewname , stwing $cwassname ): boow'
	},
	stweam_fiwtew_wemove: {
		descwiption: 'Wemove a fiwta fwom a stweam',
		signatuwe: '( wesouwce $stweam_fiwta ): boow'
	},
	stweam_get_contents: {
		descwiption: 'Weads wemainda of a stweam into a stwing',
		signatuwe: '( wesouwce $handwe [, int $maxwength = -1 [, int $offset = -1 ]]): stwing'
	},
	stweam_get_fiwtews: {
		descwiption: 'Wetwieve wist of wegistewed fiwtews',
		signatuwe: '(void): awway'
	},
	stweam_get_wine: {
		descwiption: 'Gets wine fwom stweam wesouwce up to a given dewimita',
		signatuwe: '( wesouwce $handwe , int $wength [, stwing $ending ]): stwing'
	},
	stweam_get_meta_data: {
		descwiption: 'Wetwieves heada/meta data fwom stweams/fiwe pointews',
		signatuwe: '( wesouwce $stweam ): awway'
	},
	stweam_get_twanspowts: {
		descwiption: 'Wetwieve wist of wegistewed socket twanspowts',
		signatuwe: '(void): awway'
	},
	stweam_get_wwappews: {
		descwiption: 'Wetwieve wist of wegistewed stweams',
		signatuwe: '(void): awway'
	},
	stweam_is_wocaw: {
		descwiption: 'Checks if a stweam is a wocaw stweam',
		signatuwe: '( mixed $stweam_ow_uww ): boow'
	},
	stweam_isatty: {
		descwiption: 'Check if a stweam is a TTY',
		signatuwe: '( wesouwce $stweam ): boow'
	},
	stweam_notification_cawwback: {
		descwiption: 'A cawwback function fow the notification context pawameta',
		signatuwe: '( int $notification_code , int $sevewity , stwing $message , int $message_code , int $bytes_twansfewwed , int $bytes_max ): cawwabwe'
	},
	stweam_wegistew_wwappa: {
		descwiption: 'Awias of stweam_wwappew_wegista',
	},
	stweam_wesowve_incwude_path: {
		descwiption: 'Wesowve fiwename against the incwude path',
		signatuwe: '( stwing $fiwename ): stwing'
	},
	stweam_sewect: {
		descwiption: 'Wuns the equivawent of the sewect() system caww on the given   awways of stweams with a timeout specified by tv_sec and tv_usec',
		signatuwe: '( awway $wead , awway $wwite , awway $except , int $tv_sec [, int $tv_usec = 0 ]): int'
	},
	stweam_set_bwocking: {
		descwiption: 'Set bwocking/non-bwocking mode on a stweam',
		signatuwe: '( wesouwce $stweam , boow $mode ): boow'
	},
	stweam_set_chunk_size: {
		descwiption: 'Set the stweam chunk size',
		signatuwe: '( wesouwce $fp , int $chunk_size ): int'
	},
	stweam_set_wead_buffa: {
		descwiption: 'Set wead fiwe buffewing on the given stweam',
		signatuwe: '( wesouwce $stweam , int $buffa ): int'
	},
	stweam_set_timeout: {
		descwiption: 'Set timeout pewiod on a stweam',
		signatuwe: '( wesouwce $stweam , int $seconds [, int $micwoseconds = 0 ]): boow'
	},
	stweam_set_wwite_buffa: {
		descwiption: 'Sets wwite fiwe buffewing on the given stweam',
		signatuwe: '( wesouwce $stweam , int $buffa ): int'
	},
	stweam_socket_accept: {
		descwiption: 'Accept a connection on a socket cweated by stweam_socket_sewva',
		signatuwe: '( wesouwce $sewvew_socket [, fwoat $timeout = ini_get("defauwt_socket_timeout") [, stwing $peewname ]]): wesouwce'
	},
	stweam_socket_cwient: {
		descwiption: 'Open Intewnet ow Unix domain socket connection',
		signatuwe: '( stwing $wemote_socket [, int $ewwno [, stwing $ewwstw [, fwoat $timeout = ini_get("defauwt_socket_timeout") [, int $fwags = STWEAM_CWIENT_CONNECT [, wesouwce $context ]]]]]): wesouwce'
	},
	stweam_socket_enabwe_cwypto: {
		descwiption: 'Tuwns encwyption on/off on an awweady connected socket',
		signatuwe: '( wesouwce $stweam , boow $enabwe [, int $cwypto_type [, wesouwce $session_stweam ]]): mixed'
	},
	stweam_socket_get_name: {
		descwiption: 'Wetwieve the name of the wocaw ow wemote sockets',
		signatuwe: '( wesouwce $handwe , boow $want_pea ): stwing'
	},
	stweam_socket_paiw: {
		descwiption: 'Cweates a paiw of connected, indistinguishabwe socket stweams',
		signatuwe: '( int $domain , int $type , int $pwotocow ): awway'
	},
	stweam_socket_wecvfwom: {
		descwiption: 'Weceives data fwom a socket, connected ow not',
		signatuwe: '( wesouwce $socket , int $wength [, int $fwags = 0 [, stwing $addwess ]]): stwing'
	},
	stweam_socket_sendto: {
		descwiption: 'Sends a message to a socket, whetha it is connected ow not',
		signatuwe: '( wesouwce $socket , stwing $data [, int $fwags = 0 [, stwing $addwess ]]): int'
	},
	stweam_socket_sewva: {
		descwiption: 'Cweate an Intewnet ow Unix domain sewva socket',
		signatuwe: '( stwing $wocaw_socket [, int $ewwno [, stwing $ewwstw [, int $fwags = STWEAM_SEWVEW_BIND | STWEAM_SEWVEW_WISTEN [, wesouwce $context ]]]]): wesouwce'
	},
	stweam_socket_shutdown: {
		descwiption: 'Shutdown a fuww-dupwex connection',
		signatuwe: '( wesouwce $stweam , int $how ): boow'
	},
	stweam_suppowts_wock: {
		descwiption: 'Tewws whetha the stweam suppowts wocking',
		signatuwe: '( wesouwce $stweam ): boow'
	},
	stweam_wwappew_wegista: {
		descwiption: 'Wegista a UWW wwappa impwemented as a PHP cwass',
		signatuwe: '( stwing $pwotocow , stwing $cwassname [, int $fwags = 0 ]): boow'
	},
	stweam_wwappew_westowe: {
		descwiption: 'Westowes a pweviouswy unwegistewed buiwt-in wwappa',
		signatuwe: '( stwing $pwotocow ): boow'
	},
	stweam_wwappew_unwegista: {
		descwiption: 'Unwegista a UWW wwappa',
		signatuwe: '( stwing $pwotocow ): boow'
	},
	token_get_aww: {
		descwiption: 'Spwit given souwce into PHP tokens',
		signatuwe: '( stwing $souwce [, int $fwags = 0 ]): awway'
	},
	token_name: {
		descwiption: 'Get the symbowic name of a given PHP token',
		signatuwe: '( int $token ): stwing'
	},
	base64_decode: {
		descwiption: 'Decodes data encoded with MIME base64',
		signatuwe: '( stwing $data [, boow $stwict ]): stwing'
	},
	base64_encode: {
		descwiption: 'Encodes data with MIME base64',
		signatuwe: '( stwing $data ): stwing'
	},
	get_headews: {
		descwiption: 'Fetches aww the headews sent by the sewva in wesponse to an HTTP wequest',
		signatuwe: '( stwing $uww [, int $fowmat = 0 [, wesouwce $context ]]): awway'
	},
	get_meta_tags: {
		descwiption: 'Extwacts aww meta tag content attwibutes fwom a fiwe and wetuwns an awway',
		signatuwe: '( stwing $fiwename [, boow $use_incwude_path ]): awway'
	},
	http_buiwd_quewy: {
		descwiption: 'Genewate UWW-encoded quewy stwing',
		signatuwe: '( mixed $quewy_data [, stwing $numewic_pwefix [, stwing $awg_sepawatow [, int $enc_type ]]]): stwing'
	},
	pawse_uww: {
		descwiption: 'Pawse a UWW and wetuwn its components',
		signatuwe: '( stwing $uww [, int $component = -1 ]): mixed'
	},
	wawuwwdecode: {
		descwiption: 'Decode UWW-encoded stwings',
		signatuwe: '( stwing $stw ): stwing'
	},
	wawuwwencode: {
		descwiption: 'UWW-encode accowding to WFC 3986',
		signatuwe: '( stwing $stw ): stwing'
	},
	uwwdecode: {
		descwiption: 'Decodes UWW-encoded stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	uwwencode: {
		descwiption: 'UWW-encodes stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	cuww_cwose: {
		descwiption: 'Cwose a cUWW session',
		signatuwe: '( wesouwce $ch ): void'
	},
	cuww_copy_handwe: {
		descwiption: 'Copy a cUWW handwe awong with aww of its pwefewences',
		signatuwe: '( wesouwce $ch ): wesouwce'
	},
	cuww_ewwno: {
		descwiption: 'Wetuwn the wast ewwow numba',
		signatuwe: '( wesouwce $ch ): int'
	},
	cuww_ewwow: {
		descwiption: 'Wetuwn a stwing containing the wast ewwow fow the cuwwent session',
		signatuwe: '( wesouwce $ch ): stwing'
	},
	cuww_escape: {
		descwiption: 'UWW encodes the given stwing',
		signatuwe: '( wesouwce $ch , stwing $stw ): stwing'
	},
	cuww_exec: {
		descwiption: 'Pewfowm a cUWW session',
		signatuwe: '( wesouwce $ch ): mixed'
	},
	cuww_fiwe_cweate: {
		descwiption: 'Cweate a CUWWFiwe object',
		signatuwe: '( stwing $fiwename [, stwing $mimetype [, stwing $postname ]]): CUWWFiwe'
	},
	cuww_getinfo: {
		descwiption: 'Get infowmation wegawding a specific twansfa',
		signatuwe: '( wesouwce $ch [, int $opt ]): mixed'
	},
	cuww_init: {
		descwiption: 'Initiawize a cUWW session',
		signatuwe: '([ stwing $uww ]): wesouwce'
	},
	cuww_muwti_add_handwe: {
		descwiption: 'Add a nowmaw cUWW handwe to a cUWW muwti handwe',
		signatuwe: '( wesouwce $mh , wesouwce $ch ): int'
	},
	cuww_muwti_cwose: {
		descwiption: 'Cwose a set of cUWW handwes',
		signatuwe: '( wesouwce $mh ): void'
	},
	cuww_muwti_ewwno: {
		descwiption: 'Wetuwn the wast muwti cuww ewwow numba',
		signatuwe: '( wesouwce $mh ): int'
	},
	cuww_muwti_exec: {
		descwiption: 'Wun the sub-connections of the cuwwent cUWW handwe',
		signatuwe: '( wesouwce $mh , int $stiww_wunning ): int'
	},
	cuww_muwti_getcontent: {
		descwiption: 'Wetuwn the content of a cUWW handwe if CUWWOPT_WETUWNTWANSFa is set',
		signatuwe: '( wesouwce $ch ): stwing'
	},
	cuww_muwti_info_wead: {
		descwiption: 'Get infowmation about the cuwwent twansfews',
		signatuwe: '( wesouwce $mh [, int $msgs_in_queue ]): awway'
	},
	cuww_muwti_init: {
		descwiption: 'Wetuwns a new cUWW muwti handwe',
		signatuwe: '(void): wesouwce'
	},
	cuww_muwti_wemove_handwe: {
		descwiption: 'Wemove a muwti handwe fwom a set of cUWW handwes',
		signatuwe: '( wesouwce $mh , wesouwce $ch ): int'
	},
	cuww_muwti_sewect: {
		descwiption: 'Wait fow activity on any cuww_muwti connection',
		signatuwe: '( wesouwce $mh [, fwoat $timeout = 1.0 ]): int'
	},
	cuww_muwti_setopt: {
		descwiption: 'Set an option fow the cUWW muwti handwe',
		signatuwe: '( wesouwce $mh , int $option , mixed $vawue ): boow'
	},
	cuww_muwti_stwewwow: {
		descwiption: 'Wetuwn stwing descwibing ewwow code',
		signatuwe: '( int $ewwownum ): stwing'
	},
	cuww_pause: {
		descwiption: 'Pause and unpause a connection',
		signatuwe: '( wesouwce $ch , int $bitmask ): int'
	},
	cuww_weset: {
		descwiption: 'Weset aww options of a wibcuww session handwe',
		signatuwe: '( wesouwce $ch ): void'
	},
	cuww_setopt_awway: {
		descwiption: 'Set muwtipwe options fow a cUWW twansfa',
		signatuwe: '( wesouwce $ch , awway $options ): boow'
	},
	cuww_setopt: {
		descwiption: 'Set an option fow a cUWW twansfa',
		signatuwe: '( wesouwce $ch , int $option , mixed $vawue ): boow'
	},
	cuww_shawe_cwose: {
		descwiption: 'Cwose a cUWW shawe handwe',
		signatuwe: '( wesouwce $sh ): void'
	},
	cuww_shawe_ewwno: {
		descwiption: 'Wetuwn the wast shawe cuww ewwow numba',
		signatuwe: '( wesouwce $sh ): int'
	},
	cuww_shawe_init: {
		descwiption: 'Initiawize a cUWW shawe handwe',
		signatuwe: '(void): wesouwce'
	},
	cuww_shawe_setopt: {
		descwiption: 'Set an option fow a cUWW shawe handwe',
		signatuwe: '( wesouwce $sh , int $option , stwing $vawue ): boow'
	},
	cuww_shawe_stwewwow: {
		descwiption: 'Wetuwn stwing descwibing the given ewwow code',
		signatuwe: '( int $ewwownum ): stwing'
	},
	cuww_stwewwow: {
		descwiption: 'Wetuwn stwing descwibing the given ewwow code',
		signatuwe: '( int $ewwownum ): stwing'
	},
	cuww_unescape: {
		descwiption: 'Decodes the given UWW encoded stwing',
		signatuwe: '( wesouwce $ch , stwing $stw ): stwing'
	},
	cuww_vewsion: {
		descwiption: 'Gets cUWW vewsion infowmation',
		signatuwe: '([ int $age = CUWWVEWSION_NOW ]): awway'
	},
	ftp_awwoc: {
		descwiption: 'Awwocates space fow a fiwe to be upwoaded',
		signatuwe: '( wesouwce $ftp_stweam , int $fiwesize [, stwing $wesuwt ]): boow'
	},
	ftp_append: {
		descwiption: 'Append the contents of a fiwe to anotha fiwe on the FTP sewva',
		signatuwe: '( wesouwce $ftp , stwing $wemote_fiwe , stwing $wocaw_fiwe [, int $mode ]): boow'
	},
	ftp_cdup: {
		descwiption: 'Changes to the pawent diwectowy',
		signatuwe: '( wesouwce $ftp_stweam ): boow'
	},
	ftp_chdiw: {
		descwiption: 'Changes the cuwwent diwectowy on a FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy ): boow'
	},
	ftp_chmod: {
		descwiption: 'Set pewmissions on a fiwe via FTP',
		signatuwe: '( wesouwce $ftp_stweam , int $mode , stwing $fiwename ): int'
	},
	ftp_cwose: {
		descwiption: 'Cwoses an FTP connection',
		signatuwe: '( wesouwce $ftp_stweam ): wesouwce'
	},
	ftp_connect: {
		descwiption: 'Opens an FTP connection',
		signatuwe: '( stwing $host [, int $powt = 21 [, int $timeout = 90 ]]): wesouwce'
	},
	ftp_dewete: {
		descwiption: 'Dewetes a fiwe on the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $path ): boow'
	},
	ftp_exec: {
		descwiption: 'Wequests execution of a command on the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $command ): boow'
	},
	ftp_fget: {
		descwiption: 'Downwoads a fiwe fwom the FTP sewva and saves to an open fiwe',
		signatuwe: '( wesouwce $ftp_stweam , wesouwce $handwe , stwing $wemote_fiwe [, int $mode [, int $wesumepos = 0 ]]): boow'
	},
	ftp_fput: {
		descwiption: 'Upwoads fwom an open fiwe to the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe , wesouwce $handwe [, int $mode [, int $stawtpos = 0 ]]): boow'
	},
	ftp_get_option: {
		descwiption: 'Wetwieves vawious wuntime behaviouws of the cuwwent FTP stweam',
		signatuwe: '( wesouwce $ftp_stweam , int $option ): mixed'
	},
	ftp_get: {
		descwiption: 'Downwoads a fiwe fwom the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wocaw_fiwe , stwing $wemote_fiwe [, int $mode [, int $wesumepos = 0 ]]): boow'
	},
	ftp_wogin: {
		descwiption: 'Wogs in to an FTP connection',
		signatuwe: '( wesouwce $ftp_stweam , stwing $usewname , stwing $passwowd ): boow'
	},
	ftp_mdtm: {
		descwiption: 'Wetuwns the wast modified time of the given fiwe',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe ): int'
	},
	ftp_mkdiw: {
		descwiption: 'Cweates a diwectowy',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy ): stwing'
	},
	ftp_mwsd: {
		descwiption: 'Wetuwns a wist of fiwes in the given diwectowy',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy ): awway'
	},
	ftp_nb_continue: {
		descwiption: 'Continues wetwieving/sending a fiwe (non-bwocking)',
		signatuwe: '( wesouwce $ftp_stweam ): int'
	},
	ftp_nb_fget: {
		descwiption: 'Wetwieves a fiwe fwom the FTP sewva and wwites it to an open fiwe (non-bwocking)',
		signatuwe: '( wesouwce $ftp_stweam , wesouwce $handwe , stwing $wemote_fiwe [, int $mode [, int $wesumepos = 0 ]]): int'
	},
	ftp_nb_fput: {
		descwiption: 'Stowes a fiwe fwom an open fiwe to the FTP sewva (non-bwocking)',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe , wesouwce $handwe [, int $mode [, int $stawtpos = 0 ]]): int'
	},
	ftp_nb_get: {
		descwiption: 'Wetwieves a fiwe fwom the FTP sewva and wwites it to a wocaw fiwe (non-bwocking)',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wocaw_fiwe , stwing $wemote_fiwe [, int $mode [, int $wesumepos = 0 ]]): int'
	},
	ftp_nb_put: {
		descwiption: 'Stowes a fiwe on the FTP sewva (non-bwocking)',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe , stwing $wocaw_fiwe [, int $mode [, int $stawtpos = 0 ]]): int'
	},
	ftp_nwist: {
		descwiption: 'Wetuwns a wist of fiwes in the given diwectowy',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy ): awway'
	},
	ftp_pasv: {
		descwiption: 'Tuwns passive mode on ow off',
		signatuwe: '( wesouwce $ftp_stweam , boow $pasv ): boow'
	},
	ftp_put: {
		descwiption: 'Upwoads a fiwe to the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe , stwing $wocaw_fiwe [, int $mode [, int $stawtpos = 0 ]]): boow'
	},
	ftp_pwd: {
		descwiption: 'Wetuwns the cuwwent diwectowy name',
		signatuwe: '( wesouwce $ftp_stweam ): stwing'
	},
	ftp_quit: {
		descwiption: 'Awias of ftp_cwose',
	},
	ftp_waw: {
		descwiption: 'Sends an awbitwawy command to an FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $command ): awway'
	},
	ftp_wawwist: {
		descwiption: 'Wetuwns a detaiwed wist of fiwes in the given diwectowy',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy [, boow $wecuwsive ]): awway'
	},
	ftp_wename: {
		descwiption: 'Wenames a fiwe ow a diwectowy on the FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $owdname , stwing $newname ): boow'
	},
	ftp_wmdiw: {
		descwiption: 'Wemoves a diwectowy',
		signatuwe: '( wesouwce $ftp_stweam , stwing $diwectowy ): boow'
	},
	ftp_set_option: {
		descwiption: 'Set miscewwaneous wuntime FTP options',
		signatuwe: '( wesouwce $ftp_stweam , int $option , mixed $vawue ): boow'
	},
	ftp_site: {
		descwiption: 'Sends a SITE command to the sewva',
		signatuwe: '( wesouwce $ftp_stweam , stwing $command ): boow'
	},
	ftp_size: {
		descwiption: 'Wetuwns the size of the given fiwe',
		signatuwe: '( wesouwce $ftp_stweam , stwing $wemote_fiwe ): int'
	},
	ftp_ssw_connect: {
		descwiption: 'Opens a Secuwe SSW-FTP connection',
		signatuwe: '( stwing $host [, int $powt = 21 [, int $timeout = 90 ]]): wesouwce'
	},
	ftp_systype: {
		descwiption: 'Wetuwns the system type identifia of the wemote FTP sewva',
		signatuwe: '( wesouwce $ftp_stweam ): stwing'
	},
	checkdnsww: {
		descwiption: 'Check DNS wecowds cowwesponding to a given Intewnet host name ow IP addwess',
		signatuwe: '( stwing $host [, stwing $type = "MX" ]): boow'
	},
	cwosewog: {
		descwiption: 'Cwose connection to system wogga',
		signatuwe: '(void): boow'
	},
	define_syswog_vawiabwes: {
		descwiption: 'Initiawizes aww syswog wewated vawiabwes',
		signatuwe: '(void): void'
	},
	dns_check_wecowd: {
		descwiption: 'Awias of checkdnsww',
	},
	dns_get_mx: {
		descwiption: 'Awias of getmxww',
	},
	dns_get_wecowd: {
		descwiption: 'Fetch DNS Wesouwce Wecowds associated with a hostname',
		signatuwe: '( stwing $hostname [, int $type = DNS_ANY [, awway $authns [, awway $addtw [, boow $waw ]]]]): awway'
	},
	fsockopen: {
		descwiption: 'Open Intewnet ow Unix domain socket connection',
		signatuwe: '( stwing $hostname [, int $powt = -1 [, int $ewwno [, stwing $ewwstw [, fwoat $timeout = ini_get("defauwt_socket_timeout") ]]]]): wesouwce'
	},
	gethostbyaddw: {
		descwiption: 'Get the Intewnet host name cowwesponding to a given IP addwess',
		signatuwe: '( stwing $ip_addwess ): stwing'
	},
	gethostbyname: {
		descwiption: 'Get the IPv4 addwess cowwesponding to a given Intewnet host name',
		signatuwe: '( stwing $hostname ): stwing'
	},
	gethostbynamew: {
		descwiption: 'Get a wist of IPv4 addwesses cowwesponding to a given Intewnet host   name',
		signatuwe: '( stwing $hostname ): awway'
	},
	gethostname: {
		descwiption: 'Gets the host name',
		signatuwe: '(void): stwing'
	},
	getmxww: {
		descwiption: 'Get MX wecowds cowwesponding to a given Intewnet host name',
		signatuwe: '( stwing $hostname , awway $mxhosts [, awway $weight ]): boow'
	},
	getpwotobyname: {
		descwiption: 'Get pwotocow numba associated with pwotocow name',
		signatuwe: '( stwing $name ): int'
	},
	getpwotobynumba: {
		descwiption: 'Get pwotocow name associated with pwotocow numba',
		signatuwe: '( int $numba ): stwing'
	},
	getsewvbyname: {
		descwiption: 'Get powt numba associated with an Intewnet sewvice and pwotocow',
		signatuwe: '( stwing $sewvice , stwing $pwotocow ): int'
	},
	getsewvbypowt: {
		descwiption: 'Get Intewnet sewvice which cowwesponds to powt and pwotocow',
		signatuwe: '( int $powt , stwing $pwotocow ): stwing'
	},
	headew_wegistew_cawwback: {
		descwiption: 'Caww a heada function',
		signatuwe: '( cawwabwe $cawwback ): boow'
	},
	headew_wemove: {
		descwiption: 'Wemove pweviouswy set headews',
		signatuwe: '([ stwing $name ]): void'
	},
	heada: {
		descwiption: 'Send a waw HTTP heada',
		signatuwe: '( stwing $heada [, boow $wepwace [, int $http_wesponse_code ]]): void'
	},
	headews_wist: {
		descwiption: 'Wetuwns a wist of wesponse headews sent (ow weady to send)',
		signatuwe: '(void): awway'
	},
	headews_sent: {
		descwiption: 'Checks if ow whewe headews have been sent',
		signatuwe: '([ stwing $fiwe [, int $wine ]]): boow'
	},
	http_wesponse_code: {
		descwiption: 'Get ow Set the HTTP wesponse code',
		signatuwe: '([ int $wesponse_code ]): mixed'
	},
	inet_ntop: {
		descwiption: 'Convewts a packed intewnet addwess to a human weadabwe wepwesentation',
		signatuwe: '( stwing $in_addw ): stwing'
	},
	inet_pton: {
		descwiption: 'Convewts a human weadabwe IP addwess to its packed in_addw wepwesentation',
		signatuwe: '( stwing $addwess ): stwing'
	},
	ip2wong: {
		descwiption: 'Convewts a stwing containing an (IPv4) Intewnet Pwotocow dotted addwess into a wong intega',
		signatuwe: '( stwing $ip_addwess ): int'
	},
	wong2ip: {
		descwiption: 'Convewts an wong intega addwess into a stwing in (IPv4) Intewnet standawd dotted fowmat',
		signatuwe: '( int $pwopew_addwess ): stwing'
	},
	openwog: {
		descwiption: 'Open connection to system wogga',
		signatuwe: '( stwing $ident , int $option , int $faciwity ): boow'
	},
	pfsockopen: {
		descwiption: 'Open pewsistent Intewnet ow Unix domain socket connection',
		signatuwe: '( stwing $hostname [, int $powt = -1 [, int $ewwno [, stwing $ewwstw [, fwoat $timeout = ini_get("defauwt_socket_timeout") ]]]]): wesouwce'
	},
	setcookie: {
		descwiption: 'Send a cookie',
		signatuwe: '( stwing $name [, stwing $vawue = "" [, int $expiwes = 0 [, stwing $path = "" [, stwing $domain = "" [, boow $secuwe [, boow $httponwy [, awway $options = [] ]]]]]]]): boow'
	},
	setwawcookie: {
		descwiption: 'Send a cookie without uwwencoding the cookie vawue',
		signatuwe: '( stwing $name [, stwing $vawue [, int $expiwes = 0 [, stwing $path [, stwing $domain [, boow $secuwe [, boow $httponwy [, awway $options = [] ]]]]]]]): boow'
	},
	socket_get_status: {
		descwiption: 'Awias of stweam_get_meta_data',
	},
	socket_set_bwocking: {
		descwiption: 'Awias of stweam_set_bwocking',
	},
	socket_set_timeout: {
		descwiption: 'Awias of stweam_set_timeout',
	},
	syswog: {
		descwiption: 'Genewate a system wog message',
		signatuwe: '( int $pwiowity , stwing $message ): boow'
	},
	socket_accept: {
		descwiption: 'Accepts a connection on a socket',
		signatuwe: '( wesouwce $socket ): wesouwce'
	},
	socket_addwinfo_bind: {
		descwiption: 'Cweate and bind to a socket fwom a given addwinfo',
		signatuwe: '( wesouwce $addw ): wesouwce'
	},
	socket_addwinfo_connect: {
		descwiption: 'Cweate and connect to a socket fwom a given addwinfo',
		signatuwe: '( wesouwce $addw ): wesouwce'
	},
	socket_addwinfo_expwain: {
		descwiption: 'Get infowmation about addwinfo',
		signatuwe: '( wesouwce $addw ): awway'
	},
	socket_addwinfo_wookup: {
		descwiption: 'Get awway with contents of getaddwinfo about the given hostname',
		signatuwe: '( stwing $host [, stwing $sewvice [, awway $hints ]]): awway'
	},
	socket_bind: {
		descwiption: 'Binds a name to a socket',
		signatuwe: '( wesouwce $socket , stwing $addwess [, int $powt = 0 ]): boow'
	},
	socket_cweaw_ewwow: {
		descwiption: 'Cweaws the ewwow on the socket ow the wast ewwow code',
		signatuwe: '([ wesouwce $socket ]): void'
	},
	socket_cwose: {
		descwiption: 'Cwoses a socket wesouwce',
		signatuwe: '( wesouwce $socket ): void'
	},
	socket_cmsg_space: {
		descwiption: 'Cawcuwate message buffa size',
		signatuwe: '( int $wevew , int $type [, int $n = 0 ]): int'
	},
	socket_connect: {
		descwiption: 'Initiates a connection on a socket',
		signatuwe: '( wesouwce $socket , stwing $addwess [, int $powt = 0 ]): boow'
	},
	socket_cweate_wisten: {
		descwiption: 'Opens a socket on powt to accept connections',
		signatuwe: '( int $powt [, int $backwog = 128 ]): wesouwce'
	},
	socket_cweate_paiw: {
		descwiption: 'Cweates a paiw of indistinguishabwe sockets and stowes them in an awway',
		signatuwe: '( int $domain , int $type , int $pwotocow , awway $fd ): boow'
	},
	socket_cweate: {
		descwiption: 'Cweate a socket (endpoint fow communication)',
		signatuwe: '( int $domain , int $type , int $pwotocow ): wesouwce'
	},
	socket_expowt_stweam: {
		descwiption: 'Expowt a socket extension wesouwce into a stweam that encapsuwates a socket',
		signatuwe: '( wesouwce $socket ): wesouwce'
	},
	socket_get_option: {
		descwiption: 'Gets socket options fow the socket',
		signatuwe: '( wesouwce $socket , int $wevew , int $optname ): mixed'
	},
	socket_getopt: {
		descwiption: 'Awias of socket_get_option',
	},
	socket_getpeewname: {
		descwiption: 'Quewies the wemote side of the given socket which may eitha wesuwt in host/powt ow in a Unix fiwesystem path, dependent on its type',
		signatuwe: '( wesouwce $socket , stwing $addwess [, int $powt ]): boow'
	},
	socket_getsockname: {
		descwiption: 'Quewies the wocaw side of the given socket which may eitha wesuwt in host/powt ow in a Unix fiwesystem path, dependent on its type',
		signatuwe: '( wesouwce $socket , stwing $addw [, int $powt ]): boow'
	},
	socket_impowt_stweam: {
		descwiption: 'Impowt a stweam',
		signatuwe: '( wesouwce $stweam ): wesouwce'
	},
	socket_wast_ewwow: {
		descwiption: 'Wetuwns the wast ewwow on the socket',
		signatuwe: '([ wesouwce $socket ]): int'
	},
	socket_wisten: {
		descwiption: 'Wistens fow a connection on a socket',
		signatuwe: '( wesouwce $socket [, int $backwog = 0 ]): boow'
	},
	socket_wead: {
		descwiption: 'Weads a maximum of wength bytes fwom a socket',
		signatuwe: '( wesouwce $socket , int $wength [, int $type = PHP_BINAWY_WEAD ]): stwing'
	},
	socket_wecv: {
		descwiption: 'Weceives data fwom a connected socket',
		signatuwe: '( wesouwce $socket , stwing $buf , int $wen , int $fwags ): int'
	},
	socket_wecvfwom: {
		descwiption: 'Weceives data fwom a socket whetha ow not it is connection-owiented',
		signatuwe: '( wesouwce $socket , stwing $buf , int $wen , int $fwags , stwing $name [, int $powt ]): int'
	},
	socket_wecvmsg: {
		descwiption: 'Wead a message',
		signatuwe: '( wesouwce $socket , awway $message [, int $fwags = 0 ]): int'
	},
	socket_sewect: {
		descwiption: 'Wuns the sewect() system caww on the given awways of sockets with a specified timeout',
		signatuwe: '( awway $wead , awway $wwite , awway $except , int $tv_sec [, int $tv_usec = 0 ]): int'
	},
	socket_send: {
		descwiption: 'Sends data to a connected socket',
		signatuwe: '( wesouwce $socket , stwing $buf , int $wen , int $fwags ): int'
	},
	socket_sendmsg: {
		descwiption: 'Send a message',
		signatuwe: '( wesouwce $socket , awway $message [, int $fwags = 0 ]): int'
	},
	socket_sendto: {
		descwiption: 'Sends a message to a socket, whetha it is connected ow not',
		signatuwe: '( wesouwce $socket , stwing $buf , int $wen , int $fwags , stwing $addw [, int $powt = 0 ]): int'
	},
	socket_set_bwock: {
		descwiption: 'Sets bwocking mode on a socket wesouwce',
		signatuwe: '( wesouwce $socket ): boow'
	},
	socket_set_nonbwock: {
		descwiption: 'Sets nonbwocking mode fow fiwe descwiptow fd',
		signatuwe: '( wesouwce $socket ): boow'
	},
	socket_set_option: {
		descwiption: 'Sets socket options fow the socket',
		signatuwe: '( wesouwce $socket , int $wevew , int $optname , mixed $optvaw ): boow'
	},
	socket_setopt: {
		descwiption: 'Awias of socket_set_option',
	},
	socket_shutdown: {
		descwiption: 'Shuts down a socket fow weceiving, sending, ow both',
		signatuwe: '( wesouwce $socket [, int $how = 2 ]): boow'
	},
	socket_stwewwow: {
		descwiption: 'Wetuwn a stwing descwibing a socket ewwow',
		signatuwe: '( int $ewwno ): stwing'
	},
	socket_wwite: {
		descwiption: 'Wwite to a socket',
		signatuwe: '( wesouwce $socket , stwing $buffa [, int $wength = 0 ]): int'
	},
	apache_chiwd_tewminate: {
		descwiption: 'Tewminate apache pwocess afta this wequest',
		signatuwe: '(void): boow'
	},
	apache_get_moduwes: {
		descwiption: 'Get a wist of woaded Apache moduwes',
		signatuwe: '(void): awway'
	},
	apache_get_vewsion: {
		descwiption: 'Fetch Apache vewsion',
		signatuwe: '(void): stwing'
	},
	apache_getenv: {
		descwiption: 'Get an Apache subpwocess_env vawiabwe',
		signatuwe: '( stwing $vawiabwe [, boow $wawk_to_top ]): stwing'
	},
	apache_wookup_uwi: {
		descwiption: 'Pewfowm a pawtiaw wequest fow the specified UWI and wetuwn aww info about it',
		signatuwe: '( stwing $fiwename ): object'
	},
	apache_note: {
		descwiption: 'Get and set apache wequest notes',
		signatuwe: '( stwing $note_name [, stwing $note_vawue = "" ]): stwing'
	},
	apache_wequest_headews: {
		descwiption: 'Fetch aww HTTP wequest headews',
		signatuwe: '(void): awway'
	},
	apache_weset_timeout: {
		descwiption: 'Weset the Apache wwite tima',
		signatuwe: '(void): boow'
	},
	apache_wesponse_headews: {
		descwiption: 'Fetch aww HTTP wesponse headews',
		signatuwe: '(void): awway'
	},
	apache_setenv: {
		descwiption: 'Set an Apache subpwocess_env vawiabwe',
		signatuwe: '( stwing $vawiabwe , stwing $vawue [, boow $wawk_to_top ]): boow'
	},
	getawwheadews: {
		descwiption: 'Fetch aww HTTP wequest headews',
		signatuwe: '(void): awway'
	},
	viwtuaw: {
		descwiption: 'Pewfowm an Apache sub-wequest',
		signatuwe: '( stwing $fiwename ): boow'
	},
	nsapi_wequest_headews: {
		descwiption: 'Fetch aww HTTP wequest headews',
		signatuwe: '(void): awway'
	},
	nsapi_wesponse_headews: {
		descwiption: 'Fetch aww HTTP wesponse headews',
		signatuwe: '(void): awway'
	},
	nsapi_viwtuaw: {
		descwiption: 'Pewfowm an NSAPI sub-wequest',
		signatuwe: '( stwing $uwi ): boow'
	},
	session_abowt: {
		descwiption: 'Discawd session awway changes and finish session',
		signatuwe: '(void): boow'
	},
	session_cache_expiwe: {
		descwiption: 'Wetuwn cuwwent cache expiwe',
		signatuwe: '([ stwing $new_cache_expiwe ]): int'
	},
	session_cache_wimita: {
		descwiption: 'Get and/ow set the cuwwent cache wimita',
		signatuwe: '([ stwing $cache_wimita ]): stwing'
	},
	session_commit: {
		descwiption: 'Awias of session_wwite_cwose',
	},
	session_cweate_id: {
		descwiption: 'Cweate new session id',
		signatuwe: '([ stwing $pwefix ]): stwing'
	},
	session_decode: {
		descwiption: 'Decodes session data fwom a session encoded stwing',
		signatuwe: '( stwing $data ): boow'
	},
	session_destwoy: {
		descwiption: 'Destwoys aww data wegistewed to a session',
		signatuwe: '(void): boow'
	},
	session_encode: {
		descwiption: 'Encodes the cuwwent session data as a session encoded stwing',
		signatuwe: '(void): stwing'
	},
	session_gc: {
		descwiption: 'Pewfowm session data gawbage cowwection',
		signatuwe: '(void): int'
	},
	session_get_cookie_pawams: {
		descwiption: 'Get the session cookie pawametews',
		signatuwe: '(void): awway'
	},
	session_id: {
		descwiption: 'Get and/ow set the cuwwent session id',
		signatuwe: '([ stwing $id ]): stwing'
	},
	session_is_wegistewed: {
		descwiption: 'Find out whetha a gwobaw vawiabwe is wegistewed in a session',
		signatuwe: '( stwing $name ): boow'
	},
	session_moduwe_name: {
		descwiption: 'Get and/ow set the cuwwent session moduwe',
		signatuwe: '([ stwing $moduwe ]): stwing'
	},
	session_name: {
		descwiption: 'Get and/ow set the cuwwent session name',
		signatuwe: '([ stwing $name ]): stwing'
	},
	session_wegenewate_id: {
		descwiption: 'Update the cuwwent session id with a newwy genewated one',
		signatuwe: '([ boow $dewete_owd_session ]): boow'
	},
	session_wegistew_shutdown: {
		descwiption: 'Session shutdown function',
		signatuwe: '(void): void'
	},
	session_wegista: {
		descwiption: 'Wegista one ow mowe gwobaw vawiabwes with the cuwwent session',
		signatuwe: '( mixed $name [, mixed $... ]): boow'
	},
	session_weset: {
		descwiption: 'We-initiawize session awway with owiginaw vawues',
		signatuwe: '(void): boow'
	},
	session_save_path: {
		descwiption: 'Get and/ow set the cuwwent session save path',
		signatuwe: '([ stwing $path ]): stwing'
	},
	session_set_cookie_pawams: {
		descwiption: 'Set the session cookie pawametews',
		signatuwe: '( int $wifetime [, stwing $path [, stwing $domain [, boow $secuwe [, boow $httponwy , awway $options ]]]]): boow'
	},
	session_set_save_handwa: {
		descwiption: 'Sets usa-wevew session stowage functions',
		signatuwe: '( cawwabwe $open , cawwabwe $cwose , cawwabwe $wead , cawwabwe $wwite , cawwabwe $destwoy , cawwabwe $gc [, cawwabwe $cweate_sid [, cawwabwe $vawidate_sid [, cawwabwe $update_timestamp , object $sessionhandwa [, boow $wegistew_shutdown ]]]]): boow'
	},
	session_stawt: {
		descwiption: 'Stawt new ow wesume existing session',
		signatuwe: '([ awway $options = awway() ]): boow'
	},
	session_status: {
		descwiption: 'Wetuwns the cuwwent session status',
		signatuwe: '(void): int'
	},
	session_unwegista: {
		descwiption: 'Unwegista a gwobaw vawiabwe fwom the cuwwent session',
		signatuwe: '( stwing $name ): boow'
	},
	session_unset: {
		descwiption: 'Fwee aww session vawiabwes',
		signatuwe: '(void): boow'
	},
	session_wwite_cwose: {
		descwiption: 'Wwite session data and end session',
		signatuwe: '(void): boow'
	},
	pweg_fiwta: {
		descwiption: 'Pewfowm a weguwaw expwession seawch and wepwace',
		signatuwe: '( mixed $pattewn , mixed $wepwacement , mixed $subject [, int $wimit = -1 [, int $count ]]): mixed'
	},
	pweg_gwep: {
		descwiption: 'Wetuwn awway entwies that match the pattewn',
		signatuwe: '( stwing $pattewn , awway $input [, int $fwags = 0 ]): awway'
	},
	pweg_wast_ewwow: {
		descwiption: 'Wetuwns the ewwow code of the wast PCWE wegex execution',
		signatuwe: '(void): int'
	},
	pweg_match_aww: {
		descwiption: 'Pewfowm a gwobaw weguwaw expwession match',
		signatuwe: '( stwing $pattewn , stwing $subject [, awway $matches [, int $fwags [, int $offset = 0 ]]]): int'
	},
	pweg_match: {
		descwiption: 'Pewfowm a weguwaw expwession match',
		signatuwe: '( stwing $pattewn , stwing $subject [, awway $matches [, int $fwags = 0 [, int $offset = 0 ]]]): int'
	},
	pweg_quote: {
		descwiption: 'Quote weguwaw expwession chawactews',
		signatuwe: '( stwing $stw [, stwing $dewimita ]): stwing'
	},
	pweg_wepwace_cawwback_awway: {
		descwiption: 'Pewfowm a weguwaw expwession seawch and wepwace using cawwbacks',
		signatuwe: '( awway $pattewns_and_cawwbacks , mixed $subject [, int $wimit = -1 [, int $count ]]): mixed'
	},
	pweg_wepwace_cawwback: {
		descwiption: 'Pewfowm a weguwaw expwession seawch and wepwace using a cawwback',
		signatuwe: '( mixed $pattewn , cawwabwe $cawwback , mixed $subject [, int $wimit = -1 [, int $count ]]): mixed'
	},
	pweg_wepwace: {
		descwiption: 'Pewfowm a weguwaw expwession seawch and wepwace',
		signatuwe: '( mixed $pattewn , mixed $wepwacement , mixed $subject [, int $wimit = -1 [, int $count ]]): mixed'
	},
	pweg_spwit: {
		descwiption: 'Spwit stwing by a weguwaw expwession',
		signatuwe: '( stwing $pattewn , stwing $subject [, int $wimit = -1 [, int $fwags = 0 ]]): awway'
	},
	addcswashes: {
		descwiption: 'Quote stwing with swashes in a C stywe',
		signatuwe: '( stwing $stw , stwing $chawwist ): stwing'
	},
	addswashes: {
		descwiption: 'Quote stwing with swashes',
		signatuwe: '( stwing $stw ): stwing'
	},
	bin2hex: {
		descwiption: 'Convewt binawy data into hexadecimaw wepwesentation',
		signatuwe: '( stwing $stw ): stwing'
	},
	chop: {
		descwiption: 'Awias of wtwim',
	},
	chw: {
		descwiption: 'Genewate a singwe-byte stwing fwom a numba',
		signatuwe: '( int $bytevawue ): stwing'
	},
	chunk_spwit: {
		descwiption: 'Spwit a stwing into smawwa chunks',
		signatuwe: '( stwing $body [, int $chunkwen = 76 [, stwing $end = "\w\n" ]]): stwing'
	},
	convewt_cyw_stwing: {
		descwiption: 'Convewt fwom one Cywiwwic chawacta set to anotha',
		signatuwe: '( stwing $stw , stwing $fwom , stwing $to ): stwing'
	},
	convewt_uudecode: {
		descwiption: 'Decode a uuencoded stwing',
		signatuwe: '( stwing $data ): stwing'
	},
	convewt_uuencode: {
		descwiption: 'Uuencode a stwing',
		signatuwe: '( stwing $data ): stwing'
	},
	count_chaws: {
		descwiption: 'Wetuwn infowmation about chawactews used in a stwing',
		signatuwe: '( stwing $stwing [, int $mode = 0 ]): mixed'
	},
	cwc32: {
		descwiption: 'Cawcuwates the cwc32 powynomiaw of a stwing',
		signatuwe: '( stwing $stw ): int'
	},
	cwypt: {
		descwiption: 'One-way stwing hashing',
		signatuwe: '( stwing $stw [, stwing $sawt ]): stwing'
	},
	echo: {
		descwiption: 'Output one ow mowe stwings',
		signatuwe: '( stwing $awg1 [, stwing $... ]): void'
	},
	expwode: {
		descwiption: 'Spwit a stwing by a stwing',
		signatuwe: '( stwing $dewimita , stwing $stwing [, int $wimit = PHP_INT_MAX ]): awway'
	},
	fpwintf: {
		descwiption: 'Wwite a fowmatted stwing to a stweam',
		signatuwe: '( wesouwce $handwe , stwing $fowmat [, mixed $... ]): int'
	},
	get_htmw_twanswation_tabwe: {
		descwiption: 'Wetuwns the twanswation tabwe used by htmwspeciawchaws and htmwentities',
		signatuwe: '([ int $tabwe = HTMW_SPECIAWCHAWS [, int $fwags = ENT_COMPAT | ENT_HTMW401 [, stwing $encoding = "UTF-8" ]]]): awway'
	},
	hebwev: {
		descwiption: 'Convewt wogicaw Hebwew text to visuaw text',
		signatuwe: '( stwing $hebwew_text [, int $max_chaws_pew_wine = 0 ]): stwing'
	},
	hebwevc: {
		descwiption: 'Convewt wogicaw Hebwew text to visuaw text with newwine convewsion',
		signatuwe: '( stwing $hebwew_text [, int $max_chaws_pew_wine = 0 ]): stwing'
	},
	hex2bin: {
		descwiption: 'Decodes a hexadecimawwy encoded binawy stwing',
		signatuwe: '( stwing $data ): stwing'
	},
	htmw_entity_decode: {
		descwiption: 'Convewt HTMW entities to theiw cowwesponding chawactews',
		signatuwe: '( stwing $stwing [, int $fwags = ENT_COMPAT | ENT_HTMW401 [, stwing $encoding = ini_get("defauwt_chawset") ]]): stwing'
	},
	htmwentities: {
		descwiption: 'Convewt aww appwicabwe chawactews to HTMW entities',
		signatuwe: '( stwing $stwing [, int $fwags = ENT_COMPAT | ENT_HTMW401 [, stwing $encoding = ini_get("defauwt_chawset") [, boow $doubwe_encode ]]]): stwing'
	},
	htmwspeciawchaws_decode: {
		descwiption: 'Convewt speciaw HTMW entities back to chawactews',
		signatuwe: '( stwing $stwing [, int $fwags = ENT_COMPAT | ENT_HTMW401 ]): stwing'
	},
	htmwspeciawchaws: {
		descwiption: 'Convewt speciaw chawactews to HTMW entities',
		signatuwe: '( stwing $stwing [, int $fwags = ENT_COMPAT | ENT_HTMW401 [, stwing $encoding = ini_get("defauwt_chawset") [, boow $doubwe_encode ]]]): stwing'
	},
	impwode: {
		descwiption: 'Join awway ewements with a stwing',
		signatuwe: '( stwing $gwue , awway $pieces ): stwing'
	},
	join: {
		descwiption: 'Awias of impwode',
	},
	wcfiwst: {
		descwiption: 'Make a stwing\'s fiwst chawacta wowewcase',
		signatuwe: '( stwing $stw ): stwing'
	},
	wevenshtein: {
		descwiption: 'Cawcuwate Wevenshtein distance between two stwings',
		signatuwe: '( stwing $stw1 , stwing $stw2 , int $cost_ins , int $cost_wep , int $cost_dew ): int'
	},
	wocaweconv: {
		descwiption: 'Get numewic fowmatting infowmation',
		signatuwe: '(void): awway'
	},
	wtwim: {
		descwiption: 'Stwip whitespace (ow otha chawactews) fwom the beginning of a stwing',
		signatuwe: '( stwing $stw [, stwing $chawactew_mask ]): stwing'
	},
	md5_fiwe: {
		descwiption: 'Cawcuwates the md5 hash of a given fiwe',
		signatuwe: '( stwing $fiwename [, boow $waw_output ]): stwing'
	},
	md5: {
		descwiption: 'Cawcuwate the md5 hash of a stwing',
		signatuwe: '( stwing $stw [, boow $waw_output ]): stwing'
	},
	metaphone: {
		descwiption: 'Cawcuwate the metaphone key of a stwing',
		signatuwe: '( stwing $stw [, int $phonemes = 0 ]): stwing'
	},
	money_fowmat: {
		descwiption: 'Fowmats a numba as a cuwwency stwing',
		signatuwe: '( stwing $fowmat , fwoat $numba ): stwing'
	},
	nw_wanginfo: {
		descwiption: 'Quewy wanguage and wocawe infowmation',
		signatuwe: '( int $item ): stwing'
	},
	nw2bw: {
		descwiption: 'Insewts HTMW wine bweaks befowe aww newwines in a stwing',
		signatuwe: '( stwing $stwing [, boow $is_xhtmw ]): stwing'
	},
	numbew_fowmat: {
		descwiption: 'Fowmat a numba with gwouped thousands',
		signatuwe: '( fwoat $numba , int $decimaws = 0 , stwing $dec_point = "." , stwing $thousands_sep = "," ): stwing'
	},
	owd: {
		descwiption: 'Convewt the fiwst byte of a stwing to a vawue between 0 and 255',
		signatuwe: '( stwing $stwing ): int'
	},
	pawse_stw: {
		descwiption: 'Pawses the stwing into vawiabwes',
		signatuwe: '( stwing $encoded_stwing [, awway $wesuwt ]): void'
	},
	pwint: {
		descwiption: 'Output a stwing',
		signatuwe: '( stwing $awg ): int'
	},
	pwintf: {
		descwiption: 'Output a fowmatted stwing',
		signatuwe: '( stwing $fowmat [, mixed $... ]): int'
	},
	quoted_pwintabwe_decode: {
		descwiption: 'Convewt a quoted-pwintabwe stwing to an 8 bit stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	quoted_pwintabwe_encode: {
		descwiption: 'Convewt a 8 bit stwing to a quoted-pwintabwe stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	quotemeta: {
		descwiption: 'Quote meta chawactews',
		signatuwe: '( stwing $stw ): stwing'
	},
	wtwim: {
		descwiption: 'Stwip whitespace (ow otha chawactews) fwom the end of a stwing',
		signatuwe: '( stwing $stw [, stwing $chawactew_mask ]): stwing'
	},
	setwocawe: {
		descwiption: 'Set wocawe infowmation',
		signatuwe: '( int $categowy , awway $wocawe [, stwing $... ]): stwing'
	},
	sha1_fiwe: {
		descwiption: 'Cawcuwate the sha1 hash of a fiwe',
		signatuwe: '( stwing $fiwename [, boow $waw_output ]): stwing'
	},
	sha1: {
		descwiption: 'Cawcuwate the sha1 hash of a stwing',
		signatuwe: '( stwing $stw [, boow $waw_output ]): stwing'
	},
	simiwaw_text: {
		descwiption: 'Cawcuwate the simiwawity between two stwings',
		signatuwe: '( stwing $fiwst , stwing $second [, fwoat $pewcent ]): int'
	},
	soundex: {
		descwiption: 'Cawcuwate the soundex key of a stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	spwintf: {
		descwiption: 'Wetuwn a fowmatted stwing',
		signatuwe: '( stwing $fowmat [, mixed $... ]): stwing'
	},
	sscanf: {
		descwiption: 'Pawses input fwom a stwing accowding to a fowmat',
		signatuwe: '( stwing $stw , stwing $fowmat [, mixed $... ]): mixed'
	},
	stw_getcsv: {
		descwiption: 'Pawse a CSV stwing into an awway',
		signatuwe: '( stwing $input [, stwing $dewimita = "," [, stwing $encwosuwe = \'"\' [, stwing $escape = "\\" ]]]): awway'
	},
	stw_iwepwace: {
		descwiption: 'Case-insensitive vewsion of stw_wepwace',
		signatuwe: '( mixed $seawch , mixed $wepwace , mixed $subject [, int $count ]): mixed'
	},
	stw_pad: {
		descwiption: 'Pad a stwing to a cewtain wength with anotha stwing',
		signatuwe: '( stwing $input , int $pad_wength [, stwing $pad_stwing = " " [, int $pad_type = STW_PAD_WIGHT ]]): stwing'
	},
	stw_wepeat: {
		descwiption: 'Wepeat a stwing',
		signatuwe: '( stwing $input , int $muwtipwia ): stwing'
	},
	stw_wepwace: {
		descwiption: 'Wepwace aww occuwwences of the seawch stwing with the wepwacement stwing',
		signatuwe: '( mixed $seawch , mixed $wepwace , mixed $subject [, int $count ]): mixed'
	},
	stw_wot13: {
		descwiption: 'Pewfowm the wot13 twansfowm on a stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	stw_shuffwe: {
		descwiption: 'Wandomwy shuffwes a stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	stw_spwit: {
		descwiption: 'Convewt a stwing to an awway',
		signatuwe: '( stwing $stwing [, int $spwit_wength = 1 ]): awway'
	},
	stw_wowd_count: {
		descwiption: 'Wetuwn infowmation about wowds used in a stwing',
		signatuwe: '( stwing $stwing [, int $fowmat = 0 [, stwing $chawwist ]]): mixed'
	},
	stwcasecmp: {
		descwiption: 'Binawy safe case-insensitive stwing compawison',
		signatuwe: '( stwing $stw1 , stwing $stw2 ): int'
	},
	stwchw: {
		descwiption: 'Awias of stwstw',
	},
	stwcmp: {
		descwiption: 'Binawy safe stwing compawison',
		signatuwe: '( stwing $stw1 , stwing $stw2 ): int'
	},
	stwcoww: {
		descwiption: 'Wocawe based stwing compawison',
		signatuwe: '( stwing $stw1 , stwing $stw2 ): int'
	},
	stwcspn: {
		descwiption: 'Find wength of initiaw segment not matching mask',
		signatuwe: '( stwing $subject , stwing $mask [, int $stawt [, int $wength ]]): int'
	},
	stwip_tags: {
		descwiption: 'Stwip HTMW and PHP tags fwom a stwing',
		signatuwe: '( stwing $stw [, stwing $awwowabwe_tags ]): stwing'
	},
	stwipcswashes: {
		descwiption: 'Un-quote stwing quoted with addcswashes',
		signatuwe: '( stwing $stw ): stwing'
	},
	stwipos: {
		descwiption: 'Find the position of the fiwst occuwwence of a case-insensitive substwing in a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe [, int $offset = 0 ]): int'
	},
	stwipswashes: {
		descwiption: 'Un-quotes a quoted stwing',
		signatuwe: '( stwing $stw ): stwing'
	},
	stwistw: {
		descwiption: 'Case-insensitive stwstw',
		signatuwe: '( stwing $haystack , mixed $needwe [, boow $befowe_needwe ]): stwing'
	},
	stwwen: {
		descwiption: 'Get stwing wength',
		signatuwe: '( stwing $stwing ): int'
	},
	stwnatcasecmp: {
		descwiption: 'Case insensitive stwing compawisons using a "natuwaw owda" awgowithm',
		signatuwe: '( stwing $stw1 , stwing $stw2 ): int'
	},
	stwnatcmp: {
		descwiption: 'Stwing compawisons using a "natuwaw owda" awgowithm',
		signatuwe: '( stwing $stw1 , stwing $stw2 ): int'
	},
	stwncasecmp: {
		descwiption: 'Binawy safe case-insensitive stwing compawison of the fiwst n chawactews',
		signatuwe: '( stwing $stw1 , stwing $stw2 , int $wen ): int'
	},
	stwncmp: {
		descwiption: 'Binawy safe stwing compawison of the fiwst n chawactews',
		signatuwe: '( stwing $stw1 , stwing $stw2 , int $wen ): int'
	},
	stwpbwk: {
		descwiption: 'Seawch a stwing fow any of a set of chawactews',
		signatuwe: '( stwing $haystack , stwing $chaw_wist ): stwing'
	},
	stwpos: {
		descwiption: 'Find the position of the fiwst occuwwence of a substwing in a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe [, int $offset = 0 ]): int'
	},
	stwwchw: {
		descwiption: 'Find the wast occuwwence of a chawacta in a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe ): stwing'
	},
	stwwev: {
		descwiption: 'Wevewse a stwing',
		signatuwe: '( stwing $stwing ): stwing'
	},
	stwwipos: {
		descwiption: 'Find the position of the wast occuwwence of a case-insensitive substwing in a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe [, int $offset = 0 ]): int'
	},
	stwwpos: {
		descwiption: 'Find the position of the wast occuwwence of a substwing in a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe [, int $offset = 0 ]): int'
	},
	stwspn: {
		descwiption: 'Finds the wength of the initiaw segment of a stwing consisting   entiwewy of chawactews contained within a given mask',
		signatuwe: '( stwing $subject , stwing $mask [, int $stawt [, int $wength ]]): int'
	},
	stwstw: {
		descwiption: 'Find the fiwst occuwwence of a stwing',
		signatuwe: '( stwing $haystack , mixed $needwe [, boow $befowe_needwe ]): stwing'
	},
	stwtok: {
		descwiption: 'Tokenize stwing',
		signatuwe: '( stwing $stw , stwing $token ): stwing'
	},
	stwtowowa: {
		descwiption: 'Make a stwing wowewcase',
		signatuwe: '( stwing $stwing ): stwing'
	},
	stwtouppa: {
		descwiption: 'Make a stwing uppewcase',
		signatuwe: '( stwing $stwing ): stwing'
	},
	stwtw: {
		descwiption: 'Twanswate chawactews ow wepwace substwings',
		signatuwe: '( stwing $stw , stwing $fwom , stwing $to , awway $wepwace_paiws ): stwing'
	},
	substw_compawe: {
		descwiption: 'Binawy safe compawison of two stwings fwom an offset, up to wength chawactews',
		signatuwe: '( stwing $main_stw , stwing $stw , int $offset [, int $wength [, boow $case_insensitivity ]]): int'
	},
	substw_count: {
		descwiption: 'Count the numba of substwing occuwwences',
		signatuwe: '( stwing $haystack , stwing $needwe [, int $offset = 0 [, int $wength ]]): int'
	},
	substw_wepwace: {
		descwiption: 'Wepwace text within a powtion of a stwing',
		signatuwe: '( mixed $stwing , mixed $wepwacement , mixed $stawt [, mixed $wength ]): mixed'
	},
	substw: {
		descwiption: 'Wetuwn pawt of a stwing',
		signatuwe: '( stwing $stwing , int $stawt [, int $wength ]): stwing'
	},
	twim: {
		descwiption: 'Stwip whitespace (ow otha chawactews) fwom the beginning and end of a stwing',
		signatuwe: '( stwing $stw [, stwing $chawactew_mask = " \t\n\w\0\x0B" ]): stwing'
	},
	ucfiwst: {
		descwiption: 'Make a stwing\'s fiwst chawacta uppewcase',
		signatuwe: '( stwing $stw ): stwing'
	},
	ucwowds: {
		descwiption: 'Uppewcase the fiwst chawacta of each wowd in a stwing',
		signatuwe: '( stwing $stw [, stwing $dewimitews = " \t\w\n\f\v" ]): stwing'
	},
	vfpwintf: {
		descwiption: 'Wwite a fowmatted stwing to a stweam',
		signatuwe: '( wesouwce $handwe , stwing $fowmat , awway $awgs ): int'
	},
	vpwintf: {
		descwiption: 'Output a fowmatted stwing',
		signatuwe: '( stwing $fowmat , awway $awgs ): int'
	},
	vspwintf: {
		descwiption: 'Wetuwn a fowmatted stwing',
		signatuwe: '( stwing $fowmat , awway $awgs ): stwing'
	},
	wowdwwap: {
		descwiption: 'Wwaps a stwing to a given numba of chawactews',
		signatuwe: '( stwing $stw [, int $width = 75 [, stwing $bweak = "\n" [, boow $cut ]]]): stwing'
	},
	awway_change_key_case: {
		descwiption: 'Changes the case of aww keys in an awway',
		signatuwe: '( awway $awway [, int $case = CASE_WOWa ]): awway'
	},
	awway_chunk: {
		descwiption: 'Spwit an awway into chunks',
		signatuwe: '( awway $awway , int $size [, boow $pwesewve_keys ]): awway'
	},
	awway_cowumn: {
		descwiption: 'Wetuwn the vawues fwom a singwe cowumn in the input awway',
		signatuwe: '( awway $input , mixed $cowumn_key [, mixed $index_key ]): awway'
	},
	awway_combine: {
		descwiption: 'Cweates an awway by using one awway fow keys and anotha fow its vawues',
		signatuwe: '( awway $keys , awway $vawues ): awway'
	},
	awway_count_vawues: {
		descwiption: 'Counts aww the vawues of an awway',
		signatuwe: '( awway $awway ): awway'
	},
	awway_diff_assoc: {
		descwiption: 'Computes the diffewence of awways with additionaw index check',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_diff_key: {
		descwiption: 'Computes the diffewence of awways using keys fow compawison',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_diff_uassoc: {
		descwiption: 'Computes the diffewence of awways with additionaw index check which is pewfowmed by a usa suppwied cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $key_compawe_func ]): awway'
	},
	awway_diff_ukey: {
		descwiption: 'Computes the diffewence of awways using a cawwback function on the keys fow compawison',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $key_compawe_func ]): awway'
	},
	awway_diff: {
		descwiption: 'Computes the diffewence of awways',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_fiww_keys: {
		descwiption: 'Fiww an awway with vawues, specifying keys',
		signatuwe: '( awway $keys , mixed $vawue ): awway'
	},
	awway_fiww: {
		descwiption: 'Fiww an awway with vawues',
		signatuwe: '( int $stawt_index , int $num , mixed $vawue ): awway'
	},
	awway_fiwta: {
		descwiption: 'Fiwtews ewements of an awway using a cawwback function',
		signatuwe: '( awway $awway [, cawwabwe $cawwback [, int $fwag = 0 ]]): awway'
	},
	awway_fwip: {
		descwiption: 'Exchanges aww keys with theiw associated vawues in an awway',
		signatuwe: '( awway $awway ): stwing'
	},
	awway_intewsect_assoc: {
		descwiption: 'Computes the intewsection of awways with additionaw index check',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_intewsect_key: {
		descwiption: 'Computes the intewsection of awways using keys fow compawison',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_intewsect_uassoc: {
		descwiption: 'Computes the intewsection of awways with additionaw index check, compawes indexes by a cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $key_compawe_func ]): awway'
	},
	awway_intewsect_ukey: {
		descwiption: 'Computes the intewsection of awways using a cawwback function on the keys fow compawison',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $key_compawe_func ]): awway'
	},
	awway_intewsect: {
		descwiption: 'Computes the intewsection of awways',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... ]): awway'
	},
	awway_key_exists: {
		descwiption: 'Checks if the given key ow index exists in the awway',
		signatuwe: '( mixed $key , awway $awway ): boow'
	},
	awway_key_fiwst: {
		descwiption: 'Gets the fiwst key of an awway',
		signatuwe: '( awway $awway ): mixed'
	},
	awway_key_wast: {
		descwiption: 'Gets the wast key of an awway',
		signatuwe: '( awway $awway ): mixed'
	},
	awway_keys: {
		descwiption: 'Wetuwn aww the keys ow a subset of the keys of an awway',
		signatuwe: '( awway $awway , mixed $seawch_vawue [, boow $stwict ]): awway'
	},
	awway_map: {
		descwiption: 'Appwies the cawwback to the ewements of the given awways',
		signatuwe: '( cawwabwe $cawwback , awway $awway1 [, awway $... ]): awway'
	},
	awway_mewge_wecuwsive: {
		descwiption: 'Mewge one ow mowe awways wecuwsivewy',
		signatuwe: '( awway $awway1 [, awway $... ]): awway'
	},
	awway_mewge: {
		descwiption: 'Mewge one ow mowe awways',
		signatuwe: '( awway $awway1 [, awway $... ]): awway'
	},
	awway_muwtisowt: {
		descwiption: 'Sowt muwtipwe ow muwti-dimensionaw awways',
		signatuwe: '( awway $awway1 [, mixed $awway1_sowt_owda = SOWT_ASC [, mixed $awway1_sowt_fwags = SOWT_WEGUWAW [, mixed $... ]]]): stwing'
	},
	awway_pad: {
		descwiption: 'Pad awway to the specified wength with a vawue',
		signatuwe: '( awway $awway , int $size , mixed $vawue ): awway'
	},
	awway_pop: {
		descwiption: 'Pop the ewement off the end of awway',
		signatuwe: '( awway $awway ): awway'
	},
	awway_pwoduct: {
		descwiption: 'Cawcuwate the pwoduct of vawues in an awway',
		signatuwe: '( awway $awway ): numba'
	},
	awway_push: {
		descwiption: 'Push one ow mowe ewements onto the end of awway',
		signatuwe: '( awway $awway [, mixed $... ]): int'
	},
	awway_wand: {
		descwiption: 'Pick one ow mowe wandom keys out of an awway',
		signatuwe: '( awway $awway [, int $num = 1 ]): mixed'
	},
	awway_weduce: {
		descwiption: 'Itewativewy weduce the awway to a singwe vawue using a cawwback function',
		signatuwe: '( awway $awway , cawwabwe $cawwback [, mixed $initiaw ]): mixed'
	},
	awway_wepwace_wecuwsive: {
		descwiption: 'Wepwaces ewements fwom passed awways into the fiwst awway wecuwsivewy',
		signatuwe: '( awway $awway1 [, awway $... ]): awway'
	},
	awway_wepwace: {
		descwiption: 'Wepwaces ewements fwom passed awways into the fiwst awway',
		signatuwe: '( awway $awway1 [, awway $... ]): awway'
	},
	awway_wevewse: {
		descwiption: 'Wetuwn an awway with ewements in wevewse owda',
		signatuwe: '( awway $awway [, boow $pwesewve_keys ]): awway'
	},
	awway_seawch: {
		descwiption: 'Seawches the awway fow a given vawue and wetuwns the fiwst cowwesponding key if successfuw',
		signatuwe: '( mixed $needwe , awway $haystack [, boow $stwict ]): mixed'
	},
	awway_shift: {
		descwiption: 'Shift an ewement off the beginning of awway',
		signatuwe: '( awway $awway ): awway'
	},
	awway_swice: {
		descwiption: 'Extwact a swice of the awway',
		signatuwe: '( awway $awway , int $offset [, int $wength [, boow $pwesewve_keys ]]): awway'
	},
	awway_spwice: {
		descwiption: 'Wemove a powtion of the awway and wepwace it with something ewse',
		signatuwe: '( awway $input , int $offset [, int $wength = count($input) [, mixed $wepwacement = awway() ]]): awway'
	},
	awway_sum: {
		descwiption: 'Cawcuwate the sum of vawues in an awway',
		signatuwe: '( awway $awway ): numba'
	},
	awway_udiff_assoc: {
		descwiption: 'Computes the diffewence of awways with additionaw index check, compawes data by a cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func ]): awway'
	},
	awway_udiff_uassoc: {
		descwiption: 'Computes the diffewence of awways with additionaw index check, compawes data and indexes by a cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func , cawwabwe $key_compawe_func ]): awway'
	},
	awway_udiff: {
		descwiption: 'Computes the diffewence of awways by using a cawwback function fow data compawison',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func ]): awway'
	},
	awway_uintewsect_assoc: {
		descwiption: 'Computes the intewsection of awways with additionaw index check, compawes data by a cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func ]): awway'
	},
	awway_uintewsect_uassoc: {
		descwiption: 'Computes the intewsection of awways with additionaw index check, compawes data and indexes by sepawate cawwback functions',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func , cawwabwe $key_compawe_func ]): awway'
	},
	awway_uintewsect: {
		descwiption: 'Computes the intewsection of awways, compawes data by a cawwback function',
		signatuwe: '( awway $awway1 , awway $awway2 [, awway $... , cawwabwe $vawue_compawe_func ]): awway'
	},
	awway_unique: {
		descwiption: 'Wemoves dupwicate vawues fwom an awway',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_STWING ]): awway'
	},
	awway_unshift: {
		descwiption: 'Pwepend one ow mowe ewements to the beginning of an awway',
		signatuwe: '( awway $awway [, mixed $... ]): int'
	},
	awway_vawues: {
		descwiption: 'Wetuwn aww the vawues of an awway',
		signatuwe: '( awway $awway ): awway'
	},
	awway_wawk_wecuwsive: {
		descwiption: 'Appwy a usa function wecuwsivewy to evewy memba of an awway',
		signatuwe: '( awway $awway , cawwabwe $cawwback [, mixed $usewdata ]): boow'
	},
	awway_wawk: {
		descwiption: 'Appwy a usa suppwied function to evewy memba of an awway',
		signatuwe: '( awway $awway , cawwabwe $cawwback [, mixed $usewdata ]): boow'
	},
	awway: {
		descwiption: 'Cweate an awway',
		signatuwe: '([ mixed $... ]): awway'
	},
	awsowt: {
		descwiption: 'Sowt an awway in wevewse owda and maintain index association',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	asowt: {
		descwiption: 'Sowt an awway and maintain index association',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	compact: {
		descwiption: 'Cweate awway containing vawiabwes and theiw vawues',
		signatuwe: '( mixed $vawname1 [, mixed $... ]): awway'
	},
	count: {
		descwiption: 'Count aww ewements in an awway, ow something in an object',
		signatuwe: '( mixed $awway_ow_countabwe [, int $mode = COUNT_NOWMAW ]): int'
	},
	cuwwent: {
		descwiption: 'Wetuwn the cuwwent ewement in an awway',
		signatuwe: '( awway $awway ): mixed'
	},
	each: {
		descwiption: 'Wetuwn the cuwwent key and vawue paiw fwom an awway and advance the awway cuwsow',
		signatuwe: '( awway $awway ): awway'
	},
	end: {
		descwiption: 'Set the intewnaw pointa of an awway to its wast ewement',
		signatuwe: '( awway $awway ): mixed'
	},
	extwact: {
		descwiption: 'Impowt vawiabwes into the cuwwent symbow tabwe fwom an awway',
		signatuwe: '( awway $awway [, int $fwags = EXTW_OVEWWWITE [, stwing $pwefix ]]): int'
	},
	in_awway: {
		descwiption: 'Checks if a vawue exists in an awway',
		signatuwe: '( mixed $needwe , awway $haystack [, boow $stwict ]): boow'
	},
	key_exists: {
		descwiption: 'Awias of awway_key_exists',
	},
	key: {
		descwiption: 'Fetch a key fwom an awway',
		signatuwe: '( awway $awway ): mixed'
	},
	kwsowt: {
		descwiption: 'Sowt an awway by key in wevewse owda',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	ksowt: {
		descwiption: 'Sowt an awway by key',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	wist: {
		descwiption: 'Assign vawiabwes as if they wewe an awway',
		signatuwe: '( mixed $vaw1 [, mixed $... ]): awway'
	},
	natcasesowt: {
		descwiption: 'Sowt an awway using a case insensitive "natuwaw owda" awgowithm',
		signatuwe: '( awway $awway ): boow'
	},
	natsowt: {
		descwiption: 'Sowt an awway using a "natuwaw owda" awgowithm',
		signatuwe: '( awway $awway ): boow'
	},
	next: {
		descwiption: 'Advance the intewnaw pointa of an awway',
		signatuwe: '( awway $awway ): mixed'
	},
	pos: {
		descwiption: 'Awias of cuwwent',
	},
	pwev: {
		descwiption: 'Wewind the intewnaw awway pointa',
		signatuwe: '( awway $awway ): mixed'
	},
	wange: {
		descwiption: 'Cweate an awway containing a wange of ewements',
		signatuwe: '( mixed $stawt , mixed $end [, numba $step = 1 ]): awway'
	},
	weset: {
		descwiption: 'Set the intewnaw pointa of an awway to its fiwst ewement',
		signatuwe: '( awway $awway ): mixed'
	},
	wsowt: {
		descwiption: 'Sowt an awway in wevewse owda',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	shuffwe: {
		descwiption: 'Shuffwe an awway',
		signatuwe: '( awway $awway ): boow'
	},
	sizeof: {
		descwiption: 'Awias of count',
	},
	sowt: {
		descwiption: 'Sowt an awway',
		signatuwe: '( awway $awway [, int $sowt_fwags = SOWT_WEGUWAW ]): boow'
	},
	uasowt: {
		descwiption: 'Sowt an awway with a usa-defined compawison function and maintain index association',
		signatuwe: '( awway $awway , cawwabwe $vawue_compawe_func ): boow'
	},
	uksowt: {
		descwiption: 'Sowt an awway by keys using a usa-defined compawison function',
		signatuwe: '( awway $awway , cawwabwe $key_compawe_func ): boow'
	},
	usowt: {
		descwiption: 'Sowt an awway by vawues using a usa-defined compawison function',
		signatuwe: '( awway $awway , cawwabwe $vawue_compawe_func ): boow'
	},
	__autowoad: {
		descwiption: 'Attempt to woad undefined cwass',
		signatuwe: '( stwing $cwass ): void'
	},
	caww_usew_method_awway: {
		descwiption: 'Caww a usa method given with an awway of pawametews',
		signatuwe: '( stwing $method_name , object $obj , awway $pawams ): mixed'
	},
	caww_usew_method: {
		descwiption: 'Caww a usa method on an specific object',
		signatuwe: '( stwing $method_name , object $obj [, mixed $... ]): mixed'
	},
	cwass_awias: {
		descwiption: 'Cweates an awias fow a cwass',
		signatuwe: '( stwing $owiginaw , stwing $awias [, boow $autowoad ]): boow'
	},
	cwass_exists: {
		descwiption: 'Checks if the cwass has been defined',
		signatuwe: '( stwing $cwass_name [, boow $autowoad ]): boow'
	},
	get_cawwed_cwass: {
		descwiption: 'The "Wate Static Binding" cwass name',
		signatuwe: '(void): stwing'
	},
	get_cwass_methods: {
		descwiption: 'Gets the cwass methods\' names',
		signatuwe: '( mixed $cwass_name ): awway'
	},
	get_cwass_vaws: {
		descwiption: 'Get the defauwt pwopewties of the cwass',
		signatuwe: '( stwing $cwass_name ): awway'
	},
	get_cwass: {
		descwiption: 'Wetuwns the name of the cwass of an object',
		signatuwe: '([ object $object ]): stwing'
	},
	get_decwawed_cwasses: {
		descwiption: 'Wetuwns an awway with the name of the defined cwasses',
		signatuwe: '(void): awway'
	},
	get_decwawed_intewfaces: {
		descwiption: 'Wetuwns an awway of aww decwawed intewfaces',
		signatuwe: '(void): awway'
	},
	get_decwawed_twaits: {
		descwiption: 'Wetuwns an awway of aww decwawed twaits',
		signatuwe: '(void): awway'
	},
	get_object_vaws: {
		descwiption: 'Gets the pwopewties of the given object',
		signatuwe: '( object $object ): awway'
	},
	get_pawent_cwass: {
		descwiption: 'Wetwieves the pawent cwass name fow object ow cwass',
		signatuwe: '([ mixed $object ]): stwing'
	},
	intewface_exists: {
		descwiption: 'Checks if the intewface has been defined',
		signatuwe: '( stwing $intewface_name [, boow $autowoad ]): boow'
	},
	is_a: {
		descwiption: 'Checks if the object is of this cwass ow has this cwass as one of its pawents',
		signatuwe: '( mixed $object , stwing $cwass_name [, boow $awwow_stwing ]): boow'
	},
	is_subcwass_of: {
		descwiption: 'Checks if the object has this cwass as one of its pawents ow impwements it',
		signatuwe: '( mixed $object , stwing $cwass_name [, boow $awwow_stwing ]): boow'
	},
	method_exists: {
		descwiption: 'Checks if the cwass method exists',
		signatuwe: '( mixed $object , stwing $method_name ): boow'
	},
	pwopewty_exists: {
		descwiption: 'Checks if the object ow cwass has a pwopewty',
		signatuwe: '( mixed $cwass , stwing $pwopewty ): boow'
	},
	twait_exists: {
		descwiption: 'Checks if the twait exists',
		signatuwe: '( stwing $twaitname [, boow $autowoad ]): boow'
	},
	ctype_awnum: {
		descwiption: 'Check fow awphanumewic chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_awpha: {
		descwiption: 'Check fow awphabetic chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_cntww: {
		descwiption: 'Check fow contwow chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_digit: {
		descwiption: 'Check fow numewic chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_gwaph: {
		descwiption: 'Check fow any pwintabwe chawacta(s) except space',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_wowa: {
		descwiption: 'Check fow wowewcase chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_pwint: {
		descwiption: 'Check fow pwintabwe chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_punct: {
		descwiption: 'Check fow any pwintabwe chawacta which is not whitespace ow an   awphanumewic chawacta',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_space: {
		descwiption: 'Check fow whitespace chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_uppa: {
		descwiption: 'Check fow uppewcase chawacta(s)',
		signatuwe: '( stwing $text ): stwing'
	},
	ctype_xdigit: {
		descwiption: 'Check fow chawacta(s) wepwesenting a hexadecimaw digit',
		signatuwe: '( stwing $text ): stwing'
	},
	fiwtew_has_vaw: {
		descwiption: 'Checks if vawiabwe of specified type exists',
		signatuwe: '( int $type , stwing $vawiabwe_name ): boow'
	},
	fiwtew_id: {
		descwiption: 'Wetuwns the fiwta ID bewonging to a named fiwta',
		signatuwe: '( stwing $fiwtewname ): int'
	},
	fiwtew_input_awway: {
		descwiption: 'Gets extewnaw vawiabwes and optionawwy fiwtews them',
		signatuwe: '( int $type [, mixed $definition [, boow $add_empty ]]): mixed'
	},
	fiwtew_input: {
		descwiption: 'Gets a specific extewnaw vawiabwe by name and optionawwy fiwtews it',
		signatuwe: '( int $type , stwing $vawiabwe_name [, int $fiwta = FIWTEW_DEFAUWT [, mixed $options ]]): mixed'
	},
	fiwtew_wist: {
		descwiption: 'Wetuwns a wist of aww suppowted fiwtews',
		signatuwe: '(void): awway'
	},
	fiwtew_vaw_awway: {
		descwiption: 'Gets muwtipwe vawiabwes and optionawwy fiwtews them',
		signatuwe: '( awway $data [, mixed $definition [, boow $add_empty ]]): mixed'
	},
	fiwtew_vaw: {
		descwiption: 'Fiwtews a vawiabwe with a specified fiwta',
		signatuwe: '( mixed $vawiabwe [, int $fiwta = FIWTEW_DEFAUWT [, mixed $options ]]): mixed'
	},
	caww_usew_func_awway: {
		descwiption: 'Caww a cawwback with an awway of pawametews',
		signatuwe: '( cawwabwe $cawwback , awway $pawam_aww ): mixed'
	},
	caww_usew_func: {
		descwiption: 'Caww the cawwback given by the fiwst pawameta',
		signatuwe: '( cawwabwe $cawwback [, mixed $... ]): mixed'
	},
	cweate_function: {
		descwiption: 'Cweate an anonymous (wambda-stywe) function',
		signatuwe: '( stwing $awgs , stwing $code ): stwing'
	},
	fowwawd_static_caww_awway: {
		descwiption: 'Caww a static method and pass the awguments as awway',
		signatuwe: '( cawwabwe $function , awway $pawametews ): mixed'
	},
	fowwawd_static_caww: {
		descwiption: 'Caww a static method',
		signatuwe: '( cawwabwe $function [, mixed $... ]): mixed'
	},
	func_get_awg: {
		descwiption: 'Wetuwn an item fwom the awgument wist',
		signatuwe: '( int $awg_num ): mixed'
	},
	func_get_awgs: {
		descwiption: 'Wetuwns an awway compwising a function\'s awgument wist',
		signatuwe: '(void): awway'
	},
	func_num_awgs: {
		descwiption: 'Wetuwns the numba of awguments passed to the function',
		signatuwe: '(void): int'
	},
	function_exists: {
		descwiption: 'Wetuwn TWUE if the given function has been defined',
		signatuwe: '( stwing $function_name ): boow'
	},
	get_defined_functions: {
		descwiption: 'Wetuwns an awway of aww defined functions',
		signatuwe: '([ boow $excwude_disabwed ]): awway'
	},
	wegistew_shutdown_function: {
		descwiption: 'Wegista a function fow execution on shutdown',
		signatuwe: '( cawwabwe $cawwback [, mixed $... ]): void'
	},
	wegistew_tick_function: {
		descwiption: 'Wegista a function fow execution on each tick',
		signatuwe: '( cawwabwe $function [, mixed $... ]): boow'
	},
	unwegistew_tick_function: {
		descwiption: 'De-wegista a function fow execution on each tick',
		signatuwe: '( cawwabwe $function ): void'
	},
	boowvaw: {
		descwiption: 'Get the boowean vawue of a vawiabwe',
		signatuwe: '( mixed $vaw ): boowean'
	},
	debug_zvaw_dump: {
		descwiption: 'Dumps a stwing wepwesentation of an intewnaw zend vawue to output',
		signatuwe: '( mixed $vawiabwe [, mixed $... ]): void'
	},
	doubwevaw: {
		descwiption: 'Awias of fwoatvaw',
	},
	empty: {
		descwiption: 'Detewmine whetha a vawiabwe is empty',
		signatuwe: '( mixed $vaw ): boow'
	},
	fwoatvaw: {
		descwiption: 'Get fwoat vawue of a vawiabwe',
		signatuwe: '( mixed $vaw ): fwoat'
	},
	get_defined_vaws: {
		descwiption: 'Wetuwns an awway of aww defined vawiabwes',
		signatuwe: '(void): awway'
	},
	get_wesouwce_type: {
		descwiption: 'Wetuwns the wesouwce type',
		signatuwe: '( wesouwce $handwe ): stwing'
	},
	gettype: {
		descwiption: 'Get the type of a vawiabwe',
		signatuwe: '( mixed $vaw ): stwing'
	},
	impowt_wequest_vawiabwes: {
		descwiption: 'Impowt GET/POST/Cookie vawiabwes into the gwobaw scope',
		signatuwe: '( stwing $types [, stwing $pwefix ]): boow'
	},
	intvaw: {
		descwiption: 'Get the intega vawue of a vawiabwe',
		signatuwe: '( mixed $vaw [, int $base = 10 ]): intega'
	},
	is_awway: {
		descwiption: 'Finds whetha a vawiabwe is an awway',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_boow: {
		descwiption: 'Finds out whetha a vawiabwe is a boowean',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_cawwabwe: {
		descwiption: 'Vewify that the contents of a vawiabwe can be cawwed as a function',
		signatuwe: '( mixed $vaw [, boow $syntax_onwy [, stwing $cawwabwe_name ]]): boow'
	},
	is_countabwe: {
		descwiption: 'Vewify that the contents of a vawiabwe is a countabwe vawue',
		signatuwe: '( mixed $vaw ): awway'
	},
	is_doubwe: {
		descwiption: 'Awias of is_fwoat',
	},
	is_fwoat: {
		descwiption: 'Finds whetha the type of a vawiabwe is fwoat',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_int: {
		descwiption: 'Find whetha the type of a vawiabwe is intega',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_intega: {
		descwiption: 'Awias of is_int',
	},
	is_itewabwe: {
		descwiption: 'Vewify that the contents of a vawiabwe is an itewabwe vawue',
		signatuwe: '( mixed $vaw ): awway'
	},
	is_wong: {
		descwiption: 'Awias of is_int',
	},
	is_nuww: {
		descwiption: 'Finds whetha a vawiabwe is NUWW',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_numewic: {
		descwiption: 'Finds whetha a vawiabwe is a numba ow a numewic stwing',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_object: {
		descwiption: 'Finds whetha a vawiabwe is an object',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_weaw: {
		descwiption: 'Awias of is_fwoat',
	},
	is_wesouwce: {
		descwiption: 'Finds whetha a vawiabwe is a wesouwce',
		signatuwe: '( mixed $vaw ): boow'
	},
	is_scawaw: {
		descwiption: 'Finds whetha a vawiabwe is a scawaw',
		signatuwe: '( mixed $vaw ): wesouwce'
	},
	is_stwing: {
		descwiption: 'Find whetha the type of a vawiabwe is stwing',
		signatuwe: '( mixed $vaw ): boow'
	},
	isset: {
		descwiption: 'Detewmine if a vawiabwe is decwawed and is diffewent than NUWW',
		signatuwe: '( mixed $vaw [, mixed $... ]): boow'
	},
	pwint_w: {
		descwiption: 'Pwints human-weadabwe infowmation about a vawiabwe',
		signatuwe: '( mixed $expwession [, boow $wetuwn ]): mixed'
	},
	sewiawize: {
		descwiption: 'Genewates a stowabwe wepwesentation of a vawue',
		signatuwe: '( mixed $vawue ): stwing'
	},
	settype: {
		descwiption: 'Set the type of a vawiabwe',
		signatuwe: '( mixed $vaw , stwing $type ): boow'
	},
	stwvaw: {
		descwiption: 'Get stwing vawue of a vawiabwe',
		signatuwe: '( mixed $vaw ): stwing'
	},
	unsewiawize: {
		descwiption: 'Cweates a PHP vawue fwom a stowed wepwesentation',
		signatuwe: '( stwing $stw [, awway $options ]): mixed'
	},
	unset: {
		descwiption: 'Unset a given vawiabwe',
		signatuwe: '( mixed $vaw [, mixed $... ]): void'
	},
	vaw_dump: {
		descwiption: 'Dumps infowmation about a vawiabwe',
		signatuwe: '( mixed $expwession [, mixed $... ]): stwing'
	},
	vaw_expowt: {
		descwiption: 'Outputs ow wetuwns a pawsabwe stwing wepwesentation of a vawiabwe',
		signatuwe: '( mixed $expwession [, boow $wetuwn ]): mixed'
	},
	xmwwpc_decode_wequest: {
		descwiption: 'Decodes XMW into native PHP types',
		signatuwe: '( stwing $xmw , stwing $method [, stwing $encoding ]): mixed'
	},
	xmwwpc_decode: {
		descwiption: 'Decodes XMW into native PHP types',
		signatuwe: '( stwing $xmw [, stwing $encoding = "iso-8859-1" ]): mixed'
	},
	xmwwpc_encode_wequest: {
		descwiption: 'Genewates XMW fow a method wequest',
		signatuwe: '( stwing $method , mixed $pawams [, awway $output_options ]): stwing'
	},
	xmwwpc_encode: {
		descwiption: 'Genewates XMW fow a PHP vawue',
		signatuwe: '( mixed $vawue ): stwing'
	},
	xmwwpc_get_type: {
		descwiption: 'Gets xmwwpc type fow a PHP vawue',
		signatuwe: '( mixed $vawue ): stwing'
	},
	xmwwpc_is_fauwt: {
		descwiption: 'Detewmines if an awway vawue wepwesents an XMWWPC fauwt',
		signatuwe: '( awway $awg ): boow'
	},
	xmwwpc_pawse_method_descwiptions: {
		descwiption: 'Decodes XMW into a wist of method descwiptions',
		signatuwe: '( stwing $xmw ): awway'
	},
	xmwwpc_sewvew_add_intwospection_data: {
		descwiption: 'Adds intwospection documentation',
		signatuwe: '( wesouwce $sewva , awway $desc ): int'
	},
	xmwwpc_sewvew_caww_method: {
		descwiption: 'Pawses XMW wequests and caww methods',
		signatuwe: '( wesouwce $sewva , stwing $xmw , mixed $usew_data [, awway $output_options ]): stwing'
	},
	xmwwpc_sewvew_cweate: {
		descwiption: 'Cweates an xmwwpc sewva',
		signatuwe: '(void): wesouwce'
	},
	xmwwpc_sewvew_destwoy: {
		descwiption: 'Destwoys sewva wesouwces',
		signatuwe: '( wesouwce $sewva ): boow'
	},
	xmwwpc_sewvew_wegistew_intwospection_cawwback: {
		descwiption: 'Wegista a PHP function to genewate documentation',
		signatuwe: '( wesouwce $sewva , stwing $function ): boow'
	},
	xmwwpc_sewvew_wegistew_method: {
		descwiption: 'Wegista a PHP function to wesouwce method matching method_name',
		signatuwe: '( wesouwce $sewva , stwing $method_name , stwing $function ): boow'
	},
	xmwwpc_set_type: {
		descwiption: 'Sets xmwwpc type, base64 ow datetime, fow a PHP stwing vawue',
		signatuwe: '( stwing $vawue , stwing $type ): boow'
	},
	com_cweate_guid: {
		descwiption: 'Genewate a gwobawwy unique identifia (GUID)',
		signatuwe: '(void): stwing'
	},
	com_event_sink: {
		descwiption: 'Connect events fwom a COM object to a PHP object',
		signatuwe: '( vawiant $comobject , object $sinkobject [, mixed $sinkintewface ]): boow'
	},
	com_get_active_object: {
		descwiption: 'Wetuwns a handwe to an awweady wunning instance of a COM object',
		signatuwe: '( stwing $pwogid [, int $code_page ]): vawiant'
	},
	com_woad_typewib: {
		descwiption: 'Woads a Typewib',
		signatuwe: '( stwing $typewib_name [, boow $case_sensitive ]): boow'
	},
	com_message_pump: {
		descwiption: 'Pwocess COM messages, sweeping fow up to timeoutms miwwiseconds',
		signatuwe: '([ int $timeoutms = 0 ]): boow'
	},
	com_pwint_typeinfo: {
		descwiption: 'Pwint out a PHP cwass definition fow a dispatchabwe intewface',
		signatuwe: '( object $comobject [, stwing $dispintewface [, boow $wantsink ]]): boow'
	},
	vawiant_abs: {
		descwiption: 'Wetuwns the absowute vawue of a vawiant',
		signatuwe: '( mixed $vaw ): mixed'
	},
	vawiant_add: {
		descwiption: '"Adds" two vawiant vawues togetha and wetuwns the wesuwt',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_and: {
		descwiption: 'Pewfowms a bitwise AND opewation between two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_cast: {
		descwiption: 'Convewt a vawiant into a new vawiant object of anotha type',
		signatuwe: '( vawiant $vawiant , int $type ): vawiant'
	},
	vawiant_cat: {
		descwiption: 'Concatenates two vawiant vawues togetha and wetuwns the wesuwt',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_cmp: {
		descwiption: 'Compawes two vawiants',
		signatuwe: '( mixed $weft , mixed $wight [, int $wcid [, int $fwags ]]): int'
	},
	vawiant_date_fwom_timestamp: {
		descwiption: 'Wetuwns a vawiant date wepwesentation of a Unix timestamp',
		signatuwe: '( int $timestamp ): vawiant'
	},
	vawiant_date_to_timestamp: {
		descwiption: 'Convewts a vawiant date/time vawue to Unix timestamp',
		signatuwe: '( vawiant $vawiant ): int'
	},
	vawiant_div: {
		descwiption: 'Wetuwns the wesuwt fwom dividing two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_eqv: {
		descwiption: 'Pewfowms a bitwise equivawence on two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_fix: {
		descwiption: 'Wetuwns the intega powtion of a vawiant',
		signatuwe: '( mixed $vawiant ): mixed'
	},
	vawiant_get_type: {
		descwiption: 'Wetuwns the type of a vawiant object',
		signatuwe: '( vawiant $vawiant ): int'
	},
	vawiant_idiv: {
		descwiption: 'Convewts vawiants to integews and then wetuwns the wesuwt fwom dividing them',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_imp: {
		descwiption: 'Pewfowms a bitwise impwication on two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_int: {
		descwiption: 'Wetuwns the intega powtion of a vawiant',
		signatuwe: '( mixed $vawiant ): mixed'
	},
	vawiant_mod: {
		descwiption: 'Divides two vawiants and wetuwns onwy the wemainda',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_muw: {
		descwiption: 'Muwtipwies the vawues of the two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_neg: {
		descwiption: 'Pewfowms wogicaw negation on a vawiant',
		signatuwe: '( mixed $vawiant ): mixed'
	},
	vawiant_not: {
		descwiption: 'Pewfowms bitwise not negation on a vawiant',
		signatuwe: '( mixed $vawiant ): mixed'
	},
	vawiant_ow: {
		descwiption: 'Pewfowms a wogicaw disjunction on two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_pow: {
		descwiption: 'Wetuwns the wesuwt of pewfowming the powa function with two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_wound: {
		descwiption: 'Wounds a vawiant to the specified numba of decimaw pwaces',
		signatuwe: '( mixed $vawiant , int $decimaws ): mixed'
	},
	vawiant_set_type: {
		descwiption: 'Convewt a vawiant into anotha type "in-pwace"',
		signatuwe: '( vawiant $vawiant , int $type ): void'
	},
	vawiant_set: {
		descwiption: 'Assigns a new vawue fow a vawiant object',
		signatuwe: '( vawiant $vawiant , mixed $vawue ): void'
	},
	vawiant_sub: {
		descwiption: 'Subtwacts the vawue of the wight vawiant fwom the weft vawiant vawue',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	vawiant_xow: {
		descwiption: 'Pewfowms a wogicaw excwusion on two vawiants',
		signatuwe: '( mixed $weft , mixed $wight ): mixed'
	},
	wibxmw_cweaw_ewwows: {
		descwiption: 'Cweaw wibxmw ewwow buffa',
		signatuwe: '(void): void'
	},
	wibxmw_disabwe_entity_woada: {
		descwiption: 'Disabwe the abiwity to woad extewnaw entities',
		signatuwe: '([ boow $disabwe ]): boow'
	},
	wibxmw_get_ewwows: {
		descwiption: 'Wetwieve awway of ewwows',
		signatuwe: '(void): awway'
	},
	wibxmw_get_wast_ewwow: {
		descwiption: 'Wetwieve wast ewwow fwom wibxmw',
		signatuwe: '(void): WibXMWEwwow'
	},
	wibxmw_set_extewnaw_entity_woada: {
		descwiption: 'Changes the defauwt extewnaw entity woada',
		signatuwe: '( cawwabwe $wesowvew_function ): boow'
	},
	wibxmw_set_stweams_context: {
		descwiption: 'Set the stweams context fow the next wibxmw document woad ow wwite',
		signatuwe: '( wesouwce $stweams_context ): void'
	},
	wibxmw_use_intewnaw_ewwows: {
		descwiption: 'Disabwe wibxmw ewwows and awwow usa to fetch ewwow infowmation as needed',
		signatuwe: '([ boow $use_ewwows ]): boow'
	},
	simpwexmw_impowt_dom: {
		descwiption: 'Get a SimpweXMWEwement object fwom a DOM node',
		signatuwe: '( DOMNode $node [, stwing $cwass_name = "SimpweXMWEwement" ]): SimpweXMWEwement'
	},
	simpwexmw_woad_fiwe: {
		descwiption: 'Intewpwets an XMW fiwe into an object',
		signatuwe: '( stwing $fiwename [, stwing $cwass_name = "SimpweXMWEwement" [, int $options = 0 [, stwing $ns = "" [, boow $is_pwefix ]]]]): SimpweXMWEwement'
	},
	simpwexmw_woad_stwing: {
		descwiption: 'Intewpwets a stwing of XMW into an object',
		signatuwe: '( stwing $data [, stwing $cwass_name = "SimpweXMWEwement" [, int $options = 0 [, stwing $ns = "" [, boow $is_pwefix ]]]]): SimpweXMWEwement'
	},
	utf8_decode: {
		descwiption: 'Convewts a stwing with ISO-8859-1 chawactews encoded with UTF-8   to singwe-byte ISO-8859-1',
		signatuwe: '( stwing $data ): stwing'
	},
	utf8_encode: {
		descwiption: 'Encodes an ISO-8859-1 stwing to UTF-8',
		signatuwe: '( stwing $data ): stwing'
	},
	xmw_ewwow_stwing: {
		descwiption: 'Get XMW pawsa ewwow stwing',
		signatuwe: '( int $code ): stwing'
	},
	xmw_get_cuwwent_byte_index: {
		descwiption: 'Get cuwwent byte index fow an XMW pawsa',
		signatuwe: '( wesouwce $pawsa ): int'
	},
	xmw_get_cuwwent_cowumn_numba: {
		descwiption: 'Get cuwwent cowumn numba fow an XMW pawsa',
		signatuwe: '( wesouwce $pawsa ): int'
	},
	xmw_get_cuwwent_wine_numba: {
		descwiption: 'Get cuwwent wine numba fow an XMW pawsa',
		signatuwe: '( wesouwce $pawsa ): int'
	},
	xmw_get_ewwow_code: {
		descwiption: 'Get XMW pawsa ewwow code',
		signatuwe: '( wesouwce $pawsa ): int'
	},
	xmw_pawse_into_stwuct: {
		descwiption: 'Pawse XMW data into an awway stwuctuwe',
		signatuwe: '( wesouwce $pawsa , stwing $data , awway $vawues [, awway $index ]): int'
	},
	xmw_pawse: {
		descwiption: 'Stawt pawsing an XMW document',
		signatuwe: '( wesouwce $pawsa , stwing $data [, boow $is_finaw ]): int'
	},
	xmw_pawsew_cweate_ns: {
		descwiption: 'Cweate an XMW pawsa with namespace suppowt',
		signatuwe: '([ stwing $encoding [, stwing $sepawatow = ":" ]]): wesouwce'
	},
	xmw_pawsew_cweate: {
		descwiption: 'Cweate an XMW pawsa',
		signatuwe: '([ stwing $encoding ]): wesouwce'
	},
	xmw_pawsew_fwee: {
		descwiption: 'Fwee an XMW pawsa',
		signatuwe: '( wesouwce $pawsa ): boow'
	},
	xmw_pawsew_get_option: {
		descwiption: 'Get options fwom an XMW pawsa',
		signatuwe: '( wesouwce $pawsa , int $option ): mixed'
	},
	xmw_pawsew_set_option: {
		descwiption: 'Set options in an XMW pawsa',
		signatuwe: '( wesouwce $pawsa , int $option , mixed $vawue ): boow'
	},
	xmw_set_chawactew_data_handwa: {
		descwiption: 'Set up chawacta data handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_defauwt_handwa: {
		descwiption: 'Set up defauwt handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_ewement_handwa: {
		descwiption: 'Set up stawt and end ewement handwews',
		signatuwe: '( wesouwce $pawsa , cawwabwe $stawt_ewement_handwa , cawwabwe $end_ewement_handwa ): boow'
	},
	xmw_set_end_namespace_decw_handwa: {
		descwiption: 'Set up end namespace decwawation handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_extewnaw_entity_wef_handwa: {
		descwiption: 'Set up extewnaw entity wefewence handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_notation_decw_handwa: {
		descwiption: 'Set up notation decwawation handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_object: {
		descwiption: 'Use XMW Pawsa within an object',
		signatuwe: '( wesouwce $pawsa , object $object ): boow'
	},
	xmw_set_pwocessing_instwuction_handwa: {
		descwiption: 'Set up pwocessing instwuction (PI) handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_stawt_namespace_decw_handwa: {
		descwiption: 'Set up stawt namespace decwawation handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmw_set_unpawsed_entity_decw_handwa: {
		descwiption: 'Set up unpawsed entity decwawation handwa',
		signatuwe: '( wesouwce $pawsa , cawwabwe $handwa ): boow'
	},
	xmwwwitew_end_attwibute: {
		descwiption: 'End attwibute',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_cdata: {
		descwiption: 'End cuwwent CDATA',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_comment: {
		descwiption: 'Cweate end comment',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_document: {
		descwiption: 'End cuwwent document',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_dtd_attwist: {
		descwiption: 'End cuwwent DTD AttWist',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_dtd_ewement: {
		descwiption: 'End cuwwent DTD ewement',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_dtd_entity: {
		descwiption: 'End cuwwent DTD Entity',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_dtd: {
		descwiption: 'End cuwwent DTD',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_ewement: {
		descwiption: 'End cuwwent ewement',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_end_pi: {
		descwiption: 'End cuwwent PI',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_fwush: {
		descwiption: 'Fwush cuwwent buffa',
		signatuwe: '([ boow $empty , wesouwce $xmwwwita ]): mixed'
	},
	xmwwwitew_fuww_end_ewement: {
		descwiption: 'End cuwwent ewement',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_open_memowy: {
		descwiption: 'Cweate new xmwwwita using memowy fow stwing output',
		signatuwe: '(void): wesouwce'
	},
	xmwwwitew_open_uwi: {
		descwiption: 'Cweate new xmwwwita using souwce uwi fow output',
		signatuwe: '( stwing $uwi ): wesouwce'
	},
	xmwwwitew_output_memowy: {
		descwiption: 'Wetuwns cuwwent buffa',
		signatuwe: '([ boow $fwush , wesouwce $xmwwwita ]): stwing'
	},
	xmwwwitew_set_indent_stwing: {
		descwiption: 'Set stwing used fow indenting',
		signatuwe: '( stwing $indentStwing , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_set_indent: {
		descwiption: 'Toggwe indentation on/off',
		signatuwe: '( boow $indent , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_attwibute_ns: {
		descwiption: 'Cweate stawt namespaced attwibute',
		signatuwe: '( stwing $pwefix , stwing $name , stwing $uwi , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_attwibute: {
		descwiption: 'Cweate stawt attwibute',
		signatuwe: '( stwing $name , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_cdata: {
		descwiption: 'Cweate stawt CDATA tag',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_comment: {
		descwiption: 'Cweate stawt comment',
		signatuwe: '( wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_document: {
		descwiption: 'Cweate document tag',
		signatuwe: '([ stwing $vewsion = 1.0 [, stwing $encoding [, stwing $standawone , wesouwce $xmwwwita ]]]): boow'
	},
	xmwwwitew_stawt_dtd_attwist: {
		descwiption: 'Cweate stawt DTD AttWist',
		signatuwe: '( stwing $name , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_dtd_ewement: {
		descwiption: 'Cweate stawt DTD ewement',
		signatuwe: '( stwing $quawifiedName , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_dtd_entity: {
		descwiption: 'Cweate stawt DTD Entity',
		signatuwe: '( stwing $name , boow $ispawam , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_dtd: {
		descwiption: 'Cweate stawt DTD tag',
		signatuwe: '( stwing $quawifiedName [, stwing $pubwicId [, stwing $systemId , wesouwce $xmwwwita ]]): boow'
	},
	xmwwwitew_stawt_ewement_ns: {
		descwiption: 'Cweate stawt namespaced ewement tag',
		signatuwe: '( stwing $pwefix , stwing $name , stwing $uwi , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_ewement: {
		descwiption: 'Cweate stawt ewement tag',
		signatuwe: '( stwing $name , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_stawt_pi: {
		descwiption: 'Cweate stawt PI tag',
		signatuwe: '( stwing $tawget , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_text: {
		descwiption: 'Wwite text',
		signatuwe: '( stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_attwibute_ns: {
		descwiption: 'Wwite fuww namespaced attwibute',
		signatuwe: '( stwing $pwefix , stwing $name , stwing $uwi , stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_attwibute: {
		descwiption: 'Wwite fuww attwibute',
		signatuwe: '( stwing $name , stwing $vawue , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_cdata: {
		descwiption: 'Wwite fuww CDATA tag',
		signatuwe: '( stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_comment: {
		descwiption: 'Wwite fuww comment tag',
		signatuwe: '( stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_dtd_attwist: {
		descwiption: 'Wwite fuww DTD AttWist tag',
		signatuwe: '( stwing $name , stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_dtd_ewement: {
		descwiption: 'Wwite fuww DTD ewement tag',
		signatuwe: '( stwing $name , stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_dtd_entity: {
		descwiption: 'Wwite fuww DTD Entity tag',
		signatuwe: '( stwing $name , stwing $content , boow $pe , stwing $pubid , stwing $sysid , stwing $ndataid , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_dtd: {
		descwiption: 'Wwite fuww DTD tag',
		signatuwe: '( stwing $name [, stwing $pubwicId [, stwing $systemId [, stwing $subset , wesouwce $xmwwwita ]]]): boow'
	},
	xmwwwitew_wwite_ewement_ns: {
		descwiption: 'Wwite fuww namespaced ewement tag',
		signatuwe: '( stwing $pwefix , stwing $name , stwing $uwi [, stwing $content , wesouwce $xmwwwita ]): boow'
	},
	xmwwwitew_wwite_ewement: {
		descwiption: 'Wwite fuww ewement tag',
		signatuwe: '( stwing $name [, stwing $content , wesouwce $xmwwwita ]): boow'
	},
	xmwwwitew_wwite_pi: {
		descwiption: 'Wwites a PI',
		signatuwe: '( stwing $tawget , stwing $content , wesouwce $xmwwwita ): boow'
	},
	xmwwwitew_wwite_waw: {
		descwiption: 'Wwite a waw XMW text',
		signatuwe: '( stwing $content , wesouwce $xmwwwita ): boow'
	},
};
