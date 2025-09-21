/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { IDatabaseConnection, DatabaseType } from '../../common/erdosDatabaseClientApi.js';
import { FileAccess, type AppResourcePath } from '../../../../../base/common/network.js';

interface ConnectionFormProps {
    initialConnection?: IDatabaseConnection;
    onTestConnection: (config: IDatabaseConnection) => Promise<{ success: boolean; message: string }>;
    onSaveConnection: (config: IDatabaseConnection) => Promise<{ success: boolean; connectionId: string }>;
    onBrowseFile: (filters?: { [name: string]: string[] }) => Promise<string | null>;
}

interface DatabaseConfig {
    port: number | null;
    showHost: boolean;
    showDatabase: boolean;
    showFile: boolean;
}

const DB_CONFIGS: Record<DatabaseType, DatabaseConfig> = {
    [DatabaseType.MySQL]: { port: 3306, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.PostgreSQL]: { port: 5432, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.SQLite]: { port: null, showHost: false, showDatabase: true, showFile: true },
    [DatabaseType.Redis]: { port: 6379, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.MongoDB]: { port: 27017, showHost: true, showDatabase: false, showFile: false },
    [DatabaseType.SqlServer]: { port: 1433, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.ElasticSearch]: { port: 9200, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.FTP]: { port: 21, showHost: true, showDatabase: false, showFile: false },
    [DatabaseType.SSH]: { port: 22, showHost: true, showDatabase: true, showFile: false },
    [DatabaseType.Exasol]: { port: 8563, showHost: true, showDatabase: true, showFile: false }
};

// Helper function to convert internal media paths to browser URIs
const convertDatabaseIconPath = (path: string): string => {
    const fullPath = `vs/workbench/contrib/erdosDatabaseClient/media/${path}` as AppResourcePath;
    const browserUri = FileAccess.asBrowserUri(fullPath);
    return browserUri.toString();
};

const DATABASE_ICONS: Record<DatabaseType, string> = {
    [DatabaseType.MySQL]: convertDatabaseIconPath('resources/icon/mysql.svg'),
    [DatabaseType.PostgreSQL]: convertDatabaseIconPath('resources/icon/pg_server.svg'),
    [DatabaseType.SQLite]: convertDatabaseIconPath('resources/icon/sqlite-icon.svg'),
    [DatabaseType.Redis]: convertDatabaseIconPath('resources/image/redis_connection.png'),
    [DatabaseType.MongoDB]: convertDatabaseIconPath('resources/icon/mongodb-icon.svg'),
    [DatabaseType.SqlServer]: convertDatabaseIconPath('resources/icon/mssql_server.png'),
    [DatabaseType.ElasticSearch]: convertDatabaseIconPath('resources/icon/elasticsearch.svg'),
    [DatabaseType.FTP]: convertDatabaseIconPath('resources/icon/ftp.svg'),
    [DatabaseType.SSH]: convertDatabaseIconPath('resources/icon/ssh.svg'),
    [DatabaseType.Exasol]: convertDatabaseIconPath('resources/icon/exasol.svg')
};

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
    initialConnection,
    onTestConnection,
    onSaveConnection,
    onBrowseFile
}) => {
    // Form state - exactly matching original form structure
    const [connection, setConnection] = useState<IDatabaseConnection>({
        id: initialConnection?.id || '',
        name: initialConnection?.name || '',
        dbType: initialConnection?.dbType || DatabaseType.MySQL,
        host: initialConnection?.host || 'localhost',
        port: initialConnection?.port || DB_CONFIGS[DatabaseType.MySQL].port!,
        database: initialConnection?.database || '',
        schema: initialConnection?.schema || '',
        user: initialConnection?.user || '',
        password: initialConnection?.password || '',
        ssh: initialConnection?.ssh || undefined,
        ssl: initialConnection?.ssl || undefined,
        options: initialConnection?.options || {}
    });

    // UI state - exactly matching original form
    const [isGlobal, setIsGlobal] = useState(true);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [useSSL, setUseSSL] = useState(false);
    const [useSSH, setUseSSH] = useState(false);
    const [sshAuthType, setSSHAuthType] = useState<'password' | 'privateKey' | 'native'>('password');
    const [esAuth, setESAuth] = useState<'none' | 'account' | 'token'>('none');
    const [sqlServerAuthType, setSqlServerAuthType] = useState<'default' | 'ntlm'>('default');
    const [useMongoConnectionString, setUseMongoConnectionString] = useState(false);
    const [mongoSrvRecord, setMongoSrvRecord] = useState(false);
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Database-specific form fields - exactly matching original
    const [mongoConnectionString, setMongoConnectionString] = useState('');
    const [filePath, setFilePath] = useState('');
    const [sqliteFilePath, setSqliteFilePath] = useState('');
    const [privateKeyPath, setPrivateKeyPath] = useState('');
    const [esUrl, setEsUrl] = useState('https://localhost:9200');
    const [esUsername, setEsUsername] = useState('');
    const [esPassword, setEsPassword] = useState('');
    const [esToken, setEsToken] = useState('');
    const [esTimeout, setEsTimeout] = useState(2000);
    const [encoding, setEncoding] = useState('UTF8');
    const [showHidden, setShowHidden] = useState(false);
    const [instanceName, setInstanceName] = useState('');
    const [encrypt, setEncrypt] = useState(false);
    const [domain, setDomain] = useState('');
    const [connectTimeout, setConnectTimeout] = useState(5000);
    const [requestTimeout, setRequestTimeout] = useState(10000);
    const [timezone, setTimezone] = useState('+00:00');
    const [includeDatabases, setIncludeDatabases] = useState('');
    const [caPath, setCaPath] = useState('');
    const [clientCertPath, setClientCertPath] = useState('');
    const [clientKeyPath, setClientKeyPath] = useState('');
    const [sshHost, setSshHost] = useState('');
    const [sshPort, setSshPort] = useState(22);
    const [sshUser, setSshUser] = useState('');
    const [sshPassword, setSshPassword] = useState('');
    const [sshCipher, setSshCipher] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [waitingTime, setWaitingTime] = useState(5000);

    // Update form when database type changes
    useEffect(() => {
        const config = DB_CONFIGS[connection.dbType];
        if (config.port && connection.port !== config.port) {
            setConnection((prev: IDatabaseConnection) => ({ ...prev, port: config.port! }));
        }
    }, [connection.dbType]);

    // Initialize SSH/SSL state from connection
    useEffect(() => {
        setUseSSL(!!connection.ssl);
        setUseSSH(!!connection.ssh);
        if (connection.ssh) {
            setSSHAuthType(connection.ssh.password ? 'password' : 
                          connection.ssh.privateKeyPath ? 'privateKey' : 'native');
        }
    }, [connection.ssl, connection.ssh]);

    const handleDatabaseTypeChange = useCallback((dbType: DatabaseType) => {
        const config = DB_CONFIGS[dbType];
        setConnection((prev: IDatabaseConnection) => ({
            ...prev,
            dbType,
            port: config.port || prev.port,
            host: config.showHost ? prev.host : '',
            database: config.showDatabase ? prev.database : ''
        }));
    }, []);

    const handleInputChange = useCallback((field: keyof IDatabaseConnection, value: any) => {
        setConnection((prev: IDatabaseConnection) => ({ ...prev, [field]: value }));
    }, []);


    const showStatus = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setStatus({ message, type });
        if (type === 'success' || type === 'error') {
            setTimeout(() => setStatus(null), 3000);
        }
    }, []);

    const handleTestConnection = useCallback(async () => {
        showStatus('Testing connection...', 'info');
        try {
            const result = await onTestConnection(connection);
            showStatus(result.message, result.success ? 'success' : 'error');
        } catch (error) {
            console.error('[ConnectionForm] handleTestConnection - Error:', error);
            showStatus('Connection test failed', 'error');
        }
    }, [connection, onTestConnection, showStatus]);

	const handleSaveConnection = useCallback(async () => {
	    showStatus('Connecting...', 'info');
		try {
			// First test the connection to make sure it actually works
			const testResult = await onTestConnection(connection);
			if (!testResult.success) {
				showStatus(`Connection failed: ${testResult.message}`, 'error');
				return;
			}
			
			// If test passes, save the connection
			const result = await onSaveConnection(connection);
			showStatus(result.success ? 'Connected successfully!' : `Connection save failed: ${result.connectionId}`, 
					  result.success ? 'success' : 'error');
		} catch (error) {
			console.error('[ConnectionForm] handleSaveConnection - Error:', error);
			showStatus('Connection failed', 'error');
		}
	}, [connection, onSaveConnection, showStatus]);

    const handleBrowseFile = useCallback(async (fileType: 'database' | 'sqlite' | 'privateKey' = 'database') => {
        let filters: { [name: string]: string[] } = { 'All Files': ['*'] };
        
        if (fileType === 'database') {
            filters = { 'Database Files': ['db', 'sqlite', 'sqlite3', 'db3'], 'All Files': ['*'] };
        } else if (fileType === 'privateKey') {
            filters = { 'Private Key': ['key', 'cer', 'crt', 'der', 'pub', 'pem', 'pk'], 'All Files': ['*'] };
        }

        const result = await onBrowseFile(filters);
        if (result) {
            if (fileType === 'sqlite') {
                setSqliteFilePath(result);
            } else if (fileType === 'privateKey') {
                setPrivateKeyPath(result);
            } else {
                setFilePath(result);
            }
        }
    }, [onBrowseFile]);

    const parseMongoConnectionString = useCallback((connectionUrl: string) => {
        if (!connectionUrl) return;

        // Parse SRV record
        const srvMatch = connectionUrl.match(/(?<=mongodb\+).+?(?=:\/\/)/);
        if (srvMatch) {
            setMongoSrvRecord(true);
        }

        // Parse username
        const userMatch = connectionUrl.match(/(?<=\/\/).+?(?=\:)/);
        if (userMatch) {
            handleInputChange('user', userMatch[0]);
        }

        // Parse password
        const passwordMatch = connectionUrl.match(/(?<=\/\/:).+?(?=@)/);
        if (passwordMatch) {
            handleInputChange('password', passwordMatch[0]);
        }

        // Parse host
        const hostMatch = connectionUrl.match(/(?<=@).+?(?=[:\/])/);
        if (hostMatch) {
            handleInputChange('host', hostMatch[0]);
        }

        // Parse port (only if not SRV)
        if (!srvMatch) {
            const portMatch = connectionUrl.match(/(?<=\:).\d+/);
            if (portMatch) {
                handleInputChange('port', parseInt(portMatch[0]));
            }
        }
    }, [handleInputChange]);

    const config = DB_CONFIGS[connection.dbType];

    return (
        <div className="container">
            <div className="connection-form">
                <div className="main-layout">
                    {/* Left side: Database type selection - exactly matching original */}
                    <div className="database-selection">
                        <div className="database-stack">
                            {Object.values(DatabaseType).map((dbType: DatabaseType) => {
                                const iconSrc = DATABASE_ICONS[dbType];
                                return (
                                    <div 
                                        key={dbType}
                                        className={`tab-item ${connection.dbType === dbType ? 'active' : ''}`}
                                        onClick={() => handleDatabaseTypeChange(dbType)}
                                    >
                                        <img 
                                            src={iconSrc}
                                            alt={dbType} 
                                            className="db-icon"
                                            onError={(e) => {
                                                console.error(`[ConnectionForm] Failed to load icon for ${dbType}: ${iconSrc}`, e);
                                                // Fallback to a codicon if image fails
                                                const img = e.target as HTMLImageElement;
                                                img.style.display = 'none';
                                                const parent = img.parentElement;
                                                if (parent && !parent.querySelector('.codicon-fallback')) {
                                                    const fallback = document.createElement('span');
                                                    fallback.className = 'codicon codicon-database db-icon codicon-fallback';
                                                    parent.insertBefore(fallback, img);
                                                }
                                            }}
                                        />
                                        <span>{dbType}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right side: All form content in two-column layout - exactly matching original */}
                    <div className="form-content">
                        <div className="form-grid">
                            {/* Basic connection fields */}
                            <div className="field-name">Connection Name</div>
                            <div className="field-input">
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    placeholder="My Database"
                                    value={connection.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                />
                            </div>
                            
                            <div className="field-name">Connection Target</div>
                            <div className="field-input">
                                <div className="radio-group">
                                    <label><input type="radio" name="target" value="global" checked={isGlobal} onChange={() => setIsGlobal(true)} /> Global</label>
                                    <label><input type="radio" name="target" value="workspace" checked={!isGlobal} onChange={() => setIsGlobal(false)} /> Current Workspace</label>
                                </div>
                            </div>
                            
                            {/* Host field */}
                            {config.showHost && (
                                <>
                                    <div className="field-name">Host</div>
                                    <div className="field-input">
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder="localhost"
                                            value={connection.host}
                                            onChange={(e) => handleInputChange('host', e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                            
                            {/* Port field */}
                            {config.showHost && (
                                <>
                                    <div className="field-name">Port</div>
                                    <div className="field-input">
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            placeholder={config.port?.toString() || ''}
                                            value={connection.port || ''}
                                            onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                </>
                            )}
                            
                            <div className="field-name">Username</div>
                            <div className="field-input">
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={connection.user}
                                    onChange={(e) => handleInputChange('user', e.target.value)}
                                />
                            </div>
                            
                            <div className="field-name">Password</div>
                            <div className="field-input">
                                <input 
                                    type="password" 
                                    className="form-control"
                                    value={connection.password || ''}
                                    onChange={(e) => handleInputChange('password', e.target.value || '')}
                                />
                            </div>
                            
                            {/* Database field */}
                            {config.showDatabase && (
                                <>
                                    <div className="field-name">Database</div>
                                    <div className="field-input">
                                        <input 
                                            type="text" 
                                            className="form-control"
                                            value={connection.database}
                                            onChange={(e) => handleInputChange('database', e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                            
                            {/* File path field for SQLite */}
                            {config.showFile && (
                                <>
                                    <div className="field-name">File Path</div>
                                    <div className="field-input">
                                        <div className="file-input-group">
                                            <input 
                                                type="text" 
                                                className="form-control" 
                                                readOnly
                                                value={filePath}
                                            />
                                            <button 
                                                type="button" 
                                                className="btn-action"
                                                onClick={() => handleBrowseFile('database')}
                                            >
                                                Browse
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* MongoDB specific fields - exactly matching original */}
                            {connection.dbType === DatabaseType.MongoDB && (
                                <>
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={mongoSrvRecord} onChange={(e) => setMongoSrvRecord(e.target.checked)} /> SRV Record</label>
                                    </div>
                                    
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={useMongoConnectionString} onChange={(e) => setUseMongoConnectionString(e.target.checked)} /> Use Connection String</label>
                                    </div>
                                    
                                    {useMongoConnectionString && (
                                        <>
                                            <div className="field-name">Connection String</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    placeholder="mongodb+srv://username:password@server-url/admin"
                                                    value={mongoConnectionString}
                                                    onChange={(e) => {
                                                        setMongoConnectionString(e.target.value);
                                                        parseMongoConnectionString(e.target.value);
                                                    }}
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* ElasticSearch specific fields - exactly matching original */}
                            {connection.dbType === DatabaseType.ElasticSearch && (
                                <>
                                    <div className="field-name">URL</div>
                                    <div className="field-input">
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder="https://localhost:9200"
                                            value={esUrl}
                                            onChange={(e) => setEsUrl(e.target.value)}
                                        />
                                    </div>
                                    
                                    <div className="field-name">Basic Auth (Optional)</div>
                                    <div className="field-input">
                                        <div className="radio-group">
                                            <label><input type="radio" name="esAuth" value="none" checked={esAuth === 'none'} onChange={() => setESAuth('none')} /> Not Auth</label>
                                            <label><input type="radio" name="esAuth" value="account" checked={esAuth === 'account'} onChange={() => setESAuth('account')} /> Account</label>
                                            <label><input type="radio" name="esAuth" value="token" checked={esAuth === 'token'} onChange={() => setESAuth('token')} /> Token</label>
                                        </div>
                                    </div>
                                    
                                    {esAuth === 'account' && (
                                        <>
                                            <div className="field-name">Username</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    value={esUsername}
                                                    onChange={(e) => setEsUsername(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">Password</div>
                                            <div className="field-input">
                                                <input 
                                                    type="password" 
                                                    className="form-control"
                                                    value={esPassword}
                                                    onChange={(e) => setEsPassword(e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}
                                    
                                    {esAuth === 'token' && (
                                        <>
                                            <div className="field-name">Token</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    placeholder="Basic Auth Token. e.g Bearer <token>"
                                                    value={esToken}
                                                    onChange={(e) => setEsToken(e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}
                                    
                                    <div className="field-name">Connection Timeout (ms)</div>
                                    <div className="field-input">
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            placeholder="2000"
                                            value={esTimeout}
                                            onChange={(e) => setEsTimeout(parseInt(e.target.value) || 2000)}
                                        />
                                    </div>
                                </>
                            )}

                            {/* FTP specific fields - exactly matching original */}
                            {connection.dbType === DatabaseType.FTP && (
                                <>
                                    <div className="field-name">Encoding</div>
                                    <div className="field-input">
                                        <input 
                                            type="text" 
                                            className="form-control" 
                                            placeholder="UTF8"
                                            value={encoding}
                                            onChange={(e) => setEncoding(e.target.value)}
                                        />
                                    </div>
                                    
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show Hidden Files</label>
                                    </div>
                                </>
                            )}

                            {/* SQL Server specific fields - exactly matching original */}
                            {connection.dbType === DatabaseType.SqlServer && (
                                <>
                                    <div className="field-name">Instance Name</div>
                                    <div className="field-input">
                                        <input 
                                            type="text" 
                                            className="form-control"
                                            placeholder="Connection named instance"
                                            title="The instance name to connect to. The SQL Server Browser service must be running on the database server, and UDP port 1434 on the database server must be reachable.(no default)"
                                            value={instanceName}
                                            onChange={(e) => setInstanceName(e.target.value)}
                                        />
                                        <small className="form-text">If instance name is specified, the port config is ignored</small>
                                    </div>
                                    
                                    <div className="field-name">Auth Type</div>
                                    <div className="field-input">
                                        <select 
                                            className="form-control"
                                            value={sqlServerAuthType}
                                            onChange={(e) => setSqlServerAuthType(e.target.value as 'default' | 'ntlm')}
                                        >
                                            <option value="default">Default</option>
                                            <option value="ntlm">NTLM (Windows Auth)</option>
                                        </select>
                                    </div>
                                    
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} /> Encrypt</label>
                                    </div>
                                    
                                    {sqlServerAuthType === 'ntlm' && (
                                        <>
                                            <div className="field-name">Domain <span className="text-red">*</span></div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    placeholder="Domain"
                                                    value={domain}
                                                    onChange={(e) => setDomain(e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {/* SQLite specific fields - exactly matching original */}
                            {connection.dbType === DatabaseType.SQLite && (
                                <>
                                    <div className="field-name">SQLite File Path</div>
                                    <div className="field-input">
                                        <div className="file-input-group">
                                            <input 
                                                type="text" 
                                                className="form-control" 
                                                readOnly
                                                value={sqliteFilePath}
                                            />
                                            <button 
                                                type="button" 
                                                className="btn-action"
                                                onClick={() => handleBrowseFile('sqlite')}
                                            >
                                                Choose Database File
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        
                        {/* Advanced Options Section - exactly matching original */}
                        <div className="advanced-section">
                            <button 
                                type="button" 
                                className="btn btn-link"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                            >
                                <i className={`codicon codicon-chevron-${showAdvanced ? 'down' : 'right'}`}></i> Advanced Options
                            </button>
                            
                            {showAdvanced && (
                                <div className="form-grid">
                                    <div className="field-name">Connection Timeout</div>
                                    <div className="field-input">
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            placeholder="5000"
                                            value={connectTimeout}
                                            onChange={(e) => setConnectTimeout(parseInt(e.target.value) || 5000)}
                                        />
                                    </div>
                                    
                                    <div className="field-name">Request Timeout</div>
                                    <div className="field-input">
                                        <input 
                                            type="number" 
                                            className="form-control" 
                                            placeholder="10000"
                                            value={requestTimeout}
                                            onChange={(e) => setRequestTimeout(parseInt(e.target.value) || 10000)}
                                        />
                                    </div>
                                    
                                    {/* MySQL timezone field */}
                                    {connection.dbType === DatabaseType.MySQL && (
                                        <>
                                            <div className="field-name">Timezone</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control" 
                                                    placeholder="+HH:MM"
                                                    value={timezone}
                                                    onChange={(e) => setTimezone(e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}
                                    
                                    {/* Include Databases field (exclude Redis) */}
                                    {connection.dbType !== DatabaseType.Redis && (
                                        <>
                                            <div className="field-name">Include Databases</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    placeholder="mysql,information_schema"
                                                    value={includeDatabases}
                                                    onChange={(e) => setIncludeDatabases(e.target.value)}
                                                />
                                            </div>
                                        </>
                                    )}
                                    
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={useSSL} onChange={(e) => setUseSSL(e.target.checked)} /> Use SSL</label>
                                    </div>
                                    
                                    <div className="field-name"></div>
                                    <div className="field-input">
                                        <label><input type="checkbox" checked={useSSH} onChange={(e) => setUseSSH(e.target.checked)} /> Use SSH Tunnel</label>
                                    </div>
                                    
                                    {/* SSL Configuration */}
                                    {useSSL && (
                                        <div id="sslOptions" style={{ display: useSSL ? 'grid' : 'none' }}>
                                            <div className="field-name">CA Certificate Path</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    value={caPath}
                                                    onChange={(e) => setCaPath(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">Client Certificate Path</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    value={clientCertPath}
                                                    onChange={(e) => setClientCertPath(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">Client Key Path</div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control"
                                                    value={clientKeyPath}
                                                    onChange={(e) => setClientKeyPath(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* SSH Configuration */}
                                    {useSSH && (
                                        <div id="sshOptions" style={{ display: useSSH ? 'grid' : 'none' }}>
                                            <div className="field-name">SSH Host <span className="text-red">*</span></div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control" 
                                                    required
                                                    value={sshHost}
                                                    onChange={(e) => setSshHost(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">SSH Port <span className="text-red">*</span></div>
                                            <div className="field-input">
                                                <input 
                                                    type="number" 
                                                    className="form-control" 
                                                    placeholder="22"
                                                    required
                                                    value={sshPort}
                                                    onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">SSH Username <span className="text-red">*</span></div>
                                            <div className="field-input">
                                                <input 
                                                    type="text" 
                                                    className="form-control" 
                                                    required
                                                    value={sshUser}
                                                    onChange={(e) => setSshUser(e.target.value)}
                                                />
                                            </div>
                                            
                                            <div className="field-name">SSH Cipher</div>
                                            <div className="field-input">
                                                <select 
                                                    className="form-control"
                                                    value={sshCipher}
                                                    onChange={(e) => setSshCipher(e.target.value)}
                                                >
                                                    <option value="">Default</option>
                                                    <option value="aes128-cbc">aes128-cbc</option>
                                                    <option value="aes192-cbc">aes192-cbc</option>
                                                    <option value="aes256-cbc">aes256-cbc</option>
                                                    <option value="3des-cbc">3des-cbc</option>
                                                    <option value="aes128-ctr">aes128-ctr</option>
                                                    <option value="aes192-ctr">aes192-ctr</option>
                                                    <option value="aes256-ctr">aes256-ctr</option>
                                                </select>
                                            </div>
                                            
                                            <div className="field-name">SSH Auth Type</div>
                                            <div className="field-input">
                                                <div className="radio-group">
                                                    <label><input type="radio" name="sshAuthType" value="password" checked={sshAuthType === 'password'} onChange={() => setSSHAuthType('password')} /> Password</label>
                                                    <label><input type="radio" name="sshAuthType" value="privateKey" checked={sshAuthType === 'privateKey'} onChange={() => setSSHAuthType('privateKey')} /> Private Key</label>
                                                    <label><input type="radio" name="sshAuthType" value="native" checked={sshAuthType === 'native'} onChange={() => setSSHAuthType('native')} /> Native SSH</label>
                                                </div>
                                            </div>
                                            
                                            <div id="sshPasswordAuth" className="auth-fields" style={{ display: sshAuthType === 'password' ? 'contents' : 'none' }}>
                                                <div className="field-name">Password <span className="text-red">*</span></div>
                                                <div className="field-input">
                                                    <input 
                                                        type="password" 
                                                        className="form-control" 
                                                        required
                                                        value={sshPassword}
                                                        onChange={(e) => setSshPassword(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div id="sshKeyAuth" className="auth-fields" style={{ display: sshAuthType === 'privateKey' ? 'contents' : 'none' }}>
                                                <div className="field-name">Private Key Path</div>
                                                <div className="field-input">
                                                    <div className="file-input-group">
                                                        <input 
                                                            type="text" 
                                                            className="form-control" 
                                                            readOnly
                                                            value={privateKeyPath}
                                                        />
                                                        <button 
                                                            type="button" 
                                                            className="btn-action"
                                                            onClick={() => handleBrowseFile('privateKey')}
                                                        >
                                                            Choose
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="field-name">Passphrase</div>
                                                <div className="field-input">
                                                    <input 
                                                        type="password" 
                                                        className="form-control"
                                                        value={passphrase}
                                                        onChange={(e) => setPassphrase(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div id="sshNativeAuth" className="auth-fields" style={{ display: sshAuthType === 'native' ? 'contents' : 'none' }}>
                                                <div className="field-name">Waiting Time</div>
                                                <div className="field-input">
                                                    <input 
                                                        type="number" 
                                                        className="form-control"
                                                        placeholder="Waiting time for ssh command"
                                                        value={waitingTime}
                                                        onChange={(e) => setWaitingTime(parseInt(e.target.value) || 5000)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="form-actions">
                            <button 
                                type="button" 
                                className="btn-action"
                                onClick={handleTestConnection}
                            >
                                Test Connection
                            </button>
                            <button 
                                type="button" 
                                className="btn-action"
                                onClick={handleSaveConnection}
                            >
                                Connect
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Status Message */}
                {status && (
                    <div className={`status-message status-${status.type}`}>
                        {status.message}
                    </div>
                )}
            </div>
        </div>
    );
};
