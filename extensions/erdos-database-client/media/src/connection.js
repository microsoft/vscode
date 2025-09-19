/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const dbTypeSelect = document.getElementById('dbType');
    const dbTypeTabs = document.querySelectorAll('.tab-item');
    const connectionName = document.getElementById('connectionName');
    const hostGroup = document.getElementById('hostGroup');
    const portGroup = document.getElementById('portGroup');
    const databaseGroup = document.getElementById('databaseGroup');
    const fileGroup = document.getElementById('fileGroup');
    const testBtn = document.getElementById('testConnection');
    const saveBtn = document.getElementById('saveConnection');
    const toggleAdvanced = document.getElementById('toggleAdvanced');
    const advancedOptions = document.getElementById('advancedOptions');
    const useSSH = document.getElementById('useSSH');
    const sshOptions = document.getElementById('sshOptions');
    const browseFileBtn = document.getElementById('browseFile');
    const status = document.getElementById('status');
    
    let currentDbType = 'MySQL';
    
    // Database type configurations - includes all supported databases from Vue.js
    const dbConfigs = {
        'MySQL': { port: 3306, showHost: true, showDatabase: true, showFile: false },
        'PostgreSQL': { port: 5432, showHost: true, showDatabase: true, showFile: false },
        'SQLite': { port: null, showHost: false, showDatabase: true, showFile: true },
        'Redis': { port: 6379, showHost: true, showDatabase: true, showFile: false },
        'MongoDB': { port: 27017, showHost: true, showDatabase: false, showFile: false },
        'SqlServer': { port: 1433, showHost: true, showDatabase: true, showFile: false },
        'ElasticSearch': { port: 9200, showHost: true, showDatabase: true, showFile: false },
        'FTP': { port: 21, showHost: true, showDatabase: false, showFile: false },
        'SSH': { port: 22, showHost: true, showDatabase: true, showFile: false },
        'Exasol': { port: 8563, showHost: true, showDatabase: true, showFile: false }
    };
    
    // Event listeners
    if (dbTypeSelect) {
        dbTypeSelect.addEventListener('change', updateFormForDbType);
    }
    
    dbTypeTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            selectDatabaseType(tab.dataset.type);
        });
    });
    
    testBtn.addEventListener('click', testConnection);
    saveBtn.addEventListener('click', saveConnection);
    toggleAdvanced.addEventListener('click', toggleAdvancedOptions);
    useSSH.addEventListener('change', toggleSSHOptions);
    browseFileBtn.addEventListener('click', browseFile);
    
    // MongoDB-specific event listeners
    const useConnectionString = document.getElementById('useConnectionString');
    if (useConnectionString) {
        useConnectionString.addEventListener('change', toggleMongoConnectionString);
    }
    
    const connectionString = document.getElementById('connectionString');
    if (connectionString) {
        connectionString.addEventListener('input', parseMongoConnectionString);
    }
    
    // ElasticSearch auth type handlers
    const esAuthRadios = document.querySelectorAll('input[name="esAuth"]');
    esAuthRadios.forEach(radio => {
        radio.addEventListener('change', updateESAuthFields);
    });
    
    // SQL Server auth type handler
    const authTypeSelect = document.getElementById('authType');
    if (authTypeSelect) {
        authTypeSelect.addEventListener('change', updateSQLServerAuthFields);
    }
    
    // SSH auth type handlers
    const sshAuthRadios = document.querySelectorAll('input[name="sshAuthType"]');
    sshAuthRadios.forEach(radio => {
        radio.addEventListener('change', updateSSHAuthFields);
    });
    
    // Private key file browser
    const browsePrivateKeyBtn = document.getElementById('browsePrivateKey');
    if (browsePrivateKeyBtn) {
        browsePrivateKeyBtn.addEventListener('click', browsePrivateKey);
    }
    
    // SSL options toggle
    const useSSLCheckbox = document.getElementById('useSSL');
    if (useSSLCheckbox) {
        useSSLCheckbox.addEventListener('change', toggleSSLOptions);
    }
    
    // Message handler
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'connectionResult':
                showStatus(message.message, message.success ? 'success' : 'error');
                break;
            case 'connectionSaved':
                if (message.success) {
                    showStatus('Connected successfully!', 'success');
                }
                break;
            case 'fileSelected':
                if (message.fileType === 'privateKey') {
                    const privateKeyInput = document.getElementById('privateKeyPath');
                    if (privateKeyInput) {
                        privateKeyInput.value = message.path;
                    }
                } else {
                    const fileInput = document.getElementById('filePath');
                    if (fileInput) {
                        fileInput.value = message.path;
                    }
                }
                break;
        }
    });
    
    function selectDatabaseType(dbType) {
        // Update active tab
        dbTypeTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.type === dbType);
        });
        
        // Update hidden select element
        if (dbTypeSelect) {
            dbTypeSelect.value = dbType;
        }
        
        currentDbType = dbType;
        updateFormForDbType(dbType);
    }
    
    function updateFormForDbType(dbType) {
        // Handle both select element and direct dbType parameter
        if (typeof dbType === 'undefined' && dbTypeSelect) {
            dbType = dbTypeSelect.value;
        } else if (typeof dbType === 'object') {
            // Called from event handler
            dbType = currentDbType;
        }
        
        const config = dbConfigs[dbType];
        if (!config) return;
        
        // Update port
        const portInput = document.getElementById('port');
        if (config.port && portInput) {
            portInput.value = config.port;
        }
        
        // Show/hide form groups (both labels and inputs)
        const hostLabel = document.getElementById('hostLabel');
        const portLabel = document.getElementById('portLabel');
        if (hostLabel) hostLabel.style.display = config.showHost ? 'block' : 'none';
        if (hostGroup) hostGroup.style.display = config.showHost ? 'block' : 'none';
        if (portLabel) portLabel.style.display = config.showHost ? 'block' : 'none';
        if (portGroup) portGroup.style.display = config.showHost ? 'block' : 'none';
        
        const databaseLabel = document.getElementById('databaseLabel');
        if (databaseLabel) databaseLabel.style.display = config.showDatabase ? 'block' : 'none';
        if (databaseGroup) databaseGroup.style.display = config.showDatabase ? 'block' : 'none';
        
        const fileLabel = document.getElementById('fileLabel');
        if (fileLabel) fileLabel.style.display = config.showFile ? 'block' : 'none';
        if (fileGroup) fileGroup.style.display = config.showFile ? 'block' : 'none';
        
        // Hide all database-specific fields
        const dbSpecificFields = [
            // MongoDB fields
            'srvRecordGroup', 'useConnectionStringGroup', 'connectionStringGroup',
            // ElasticSearch fields  
            'elasticUrlGroup', 'esAuthGroup', 'esUsernameGroup', 'esPasswordGroup', 'esTokenGroup', 'esTimeoutGroup',
            // FTP fields
            'encodingGroup', 'showHiddenGroup',
            // SQL Server fields
            'instanceNameGroup', 'authTypeGroup', 'encryptGroup', 'domainGroup',
            // SQLite fields
            'sqliteWarning', 'sqliteFilePathGroup'
        ];
        
        const dbSpecificLabels = [
            // MongoDB labels
            'srvRecordLabel', 'useConnectionStringLabel', 'connectionStringLabel',
            // ElasticSearch labels
            'elasticUrlLabel', 'esAuthLabel', 'esUsernameLabel', 'esPasswordLabel', 'esTokenLabel', 'esTimeoutLabel',
            // FTP labels
            'encodingLabel', 'showHiddenLabel',
            // SQL Server labels
            'instanceNameLabel', 'authTypeLabel', 'encryptLabel', 'domainLabel',
            // SQLite labels
            'sqliteWarningLabel', 'sqliteFilePathLabel'
        ];
        
        // Hide all database-specific fields and labels
        [...dbSpecificFields, ...dbSpecificLabels].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });
        
        // Show specific fields for selected database - ONLY show what's needed, everything else stays hidden
        switch (dbType) {
            case 'MongoDB':
                // Show MongoDB-specific fields
                ['srvRecordLabel', 'srvRecordGroup', 'useConnectionStringLabel', 'useConnectionStringGroup'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'block';
                });
                break;
            case 'ElasticSearch':
                // Show ElasticSearch-specific fields
                ['elasticUrlLabel', 'elasticUrlGroup', 'esAuthLabel', 'esAuthGroup', 'esTimeoutLabel', 'esTimeoutGroup'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'block';
                });
                break;
            case 'FTP':
                // Show FTP-specific fields
                ['encodingLabel', 'encodingGroup', 'showHiddenLabel', 'showHiddenGroup'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'block';
                });
                break;
            case 'SqlServer':
                // Show SqlServer-specific fields
                ['instanceNameLabel', 'instanceNameGroup', 'authTypeLabel', 'authTypeGroup', 'encryptLabel', 'encryptGroup'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'block';
                });
                break;
            case 'SQLite':
                // Show SQLite-specific fields
                ['sqliteFilePathLabel', 'sqliteFilePathGroup'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.style.display = 'block';
                });
                break;
            // All other databases (MySQL, PostgreSQL, Redis, SSH, Exasol) have NO database-specific fields
            // So all database-specific fields remain hidden (display: none) - COMPLETELY GONE
        }
        
        // Show/hide timezone field for MySQL only (matching Vue behavior)
        const timezoneLabel = document.getElementById('timezoneLabel');
        const timezoneGroup = document.getElementById('timezoneGroup');
        if (timezoneLabel && timezoneGroup) {
            const showTimezone = dbType === 'MySQL';
            timezoneLabel.style.display = showTimezone ? 'block' : 'none';
            timezoneGroup.style.display = showTimezone ? 'block' : 'none';
        }
        
        // Show/hide includeDatabases field for databases that support it (exclude Redis only, matching Vue behavior)
        const includeDatabasesLabel = document.getElementById('includeDatabasesLabel');
        const includeDatabasesGroup = document.getElementById('includeDatabasesGroup');
        if (includeDatabasesLabel && includeDatabasesGroup) {
            const showIncludeDatabases = dbType !== 'Redis';
            includeDatabasesLabel.style.display = showIncludeDatabases ? 'block' : 'none';
            includeDatabasesGroup.style.display = showIncludeDatabases ? 'block' : 'none';
        }
    }
    
    function getConnectionConfig() {
        const config = {
            name: connectionName ? connectionName.value : '',
            dbType: currentDbType,
            host: document.getElementById('host') ? document.getElementById('host').value : 'localhost',
            port: document.getElementById('port') ? parseInt(document.getElementById('port').value) : dbConfigs[currentDbType].port,
            user: document.getElementById('username') ? document.getElementById('username').value : '',
            password: document.getElementById('password') ? document.getElementById('password').value : '',
            database: document.getElementById('database') ? document.getElementById('database').value : '',
            dbPath: document.getElementById('filePath') ? document.getElementById('filePath').value : '',
            useSSL: document.getElementById('useSSL') ? document.getElementById('useSSL').checked : false,
            usingSSH: document.getElementById('useSSH') ? document.getElementById('useSSH').checked : false,
            global: document.querySelector('input[name="target"]:checked') ? 
                    document.querySelector('input[name="target"]:checked').value === 'global' : true,
            
            // Universal timeout fields
            connectTimeout: document.getElementById('connectTimeout') ? parseInt(document.getElementById('connectTimeout').value) || 5000 : 5000,
            requestTimeout: document.getElementById('requestTimeout') ? parseInt(document.getElementById('requestTimeout').value) || 10000 : 10000,
            
            // Universal database fields
            includeDatabases: document.getElementById('includeDatabases') ? document.getElementById('includeDatabases').value : '',
            timezone: document.getElementById('timezone') ? document.getElementById('timezone').value : '+00:00',
            
            // SSL certificate fields
            caPath: document.getElementById('caPath') ? document.getElementById('caPath').value : '',
            clientCertPath: document.getElementById('clientCertPath') ? document.getElementById('clientCertPath').value : '',
            clientKeyPath: document.getElementById('clientKeyPath') ? document.getElementById('clientKeyPath').value : '',
            
            // Enhanced SSH configuration
            ssh: useSSH && useSSH.checked ? {
                host: document.getElementById('sshHost') ? document.getElementById('sshHost').value : '',
                port: document.getElementById('sshPort') ? parseInt(document.getElementById('sshPort').value) || 22 : 22,
                username: document.getElementById('sshUser') ? document.getElementById('sshUser').value : '',
                password: document.getElementById('sshPassword') ? document.getElementById('sshPassword').value : '',
                type: document.querySelector('input[name="sshAuthType"]:checked') ? document.querySelector('input[name="sshAuthType"]:checked').value : 'password',
                privateKeyPath: document.getElementById('privateKeyPath') ? document.getElementById('privateKeyPath').value : '',
                passphrase: document.getElementById('passphrase') ? document.getElementById('passphrase').value : '',
                cipher: document.getElementById('sshCipher') ? document.getElementById('sshCipher').value : '',
                waitingTime: document.getElementById('waitingTime') ? parseInt(document.getElementById('waitingTime').value) || 5000 : 5000,
                algorithms: {
                    cipher: document.getElementById('sshCipher') && document.getElementById('sshCipher').value ? 
                            [document.getElementById('sshCipher').value] : []
                }
            } : null
        };
        
        // Add database-specific configurations
        switch (currentDbType) {
            case 'MongoDB':
                config.srv = document.getElementById('srvRecord') ? document.getElementById('srvRecord').checked : false;
                config.useConnectionString = document.getElementById('useConnectionString') ? document.getElementById('useConnectionString').checked : false;
                if (config.useConnectionString) {
                    config.connectionUrl = document.getElementById('connectionString') ? document.getElementById('connectionString').value : '';
                }
                break;
            case 'ElasticSearch':
                config.esAuth = document.querySelector('input[name="esAuth"]:checked') ? document.querySelector('input[name="esAuth"]:checked').value : 'none';
                if (config.esAuth === 'account') {
                    config.esUsername = document.getElementById('esUsername') ? document.getElementById('esUsername').value : '';
                    config.esPassword = document.getElementById('esPassword') ? document.getElementById('esPassword').value : '';
                } else if (config.esAuth === 'token') {
                    config.esToken = document.getElementById('esToken') ? document.getElementById('esToken').value : '';
                }
                // Override connectTimeout for ElasticSearch with specific field
                const esTimeout = document.getElementById('esTimeout');
                if (esTimeout && esTimeout.value) {
                    config.connectTimeout = parseInt(esTimeout.value) || 2000;
                }
                break;
            case 'FTP':
                config.encoding = document.getElementById('encoding') ? document.getElementById('encoding').value : 'UTF8';
                config.showHidden = document.getElementById('showHidden') ? document.getElementById('showHidden').checked : false;
                break;
            case 'SqlServer':
                config.authType = document.getElementById('authType') ? document.getElementById('authType').value : 'default';
                config.encrypt = document.getElementById('encrypt') ? document.getElementById('encrypt').checked : false;
                config.instanceName = document.getElementById('instanceName') ? document.getElementById('instanceName').value : '';
                if (config.authType === 'ntlm') {
                    config.domain = document.getElementById('domain') ? document.getElementById('domain').value : '';
                }
                break;
            case 'SSH':
                config.showHidden = document.getElementById('showHidden') ? document.getElementById('showHidden').checked : false;
                break;
        }
        
        return config;
    }
    
    function testConnection() {
        const config = getConnectionConfig();
        showStatus('Testing connection...', 'info');
        
        vscode.postMessage({
            type: 'testConnection',
            config: config
        });
    }
    
    function saveConnection() {
        const config = getConnectionConfig();
        showStatus('Connecting...', 'info');
        
        vscode.postMessage({
            type: 'saveConnection',
            config: config
        });
    }
    
    function toggleAdvancedOptions() {
        const isHidden = advancedOptions.style.display === 'none' || !advancedOptions.style.display;
        advancedOptions.style.display = isHidden ? 'block' : 'none';
        
        const icon = toggleAdvanced.querySelector('.codicon');
        if (icon) {
            icon.className = isHidden ? 'codicon codicon-chevron-down' : 'codicon codicon-chevron-right';
        }
    }
    
    function toggleSSHOptions() {
        if (sshOptions) {
            sshOptions.style.display = useSSH.checked ? 'block' : 'none';
        }
    }
    
    function browseFile() {
        vscode.postMessage({ type: 'browseFile' });
    }
    
    function showStatus(message, type) {
        if (status) {
            status.textContent = message;
            status.className = `status-message status-${type}`;
            status.style.display = 'block';
            
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    status.style.display = 'none';
                }, 3000);
            }
        }
    }
    
    // MongoDB-specific functions
    function toggleMongoConnectionString() {
        const connectionStringLabel = document.getElementById('connectionStringLabel');
        const connectionStringGroup = document.getElementById('connectionStringGroup');
        const useConnectionString = document.getElementById('useConnectionString');
        
        if (connectionStringLabel && connectionStringGroup && useConnectionString) {
            const display = useConnectionString.checked ? 'block' : 'none';
            connectionStringLabel.style.display = display;
            connectionStringGroup.style.display = display;
        }
    }
    
    function parseMongoConnectionString() {
        const connectionUrl = document.getElementById('connectionString').value;
        if (!connectionUrl) return;
        
        // Parse SRV record
        const srvRegex = /(?<=mongodb\+).+?(?=:\/\/)/;
        const srv = connectionUrl.match(srvRegex);
        const srvRecord = document.getElementById('srvRecord');
        if (srv && srvRecord) {
            srvRecord.checked = true;
        }
        
        // Parse username
        const userRegex = /(?<=\/\/).+?(?=\:)/;
        const user = connectionUrl.match(userRegex);
        const usernameInput = document.getElementById('username');
        if (user && usernameInput) {
            usernameInput.value = user[0];
        }
        
        // Parse password
        const passwordRegex = /(?<=\/\/:).+?(?=@)/;
        const password = connectionUrl.match(passwordRegex);
        const passwordInput = document.getElementById('password');
        if (password && passwordInput) {
            passwordInput.value = password[0];
        }
        
        // Parse host
        const hostRegex = /(?<=@).+?(?=[:\/])/;
        const host = connectionUrl.match(hostRegex);
        const hostInput = document.getElementById('host');
        if (host && hostInput) {
            hostInput.value = host[0];
        }
        
        // Parse port (only if not SRV)
        if (!srv) {
            const portRegex = /(?<=\:).\d+/;
            const port = connectionUrl.match(portRegex);
            const portInput = document.getElementById('port');
            if (port && portInput) {
                portInput.value = port[0];
            }
        }
    }
    
    // ElasticSearch auth field management
    function updateESAuthFields() {
        const selectedAuth = document.querySelector('input[name="esAuth"]:checked').value;
        
        // Hide all auth-specific fields
        ['esUsernameLabel', 'esUsernameGroup', 'esPasswordLabel', 'esPasswordGroup', 'esTokenLabel', 'esTokenGroup'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });
        
        // Show fields based on selected auth type
        if (selectedAuth === 'account') {
            ['esUsernameLabel', 'esUsernameGroup', 'esPasswordLabel', 'esPasswordGroup'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.style.display = 'block';
            });
        } else if (selectedAuth === 'token') {
            ['esTokenLabel', 'esTokenGroup'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.style.display = 'block';
            });
        }
    }
    
    // SQL Server auth field management
    function updateSQLServerAuthFields() {
        const authType = document.getElementById('authType').value;
        const domainLabel = document.getElementById('domainLabel');
        const domainGroup = document.getElementById('domainGroup');
        
        if (domainLabel) domainLabel.style.display = authType === 'ntlm' ? 'block' : 'none';
        if (domainGroup) domainGroup.style.display = authType === 'ntlm' ? 'block' : 'none';
    }
    
    // SSH auth field management
    function updateSSHAuthFields() {
        const selectedAuth = document.querySelector('input[name="sshAuthType"]:checked').value;
        const passwordAuth = document.getElementById('sshPasswordAuth');
        const keyAuth = document.getElementById('sshKeyAuth');
        const nativeAuth = document.getElementById('sshNativeAuth');
        
        if (passwordAuth) passwordAuth.style.display = selectedAuth === 'password' ? 'block' : 'none';
        if (keyAuth) keyAuth.style.display = selectedAuth === 'privateKey' ? 'block' : 'none';
        if (nativeAuth) nativeAuth.style.display = selectedAuth === 'native' ? 'block' : 'none';
    }
    
    // SSL options toggle
    function toggleSSLOptions() {
        const sslOptions = document.getElementById('sslOptions');
        const useSSLCheckbox = document.getElementById('useSSL');
        if (sslOptions && useSSLCheckbox) {
            sslOptions.style.display = useSSLCheckbox.checked ? 'block' : 'none';
        }
    }
    
    // Browse private key file
    function browsePrivateKey() {
        vscode.postMessage({ 
            type: 'browseFile',
            fileType: 'privateKey',
            filters: {
                'Private Key': ['key', 'cer', 'crt', 'der', 'pub', 'pem', 'pk'],
                'All Files': ['*']
            }
        });
    }
    
    // Initialize
    selectDatabaseType('MySQL');
})();