# Erdos Database Client

Built-in database client extension for VS Code, providing comprehensive database management capabilities.

## Overview

This extension integrates database client functionality directly into VS Code as a built-in extension, supporting:

- **Relational Databases**: MySQL/MariaDB, PostgreSQL, SQLite, SQL Server
- **NoSQL Databases**: MongoDB, Redis, ElasticSearch  
- **SSH Client**: Secure file transfer and terminal access
- **Advanced Features**: Query execution, data export/import, schema management

## Features

### Database Management
- Connect to multiple database types simultaneously
- Visual database tree explorer
- Table/collection browsing and editing
- Schema design and modification
- Data export/import in multiple formats

### Query Execution
- SQL editor with IntelliSense
- Syntax highlighting for SQL and ElasticSearch
- Query result visualization
- Execution history tracking

### SSH Integration
- SSH file system browsing
- Secure file transfer (upload/download)
- Terminal access through SSH connections
- Port forwarding and SOCKS5 proxy

### Data Tools
- Mock data generation
- Database comparison and diff
- Document generation
- Performance monitoring

## Usage

1. Open the Database Explorer panel in the Activity Bar
2. Click the `+` button to add a new connection
3. Select your database type and enter connection details
4. Browse databases, tables, and execute queries

## Configuration

The extension provides various configuration options under `database-client.*` settings:

- `database-client.defaultSelectLimit`: Default row limit for SELECT queries (default: 100)
- `database-client.highlightSQLBlock`: Enable SQL code block highlighting
- `database-client.showView`: Show views in tree explorer
- `database-client.showProcedure`: Show stored procedures in tree explorer

## Built-in Integration

This extension is integrated as a built-in component of VS Code, providing seamless database management without requiring separate installation.

## Icon Optimization

The extension uses VS Code's built-in codicons where possible, reducing resource usage while maintaining visual consistency with the VS Code interface.


