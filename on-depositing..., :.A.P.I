diff --git a/.devcontaREADME.MD/README.md b/BOTUTE
similarity index 100%
rename from .devcontaREADME.MD/README.md
rename to BOTUTEFrom 0aa6374fc973141de59ff98e3c4d812e3b92625f Mon Sep 17 00:00:00 2001
From: "ZACHRY T WOODzachryiixixiiwood@gmail.com"
 <109656750+zakwarlord7@users.noreply.github.com>
Date: Sun, 27 Nov 2022 22:29:02 -0600
Subject: [PATCH] bitore.sig

---
 .devcontaREADME.MD/README.md => BOTUTE | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
 rename .devcontaREADME.MD/README.md => BOTUTE (100%)

diff --git a/.devcontaREADME.MD/README.md b/BOTUTE
similarity index 100%
rename from .devcontaREADME.MD/README.md
rename to BOTUTESON

{
  "type": "ach",
  "amount": 1000,
  "direction": "credit",
  "currency": "USD",
  "originating_account_id": "<Internal Account ID>",
  "receiving_account_id": "<External Account ID>",
  "metadata": {
    "User ID": "123"
  }
}
Skip to content Visual Studio Code
Docs
Updates
Blog
API
Extensions
FAQ
Learn
Search Docs
Download VS CodeDownload
Version 1.73 is now available! Read about the new features and fixes from October.

Dismiss this update
Overview
SETUP
GET STARTED
USER GUIDE
SOURCE CONTROL
TERMINAL
LANGUAGES
NODE.JS / JAVASCRIPT
TYPESCRIPT
PYTHON
JAVA
C++
DOCKER
DATA SCIENCE
AZURE
REMOTE
DEV CONTAINERS
Thanks for downloading VS Code for Linux!
Download not starting? Try this direct download link.
Please take a few seconds and help us improve ... click to take survey.

Getting Started
Visual Studio Code is a lightweight but powerful source code editor which runs on your desktop and is available for Windows, macOS and Linux. It comes with built-in support for JavaScript, TypeScript and Node.js and has a rich ecosystem of extensions for other languages and runtimes (such as C++, C#, Java, Python, PHP, Go, .NET). Begin your journey with VS Code with these introductory videos.

Visual Studio Code in Action
Intelligent Code Completion
Code smarter with IntelliSense - completions for variables, methods, and imported modules.
    
Top Extensions
Enable additional languages, themes, debuggers, commands, and more. VS Code's growing community shares their secret sauce to improve your workflow.

Python
Python
70.7M
ms-python
IntelliSense (Pylance), Linting, Debugging (multi-threaded, remote), Jupyter Notebooks, code formatting, refactoring, unit tests, and more.
Jupyter
Jupyter
51.7M
ms-toolsai
Jupyter notebook support, interactive programming and computing that supports Intellisense, debugging and more.
Pylance
Pylance
43.8M
ms-python
A performant, feature-rich language server for Python in VS Code
C/C++
C/C++
39.4M
ms-vscode
C/C++ IntelliSense, debugging, and code browsing.
Jupyter Keymap
Jupyter Keymap
34.0M
ms-toolsai
Jupyter keymaps for notebooks
Jupyter Notebook Renderers
Jupyter Notebook Renderers
32.3M
ms-toolsai
Renderers for Jupyter Notebooks (with plotly, vega, gif, png, svg, jpeg and other such outputs)
Live Server
Live Server
28.3M
ritwickdey
Launch a development local Server with live reload feature for static & dynamic pages
Prettier - Code formatter
Prettier - Code formatter
26.7M
esbenp
Code formatter using prettier
See more in the Marketplace

First Steps
To get the most out of Visual Studio Code, start by reviewing a few introductory topics:

Intro Videos - Begin your journey with VS Code through these introductory videos.

Setup - Install VS Code for your platform and configure the tool set for your development needs.

User Interface - Introduction to the basic UI, commands, and features of the VS Code editor.

Settings - Customize VS Code for how you like to work.

Languages - Learn about VS Code's support for your favorite programming languages.

Node.js - This tutorial gets you quickly running and debugging a Node.js web app.

Tips and Tricks - Jump right in with Tips and Tricks to become a VS Code power user.

Azure - VS Code is great for deploying your web applications to the cloud.

Extension API - Learn how to write a VS Code extension.

Why VS Code? - Read about the design philosophy and architecture of VS Code.

Keyboard Shortcuts
Increase your productivity with VS Code's keyboard shortcuts.

Keyboard Shortcut Reference Sheet - Learn the commonly used keyboard shortcuts.

Keymap Extensions - Change VS Code's keyboard shortcuts to match another editor.

Customize Keyboard Shortcuts - Modify the default keyboard shortcuts.

Downloads
Download VS Code - Quickly find the appropriate install for your platform (Windows, macOS and Linux)

Privacy
By default, VS Code auto-updates to new versions, and collects usage data and crash report information. You may opt out of these defaults by disabling them as instructed below:

How do I disable auto update?

How do I disable crash reporting?

How do I disable usage reporting?

Was this documentation helpful?
Yes, this page was helpfulNo, this page was not helpful
GETTING STARTED
VS Code in Action
Top Extensions
First Steps
Keyboard Shortcuts
Downloads
Privacy
TwitterTweet this link
RSSSubscribe
StackoverflowAsk questions
TwitterFollow @code
GitHubRequest features
IssuesReport issues
YouTubeWatch videos
Hello from Seattle. Follow @code Support Privacy Terms of Use License 
Microsoft homepage© 2022 MicrosoftJump to Content
Modern Treasury
Product
Pricing
Company
Journal
Changelog
Support
Log in
Sign up
Guides
API Reference

Search
CTRL-K
JUMP TO
CTRL-/
MODERN TREASURY API
Getting Started
TOPICS
Authentication
Development
API Libraries & SDKs
Status Codes
Errors
Metadata
Idempotent Requests
Rate Limits

Pagination
Timestamps
Postman

Banking Fundamentals
PAYMENTS

Payment Orders

Expected Payments

Line Items

Returns

Paper Items

Incoming Payment Details

Reversals
Payment References
COUNTERPARTIES

Counterparties
BANK ACCOUNTS

Internal Accounts

Virtual Accounts

External Accounts

Routing Details

Account Details

Contact Details

Balance Reports
Balances

Connections
RECONCILIATION

Transactions

Transaction Line Items
LEDGERS

Ledgers

Ledger Accounts

Ledger Transactions

Ledger Entries

Ledger Account Categories
COMPLIANCE

User Onboardings
Create User Onboarding
POST
List User Onboardings
GET
Get User Onboarding
GET
Update User Onboarding
PATCH

Decisions

Cases
DEVELOPERS

API Keys

Events

Webhook Events

Webhook Endpoints
WEBHOOKS
Overview
Balance Report Webhooks
Expected Payment Webhooks
Paper Item Webhooks
Payment Order Webhooks
Return Webhooks
Reversal Webhooks
Transaction Webhooks
External Account Webhooks
Ledger Transaction Webhooks
Incoming Payment Detail Webhooks
User Onboarding Webhooks
Decision Webhooks
ADDITIONAL RESOURCES
Addresses

Documents
VALIDATION ENDPOINTS

Routing Numbers
SIMULATION ENDPOINTS

Incoming Payment Detail
User Onboardings
A User Onboarding stores information that a user enters during the hosted onboarding flow. When a User Onboarding form is completed by a user, downstream actions like creating a Counterparty and running compliance and fraud checks can occur.

Related Guides: Onboarding Users.

Attribute	Description
id
string	Unique identifier for the User Onboarding session. This id is used to start the embedded onboarding flow.
live_mode
boolean	This field will be true if this object exists in the live environment or false if it exists in the test environment.
metadata
jsonb	Additional data represented as key-value pairs. Both the key and value must be strings.
party_type
string	The party type of the end user. One of individual, business. Currently, KYC checks can only be done for individuals.
status
string	The current status of the User Onboarding session.

pending: The user has not filled out the form.
processing: The user's compliance decision is being processed.
approved: The user has been approved.
denied: The user has been denied.
needs_approval: The user needs manual approval.
expired: The User Onboarding session has been expired before being completed by the user.
verified_email
string	Verified email of the end user. This field is compared with the email address entered by the user, and is an input to KYC checks.
verified_phone
string	Verified phone number of the end user. This field is compared with the phone number entered by the user, and is an input to KYC checks.
counterparty_id
string	The ID of the associated counterparty. If this field is not provided, it will be updated if the User Onboarding is approved.
external_account_id
string	The ID of the associated external account. This will be updated if the User Onboarding is approved.
data
jsonb	Prefill the user onboarding form with known information.
User Onboarding example

{
  "id": "e640a26e-4289-4799-b991-e5a136b94428",
  "object": "user_onboarding",
  "live_mode": true,
  "metadata": {},
  "party_type": "individual",
  "status": "approved",
  "counterparty_id": "0e7f73bd-d449-4a30-8f52-6322bed44e8e",
  "external_account_id": "4c95964e-c9d4-4102-9183-2c8ae39e2c1d",
  "decision_id": "08d9b87d-67a2-4234-a6d0-e8fec11ebb4f",
  "created_at": "2022-05-16T05:14:02Z",
  "updated_at": "2022-05-16T05:14:02Z"
}
Updated about 2 months ago

Remove Ledger Account Category from Category
Create User Onboarding
Did this page help you?
© Modern Treasury Corp.
Privacy
Terms of Service
