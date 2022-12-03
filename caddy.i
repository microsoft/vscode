 '*''*'**'Required''/
'module.exports = class FullJsonStreamReporter extends BaseRunner {
	constructor(runner, options) {
		super(runner, options);
		const total = runner.total;
		runner.once(EVENT_RUN_BEGIN, () => writeEvent(['start', { total }]));
		runner.once(EVENT_RUN_END, () => writeEvent(['end', this.stats]));
		runner.on(EVENT_TEST_BEGIN, test => writeEvent(['testStart', clean(test)]));
		runner.on(EVENT_TEST_PASS, test => writeEvent(['pass', clean(test)]));
		runner.on(EVENT_TEST_FAIL, (test, err) => {
			test = clean(test);
			test.actual = err.actual;
			test.expected = err.expected;
			test.actualJSON = err.actualJSON;
			test.expectedJSON = err.expectedJSON;
			test.autoupdates :Update Automates :SQH_MRG_MSG :pop-kernal'@MIT4.0/Apache1,0 :message;
		test.Stack-overflow/WORKSFLOW :AxtionsEventListner_Triggers :Actions-on :startys-on LTohhled-on :Automatically ::(['revert':'' '
    revert :jasmine/ivy.yml :
    'require : 'test' 
    BEGIN LIVE.feed.RSS'@HYPERLINK("pnc.com)":, :":, :
		});
	}
};
function writeEvent(event) {
	process.stdout.write(JSON.stringify(event) + '\n');
}
const clean = test => ({
	title: test.title,
	fullTitle: test.fullTitle(),
	duration: test.duration,
	currentRetry: test.currentRetry("**diff --git a/-call/dispatch/WORKSFLOW/worksflows_call-on/dispatch/exit/1/my.sigs/travis.yml b/-call/dispatch/WORKSFLOW/worksflows_call-on/dispatch/exit/1/my.sigs/travis.yml
new file mode 100644
index 000000000..6f8b49232
--- /dev/null
+++ b/-call/dispatch/WORKSFLOW/worksflows_call-on/dispatch/exit/1/my.sigs/travis.yml
@@ -0,0 +1,17 @@
+---
+name: Greetings
+description: Greets users who are first time contributors to the repo
+categories: [Automation, SDLC]
+iconName: octicon smiley
+---
+name: Greetings
+
+on: [pull_request, issues]
+
+jobs:
+  greeting:
+    runs-on: ubuntu-latest
+    steps:
+    - use : action.js'@checkout :Checks-out/setsup :$MAKEFILE/rakefile/GEMS.spec=: $ Obj'=''=' new'='':'":,''  '"': '{'$' '{'{' '('(c')')'.'('r')')'B'I'T'O'R'E'_34173'.1337'' '}'}'":,'"''
+        issue-message: 'Message that will be displayed on users'' first issue'
+        pr-message: 'Message that will be displayed on users'' first pr'
diff --git a/.gitattributes b/.gitattributes
new file mode 100644
index 000000000..176a458f9
--- /dev/null
+++ b/.gitattributes
@@ -0,0 +1 @@
+* text=auto
diff --git a/.github/pull_request_template.md b/.github/pull_request_template.md
index 0138fa5f6..35bfb44bc 100644
--- a/.github/pull_request_template.md
+++ b/.github/pull_request_template.md
@@ -1,19 +1,31 @@
-Thank you for sending in this pull request. Please make sure you take a look at the [contributing file](CONTRIBUTING.md). Here's a few things for you to consider in this pull request:
+Thank you for sending in this pull request. Please make sure you take a look at the [contributing file](https://github.com/actions/starter-workflows/blob/master/CONTRIBUTING.md). Here's a few things for you to consider in this pull request:
 
 - [ ] Include a good description of the workflow.
 - [ ] Links to the language or tool will be nice (unless its really obvious)
 
 In the workflow and properties files:
 
+- [ ] The workflow filename of CI workflows should be the name of the language or platform, in lower case.  Special characters should be removed or replaced with words as appropriate (for example, "dotnet" instead of ".NET").
+
+  The workflow filename of publishing workflows should be the name of the language or platform, in lower case, followed by "-publish".
 - [ ] Includes a matching `ci/properties/*.properties.json` file.
-- [ ] Use title case for the names of workflows and steps, for example "Run tests".
+- [ ] Use sentence case for the names of workflows and steps, for example "Run tests".
 - [ ] The name of CI workflows should only be the name of the language or platform: for example "Go" (not "Go CI" or "Go Build")
 - [ ] Include comments in the workflow for any parts that are not obvious or could use clarification.
-- [ ] CI workflows should run `push`.
-- [ ] Packaging workflows should run on `release` with `types: [created]`.
+- [ ] CI workflows should run on `push` to `branches: [ master ]` and `pull_request` to `branches: [ master ]`.
+
+  Packaging workflows should run on `release` with `types: [ created ]`.
 
 Some general notes:
 
-- [ ] Does not use an Action that isn't in the `actions` organization.
-- [ ] Does not send data to any 3rd party service except for the purposes of installing dependencies.
-- [ ] Does not use a paid service or product.
+- [ ] This workflow must only use actions that are produced by GitHub, [in the `actions` organization](https://github.com/actions), **or**
+
+  This workflow must only use actions that are produced by the language or ecosystem that the workflow supports.  These actions must be [published to the GitHub Marketplace](https://github.com/marketplace?type=actions).  Workflows using these actions must reference the action using the full 40 character hash of the action's commit instead of a tag.  Additionally, workflows must include the following comment at the top of the workflow file:
+    ```
+    # This workflow uses actions that are not certified by GitHub.
+    # They are provided by a third-party and are governed by
+    # separate terms of service, privacy policy, and support
+    # documentation.
+    ```
+- [ ] This workflow must not send data to any 3rd party service except for the purposes of installing dependencies.
+- [ ] This workflow must not use a paid service or product.
diff --git a/.github/workflows/sync_ghes.yaml b/.github/workflows/sync_ghes.yaml
new file mode 100644
index 000000000..54193bd35
--- /dev/null
+++ b/.github/workflows/sync_ghes.yaml
@@ -0,0 +1,32 @@
+name: Sync workflows for GHES
+
+on:
+  push:
+    branches:
+    - master
+
+jobs:
+  sync:
+    runs-on: ubuntu-latest
+    steps:
+    - uses: actions/checkout@v2
+    - run: |
+        git fetch --no-tags --prune --depth=1 origin +refs/heads/*:refs/remotes/origin/*
+        git config user.email "cschleiden@github.com"
+        git config user.name "GitHub Actions"
+    - uses: actions/setup-node@v1
+      with:
+        node-version: '12'
+    - name: Check starter workflows for GHES compat
+      run: |
+        npm ci
+        npx ts-node-script ./index.ts
+      working-directory: ./script/sync-ghes
+    - run: |
+        git add -A
+        if [ -z "$(git status --porcelain)" ]; then
+          echo "No changes to commit"
+        else
+          git commit -m "Updating GHES workflows"
+        fi
+    - run: git push
diff --git a/.github/workflows/validate-data.yaml b/.github/workflows/validate-data.yaml
new file mode 100644
index 000000000..d923d7318
--- /dev/null
+++ b/.github/workflows/validate-data.yaml
@@ -0,0 +1,21 @@
+name: Validate Data
+
+on:
+  push:
+  pull_request:
+
+jobs:
+  sync:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v2
+
+      - uses: actions/setup-node@v1
+        with:
+          node-version: "12"
+
+      - name: Validate workflows
+        run: |
+          npm ci
+          npx ts-node-script ./index.ts
+        working-directory: ./script/validate-data
diff --git a/.gitignore b/.gitignore
new file mode 100644
index 000000000..c5364f299
--- /dev/null
+++ b/.gitignore
@@ -0,0 +1 @@
+script/**/node_modules
\ No newline at end of file
diff --git a/.vscode/launch.json b/.vscode/launch.json
new file mode 100644
index 000000000..a5cc14660
--- /dev/null
+++ b/.vscode/launch.json
@@ -0,0 +1,21 @@
+{
+  // Use IntelliSense to learn about possible attributes.
+  // Hover to view descriptions of existing attributes.
+  // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
+  "version": "0.2.0",
+  "configurations": [
+    {
+      "type": "node",
+      "request": "launch",
+      "name": "Launch Program",
+      "args": ["${workspaceRoot}/script/index.ts"],
+      "runtimeArgs": ["-r", "ts-node/register"],
+      "cwd": "${workspaceRoot}/script",
+			"protocol": "inspector",
+			"internalConsoleOptions": "openOnSessionStart",
+			"env": {
+				"TS_NODE_IGNORE": "false"
+			}
+    }
+  ]
+}
\ No newline at end of file
diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
index 80411383b..f711b7775 100644
--- a/CONTRIBUTING.md
+++ b/CONTRIBUTING.md
@@ -4,11 +4,12 @@
 
 Hi there 👋 We are excited that you want to contribute a new workflow to this repo. By doing this you are helping people get up and running with GitHub Actions and that's cool 😎.
 
-Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](LICENSE.md).
+Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](https://github.com/actions/starter-workflows/blob/master/LICENSE).
 
-Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.
+Please note that this project is released with a [Contributor Code of Conduct](
+https://github.com/actions/.github/blob/master/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
 
-There are few requirements for adding in a new workflow, which we'll need to review before we merge:
+Before merging a new workflow, the following requirements need to be met:
 
 - Should be as simple as is needed for the service.
 - There are many programming languages and tools out there. Right now we don't have a page that allows for a really large number of workflows, so we do have to be a little choosy about what we accept. Less popular tools or languages might not be accepted.
diff --git a/README.md b/README.md
index b1dd935ea..5d81359d3 100644
--- a/README.md
+++ b/README.md
@@ -4,9 +4,11 @@
 
 ## Starter Workflows
 
-<img src="https://d3vv6lp55qjaqc.cloudfront.net/items/353A3p3Y2x3c2t2N0c01/Image%202019-08-27%20at%203.25.07%20PM.png" max-width="75%"/>
+These are the workflow files for helping people get started with GitHub Actions.  They're presented whenever you start to create a new GitHub Actions workflow.
+
+**If you want to get started with GitHub Actions, you can use these starter workflows by clicking the "Actions" tab in the repository where you want to create a workflow.**
 
-These are the workflow files for helping people get started with GitHub Actions. 
+<img src="https://d3vv6lp55qjaqc.cloudfront.net/items/353A3p3Y2x3c2t2N0c01/Image%202019-08-27%20at%203.25.07%20PM.png" max-width="75%"/>
 
 **Directory structure:**
 * [ci](ci): solutions for Continuous Integration
diff --git a/automation/greetings.yml b/automation/greetings.yml
deleted file mode 100644
index 28ee6b2f1..000000000
--- a/automation/greetings.yml
+++ /dev/null
@@ -1,13 +0,0 @@
-name: Greetings
-
-on: [pull_request, issues]
-
-jobs:
-  greeting:
-    runs-on: ubuntu-latest
-    steps:
-    - uses: actions/first-interaction@v1
-      with:
-        repo-token: ${{ secrets.GITHUB_TOKEN }}
-        issue-message: 'Message that will be displayed on users'' first issue'
-        pr-message: 'Message that will be displayed on users'' first pr'
diff --git a/automation/label.yml b/automation/label.yml
index e90b599b9..98a683c3f 100644
--- a/automation/label.yml
+++ b/automation/label.yml
@@ -1,3 +1,9 @@
+---
+name: Labeler
+description: Labels pull requests based on the files changed
+categories: [Automation, SDLC]
+iconName: octicon tag
+---
 # This workflow will triage pull requests and apply a label based on the
 # paths that are modified in the pull request.
 #
diff --git a/automation/properties/greetings.properties.json b/automation/properties/greetings.properties.json
deleted file mode 100644
index 743afe386..000000000
--- a/automation/properties/greetings.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Greetings",
-    "description": "Greets users who are first time contributors to the repo",
-    "iconName": "octicon smiley",
-    "categories": ["Automation", "SDLC"]
-}
diff --git a/automation/properties/label.properties.json b/automation/properties/label.properties.json
deleted file mode 100644
index 87a00c885..000000000
--- a/automation/properties/label.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Labeler",
-    "description": "Labels pull requests based on the files changed",
-    "iconName": "octicon tag",
-    "categories": ["Automation", "SDLC"]
-}
diff --git a/automation/properties/stale.properties.json b/automation/properties/stale.properties.json
deleted file mode 100644
index c54e27db3..000000000
--- a/automation/properties/stale.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Stale",
-    "description": "Checks for stale issues and pull requests",
-    "iconName": "octicon clock",
-    "categories": ["Automation", "SDLC"]
-}
diff --git a/automation/stale.yml b/automation/stale.yml
index 7bbc0505b..71d57d82b 100644
--- a/automation/stale.yml
+++ b/automation/stale.yml
@@ -1,3 +1,9 @@
+---
+name: Stale
+description: Checks for stale issues and pull requests
+categories: [Automation, SDLC]
+iconName: octicon clock
+---
 name: Mark stale issues and pull requests
 
 on:
diff --git a/ci/android.yml b/ci/android.yml
index 23f10f1f4..0c15a6db8 100644
--- a/ci/android.yml
+++ b/ci/android.yml
@@ -1,17 +1,27 @@
-name: Android CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: set up JDK 1.8
-      uses: actions/setup-java@v1
-      with:
-        java-version: 1.8
-    - name: Build with Gradle
-      run: ./gradlew build
+---
+name: Android CI
+description: Build an Android project with Gradle.
+categories: [Java, Mobile]
+iconName: android
+---
+name: Android CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+    - name: Build with Gradle
+      run: ./gradlew build
diff --git a/ci/ant.yml b/ci/ant.yml
index d95d6b4db..20d72f182 100644
--- a/ci/ant.yml
+++ b/ci/ant.yml
@@ -1,17 +1,30 @@
-name: Java CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up JDK 1.8
-      uses: actions/setup-java@v1
-      with:
-        java-version: 1.8
-    - name: Build with Ant
-      run: ant -noinput -buildfile build.xml
+---
+name: Java with Ant
+description: Build and test a Java project with Apache Ant.
+categories: [Ant, Java]
+iconName: ant
+---
+# This workflow will build a Java project with Ant
+# For more information see: https://help.github.com/actions/language-and-framework-guides/building-and-testing-java-with-ant
+
+name: Java CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+    - name: Build with Ant
+      run: ant -noinput -buildfile build.xml
diff --git a/ci/aws.yml b/ci/aws.yml
new file mode 100644
index 000000000..9cf764d2f
--- /dev/null
+++ b/ci/aws.yml
@@ -0,0 +1,86 @@
+---
+name: Deploy to Amazon ECS
+description: Deploy a container to an Amazon ECS service powered by AWS Fargate or Amazon EC2.
+categories: []
+iconName: aws
+---
+# This workflow will build and push a new container image to Amazon ECR,
+# and then will deploy a new task definition to Amazon ECS, when a release is created
+#
+# To use this workflow, you will need to complete the following set-up steps:
+#
+# 1. Create an ECR repository to store your images.
+#    For example: `aws ecr create-repository --repository-name my-ecr-repo --region us-east-2`.
+#    Replace the value of `ECR_REPOSITORY` in the workflow below with your repository's name.
+#    Replace the value of `aws-region` in the workflow below with your repository's region.
+#
+# 2. Create an ECS task definition, an ECS cluster, and an ECS service.
+#    For example, follow the Getting Started guide on the ECS console:
+#      https://us-east-2.console.aws.amazon.com/ecs/home?region=us-east-2#/firstRun
+#    Replace the values for `service` and `cluster` in the workflow below with your service and cluster names.
+#
+# 3. Store your ECS task definition as a JSON file in your repository.
+#    The format should follow the output of `aws ecs register-task-definition --generate-cli-skeleton`.
+#    Replace the value of `task-definition` in the workflow below with your JSON file's name.
+#    Replace the value of `container-name` in the workflow below with the name of the container
+#    in the `containerDefinitions` section of the task definition.
+#
+# 4. Store an IAM user access key in GitHub Actions secrets named `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
+#    See the documentation for each action used below for the recommended IAM policies for this IAM user,
+#    and best practices on handling the access key credentials.
+
+on:
+  release:
+    types: [created]
+
+name: Deploy to Amazon ECS
+
+jobs:
+  deploy:
+    name: Deploy
+    runs-on: ubuntu-latest
+
+    steps:
+    - name: Checkout
+      uses: actions/checkout@v2
+
+    - name: Configure AWS credentials
+      uses: aws-actions/configure-aws-credentials@v1
+      with:
+        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
+        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
+        aws-region: us-east-2
+
+    - name: Login to Amazon ECR
+      id: login-ecr
+      uses: aws-actions/amazon-ecr-login@v1
+
+    - name: Build, tag, and push image to Amazon ECR
+      id: build-image
+      env:
+        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
+        ECR_REPOSITORY: my-ecr-repo
+        IMAGE_TAG: ${{ github.sha }}
+      run: |
+        # Build a docker container and
+        # push it to ECR so that it can
+        # be deployed to ECS.
+        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
+        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
+        echo "::set-output name=image::$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
+
+    - name: Fill in the new image ID in the Amazon ECS task definition
+      id: task-def
+      uses: aws-actions/amazon-ecs-render-task-definition@v1
+      with:
+        task-definition: task-definition.json
+        container-name: sample-app
+        image: ${{ steps.build-image.outputs.image }}
+
+    - name: Deploy Amazon ECS task definition
+      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
+      with:
+        task-definition: ${{ steps.task-def.outputs.task-definition }}
+        service: sample-app-service
+        cluster: default
+        wait-for-service-stability: true
\ No newline at end of file
diff --git a/ci/azure.yml b/ci/azure.yml
new file mode 100644
index 000000000..011fa02af
--- /dev/null
+++ b/ci/azure.yml
@@ -0,0 +1,52 @@
+---
+name: Deploy Node.js to Azure Web App
+description: Build a Node.js project and deploy it to an Azure Web App.
+categories: []
+iconName: azure
+---
+# This workflow will build and push a node.js application to an Azure Web App when a release is created.
+#
+# This workflow assumes you have already created the target Azure App Service web app.
+# For instructions see https://docs.microsoft.com/azure/app-service/app-service-plan-manage#create-an-app-service-plan
+#
+# To configure this workflow:
+#
+# 1. Set up a secret in your repository named AZURE_WEBAPP_PUBLISH_PROFILE with the value of your Azure publish profile.
+#    For instructions on obtaining the publish profile see: https://docs.microsoft.com/azure/app-service/deploy-github-actions#configure-the-github-secret
+#
+# 2. Change the values for the AZURE_WEBAPP_NAME, AZURE_WEBAPP_PACKAGE_PATH and NODE_VERSION environment variables  (below).
+#
+# For more information on GitHub Actions for Azure, refer to https://github.com/Azure/Actions
+# For more samples to get started with GitHub Action workflows to deploy to Azure, refer to https://github.com/Azure/actions-workflow-samples
+on:
+  release:
+    types: [created]
+
+env:
+  AZURE_WEBAPP_NAME: your-app-name    # set this to your application's name
+  AZURE_WEBAPP_PACKAGE_PATH: '.'      # set this to the path to your web app project, defaults to the repository root
+  NODE_VERSION: '10.x'                # set this to the node version to use
+
+jobs:
+  build-and-deploy:
+    name: Build and Deploy
+    runs-on: ubuntu-latest
+    steps:
+    - uses: actions/checkout@v2
+    - name: Use Node.js ${{ env.NODE_VERSION }}
+      uses: actions/setup-node@v1
+      with:
+        node-version: ${{ env.NODE_VERSION }}
+    - name: npm install, build, and test
+      run: |
+        # Build and test the project, then
+        # deploy to Azure Web App.
+        npm install
+        npm run build --if-present
+        npm run test --if-present
+    - name: 'Deploy to Azure WebApp'
+      uses: azure/webapps-deploy@v2
+      with:
+        app-name: ${{ env.AZURE_WEBAPP_NAME }}
+        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
+        package: ${{ env.AZURE_WEBAPP_PACKAGE_PATH }}
diff --git a/ci/blank.yml b/ci/blank.yml
index 6bee778b1..8108e2182 100644
--- a/ci/blank.yml
+++ b/ci/blank.yml
@@ -1,17 +1,39 @@
-name: CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Run a one-line script
-      run: echo Hello, world!
-    - name: Run a multi-line script
-      run: |
-        echo Add other actions to build,
-        echo test, and deploy your project.
+---
+name: Simple workflow
+description: Start with a file with the minimum necessary structure.
+categories: []
+iconName: blank
+---
+# This is a basic workflow to help you get started with Actions
+
+name: CI
+
+# Controls when the action will run. Triggers the workflow on push or pull request
+# events but only for the master branch
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+# A workflow run is made up of one or more jobs that can run sequentially or in parallel
+jobs:
+  # This workflow contains a single job called "build"
+  build:
+    # The type of runner that the job will run on
+    runs-on: ubuntu-latest
+
+    # Steps represent a sequence of tasks that will be executed as part of the job
+    steps:
+    # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
+    - uses: actions/checkout@v2
+
+    # Runs a single command using the runners shell
+    - name: Run a one-line script
+      run: echo Hello, world!
+
+    # Runs a set of commands using the runners shell
+    - name: Run a multi-line script
+      run: |
+        echo Add other actions to build,
+        echo test, and deploy your project.
diff --git a/ci/c-cpp.yml b/ci/c-cpp.yml
index 2ec660636..aa9b9638b 100644
--- a/ci/c-cpp.yml
+++ b/ci/c-cpp.yml
@@ -1,19 +1,29 @@
-name: C/C++ CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-    
-    steps:
-    - uses: actions/checkout@v1
-    - name: configure
-      run: ./configure
-    - name: make
-      run: make
-    - name: make check
-      run: make check
-    - name: make distcheck
-      run: make distcheck
+---
+name: C/C++ with Make
+description: Build and test a C/C++ project using Make.
+categories: [C, C++]
+iconName: c-cpp
+---
+name: C/C++ CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: configure
+      run: ./configure
+    - name: make
+      run: make
+    - name: make check
+      run: make check
+    - name: make distcheck
+      run: make distcheck
diff --git a/ci/clojure.yml b/ci/clojure.yml
index 7932491c5..367511c45 100644
--- a/ci/clojure.yml
+++ b/ci/clojure.yml
@@ -1,15 +1,25 @@
-name: Clojure CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Install dependencies
-      run: lein deps
-    - name: Run tests
-      run: lein test
+---
+name: Clojure
+description: Build and test a Clojure project with Leiningen.
+categories: [Clojure, Java]
+iconName: clojure
+---
+name: Clojure CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Install dependencies
+      run: lein deps
+    - name: Run tests
+      run: lein test
diff --git a/ci/crystal.yml b/ci/crystal.yml
index 3f937ebb1..b98715836 100644
--- a/ci/crystal.yml
+++ b/ci/crystal.yml
@@ -1,18 +1,28 @@
-name: Crystal CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    container:
-      image: crystallang/crystal
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Install dependencies
-      run: shards install
-    - name: Run tests
-      run: crystal spec
+---
+name: Crystal
+description: Build and test a Crystal project.
+categories: [Crystal]
+iconName: crystal
+---
+name: Crystal CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    container:
+      image: crystallang/crystal
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Install dependencies
+      run: shards install
+    - name: Run tests
+      run: crystal spec
diff --git a/ci/dart.yml b/ci/dart.yml
index 2b99c6473..8f79c28cb 100644
--- a/ci/dart.yml
+++ b/ci/dart.yml
@@ -1,18 +1,28 @@
-name: Dart CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    container:
-      image:  google/dart:latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Install dependencies
-      run: pub get
-    - name: Run tests
-      run: pub run test
+---
+name: Dart
+description: Build and test a Dart project with Pub.
+categories: [Dart]
+iconName: dart
+---
+name: Dart CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    container:
+      image:  google/dart:latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Install dependencies
+      run: pub get
+    - name: Run tests
+      run: pub run test
diff --git a/ci/django.yml b/ci/django.yml
new file mode 100644
index 000000000..a81b74ef6
--- /dev/null
+++ b/ci/django.yml
@@ -0,0 +1,36 @@
+---
+name: Django
+description: Build and Test a Django Project
+categories: [Python, Django]
+iconName: django
+---
+name: Django CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+    strategy:
+      max-parallel: 4
+      matrix:
+        python-version: [3.6, 3.7, 3.8]
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up Python ${{ matrix.python-version }}
+      uses: actions/setup-python@v1
+      with:
+        python-version: ${{ matrix.python-version }}
+    - name: Install Dependencies
+      run: |
+        python -m pip install --upgrade pip
+        pip install -r requirements.txt
+    - name: Run Tests
+      run: |
+        python manage.py test
diff --git a/ci/docker-image.yml b/ci/docker-image.yml
index d0e70b827..f1053c883 100644
--- a/ci/docker-image.yml
+++ b/ci/docker-image.yml
@@ -1,14 +1,24 @@
-name: Docker Image CI
-
-on: [push]
-
-jobs:
-
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Build the Docker image
-      run: docker build . --file Dockerfile --tag my-image-name:$(date +%s)
+---
+name: Docker image
+description: Build a Docker image to deploy, run, or push to a registry.
+categories: [Dockerfile]
+iconName: docker
+---
+name: Docker Image CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Build the Docker image
+      run: docker build . --file Dockerfile --tag my-image-name:$(date +%s)
diff --git a/ci/docker-publish.yml b/ci/docker-publish.yml
new file mode 100644
index 000000000..a039d28cb
--- /dev/null
+++ b/ci/docker-publish.yml
@@ -0,0 +1,82 @@
+---
+name: Publish Docker Container
+description: Build, test and push Docker image to GitHub Packages.
+categories: [Dockerfile]
+iconName: docker
+---
+name: Docker
+
+on:
+  push:
+    # Publish `master` as Docker `latest` image.
+    branches:
+      - master
+
+    # Publish `v1.2.3` tags as releases.
+    tags:
+      - v*
+
+  # Run tests for any PRs.
+  pull_request:
+
+env:
+  # TODO: Change variable to your image's name.
+  IMAGE_NAME: image
+
+jobs:
+  # Run tests.
+  # See also https://docs.docker.com/docker-hub/builds/automated-testing/
+  test:
+    runs-on: ubuntu-latest
+
+    steps:
+      - uses: actions/checkout@v2
+
+      - name: Run tests
+        run: |
+          if [ -f docker-compose.test.yml ]; then
+            docker-compose --file docker-compose.test.yml build
+            docker-compose --file docker-compose.test.yml run sut
+          else
+            docker build . --file Dockerfile
+          fi
+
+  # Push image to GitHub Packages.
+  # See also https://docs.docker.com/docker-hub/builds/
+  push:
+    # Ensure test job passes before pushing image.
+    needs: test
+
+    runs-on: ubuntu-latest
+    if: github.event_name == 'push'
+
+    steps:
+      - uses: actions/checkout@v2
+
+      - name: Build image
+        run: docker build . --file Dockerfile --tag $IMAGE_NAME
+
+      - name: Log into registry
+        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login docker.pkg.github.com -u ${{ github.actor }} --password-stdin
+
+      - name: Push image
+        run: |
+          IMAGE_ID=docker.pkg.github.com/${{ github.repository }}/$IMAGE_NAME
+          
+          # Change all uppercase to lowercase
+          IMAGE_ID=$(echo $IMAGE_ID | tr '[A-Z]' '[a-z]')
+
+          # Strip git ref prefix from version
+          VERSION=$(echo "${{ github.ref }}" | sed -e 's,.*/\(.*\),\1,')
+
+          # Strip "v" prefix from tag name
+          [[ "${{ github.ref }}" == "refs/tags/"* ]] && VERSION=$(echo $VERSION | sed -e 's/^v//')
+
+          # Use Docker `latest` tag convention
+          [ "$VERSION" == "master" ] && VERSION=latest
+
+          echo IMAGE_ID=$IMAGE_ID
+          echo VERSION=$VERSION
+
+          docker tag $IMAGE_NAME $IMAGE_ID:$VERSION
+          docker push $IMAGE_ID:$VERSION
diff --git a/ci/dotnet-core.yml b/ci/dotnet-core.yml
index e04df52ac..a42e8382a 100644
--- a/ci/dotnet-core.yml
+++ b/ci/dotnet-core.yml
@@ -1,17 +1,31 @@
-name: .NET Core
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Setup .NET Core
-      uses: actions/setup-dotnet@v1
-      with:
-        dotnet-version: 2.2.108
-    - name: Build with dotnet
-      run: dotnet build --configuration Release
+---
+name: .NET Core
+description: Build and test a .NET Core or ASP.NET Core project.
+categories: [C#, F#, Visual Basic, ASP, ASP.NET, .NET]
+iconName: dotnetcore
+---
+name: .NET Core
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Setup .NET Core
+      uses: actions/setup-dotnet@v1
+      with:
+        dotnet-version: 3.1.101
+    - name: Install dependencies
+      run: dotnet restore
+    - name: Build
+      run: dotnet build --configuration Release --no-restore
+    - name: Test
+      run: dotnet test --no-restore --verbosity normal
diff --git a/ci/elixir.yml b/ci/elixir.yml
index eed27bc28..422f434a1 100644
--- a/ci/elixir.yml
+++ b/ci/elixir.yml
@@ -1,21 +1,30 @@
-name: Elixir CI
-
-on: push
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    container:
-      image: elixir:1.9.1-slim
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Install Dependencies
-      run: |
-        mix local.rebar --force
-        mix local.hex --force
-        mix deps.get
-    - name: Run Tests
-      run: mix test
+---
+name: Elixir
+description: Build and test an Elixir project with Mix.
+categories: [Elixir, Erlang]
+iconName: elixir
+---
+name: Elixir CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Setup elixir
+      uses: actions/setup-elixir@v1
+      with:
+        elixir-version: 1.9.4 # Define the elixir version [required]
+        otp-version: 22.2 # Define the OTP version [required]
+    - name: Install Dependencies
+      run: mix deps.get
+    - name: Run Tests
+      run: mix test
diff --git a/ci/erlang.yml b/ci/erlang.yml
index e67464c79..cbd8a6645 100644
--- a/ci/erlang.yml
+++ b/ci/erlang.yml
@@ -1,19 +1,29 @@
-name: Erlang CI
-
-on: [push]
-
-jobs:
-
-  build:
-
-    runs-on: ubuntu-latest
-
-    container:
-      image: erlang:22.0.7
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Compile
-      run: rebar3 compile
-    - name: Run tests
-      run: rebar3 do eunit, ct
+---
+name: Erlang
+description: Build and test an Erlang project with rebar.
+categories: [Erlang]
+iconName: erlang
+---
+name: Erlang CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+
+  build:
+
+    runs-on: ubuntu-latest
+
+    container:
+      image: erlang:22.0.7
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Compile
+      run: rebar3 compile
+    - name: Run tests
+      run: rebar3 do eunit, ct
diff --git a/ci/gem-push.yml b/ci/gem-push.yml
index ff0bfb3d9..cb508e726 100644
--- a/ci/gem-push.yml
+++ b/ci/gem-push.yml
@@ -1,12 +1,16 @@
+---
+name: Ruby Gem
+description: Pushes a Ruby Gem to RubyGems and GitHub Package Registry.
+categories: [Ruby, SDLC]
+iconName: ruby-gems
+---
 name: Ruby Gem
 
 on:
-  pull_request:
-    branches:
-      - master
   push:
-    branches:
-      - master
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
 
 jobs:
   build:
@@ -14,7 +18,7 @@ jobs:
     runs-on: ubuntu-latest
 
     steps:
-    - uses: actions/checkout@master
+    - uses: actions/checkout@v2
     - name: Set up Ruby 2.6
       uses: actions/setup-ruby@v1
       with:
diff --git a/ci/go.yml b/ci/go.yml
index 169022ba3..0d2366368 100644
--- a/ci/go.yml
+++ b/ci/go.yml
@@ -1,28 +1,43 @@
-name: Go
-on: [push]
-jobs:
-
-  build:
-    name: Build
-    runs-on: ubuntu-latest
-    steps:
-
-    - name: Set up Go 1.13
-      uses: actions/setup-go@v1
-      with:
-        go-version: 1.13
-      id: go
-
-    - name: Check out code into the Go module directory
-      uses: actions/checkout@v1
-
-    - name: Get dependencies
-      run: |
-        go get -v -t -d ./...
-        if [ -f Gopkg.toml ]; then
-            curl https://raw.githubusercontent.com/golang/dep/master/install.sh | sh
-            dep ensure
-        fi
-
-    - name: Build
-      run: go build -v .
+---
+name: Go
+description: Build a Go project.
+categories: [Go]
+iconName: go
+---
+name: Go
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+
+  build:
+    name: Build
+    runs-on: ubuntu-latest
+    steps:
+
+    - name: Set up Go 1.x
+      uses: actions/setup-go@v2
+      with:
+        go-version: ^1.13
+      id: go
+
+    - name: Check out code into the Go module directory
+      uses: actions/checkout@v2
+
+    - name: Get dependencies
+      run: |
+        go get -v -t -d ./...
+        if [ -f Gopkg.toml ]; then
+            curl https://raw.githubusercontent.com/golang/dep/master/install.sh | sh
+            dep ensure
+        fi
+
+    - name: Build
+      run: go build -v .
+
+    - name: Test
+      run: go test -v .
diff --git a/ci/google.yml b/ci/google.yml
new file mode 100644
index 000000000..29ae3bbe0
--- /dev/null
+++ b/ci/google.yml
@@ -0,0 +1,81 @@
+---
+name: Build and Deploy to GKE
+description: Build a docker container, publish it to Google Container Registry, and deploy to GKE.
+categories: []
+iconName: googlegke
+---
+# This workflow will build a docker container, publish it to Google Container Registry, and deploy it to GKE when a release is created
+#
+# To configure this workflow:
+#
+# 1. Ensure that your repository contains the necessary configuration for your Google Kubernetes Engine cluster, including deployment.yml, kustomization.yml, service.yml, etc.
+#
+# 2. Set up secrets in your workspace: GKE_PROJECT with the name of the project, GKE_EMAIL with the service account email, GKE_KEY with the Base64 encoded JSON service account key (https://github.com/GoogleCloudPlatform/github-actions/tree/docs/service-account-key/setup-gcloud#inputs).
+#
+# 3. Change the values for the GKE_ZONE, GKE_CLUSTER, IMAGE, REGISTRY_HOSTNAME and DEPLOYMENT_NAME environment variables (below).
+
+name: Build and Deploy to GKE
+
+on:
+  release:
+    types: [created]
+
+# Environment variables available to all jobs and steps in this workflow
+env:
+  GKE_PROJECT: ${{ secrets.GKE_PROJECT }}
+  GKE_EMAIL: ${{ secrets.GKE_EMAIL }}
+  GITHUB_SHA: ${{ github.sha }}
+  GKE_ZONE: us-west1-a
+  GKE_CLUSTER: example-gke-cluster
+  IMAGE: gke-test
+  REGISTRY_HOSTNAME: gcr.io
+  DEPLOYMENT_NAME: gke-test
+
+jobs:
+  setup-build-publish-deploy:
+    name: Setup, Build, Publish, and Deploy
+    runs-on: ubuntu-latest
+    steps:
+
+    - name: Checkout
+      uses: actions/checkout@v2
+
+    # Setup gcloud CLI
+    - uses: GoogleCloudPlatform/github-actions/setup-gcloud@master
+      with:
+        version: '270.0.0'
+        service_account_email: ${{ secrets.GKE_EMAIL }}
+        service_account_key: ${{ secrets.GKE_KEY }}
+
+    # Configure docker to use the gcloud command-line tool as a credential helper
+    - run: |
+        # Set up docker to authenticate
+        # via gcloud command-line tool.
+        gcloud auth configure-docker
+      
+    # Build the Docker image
+    - name: Build
+      run: |        
+        docker build -t "$REGISTRY_HOSTNAME"/"$GKE_PROJECT"/"$IMAGE":"$GITHUB_SHA" \
+          --build-arg GITHUB_SHA="$GITHUB_SHA" \
+          --build-arg GITHUB_REF="$GITHUB_REF" .
+
+    # Push the Docker image to Google Container Registry
+    - name: Publish
+      run: |
+        docker push $REGISTRY_HOSTNAME/$GKE_PROJECT/$IMAGE:$GITHUB_SHA
+        
+    # Set up kustomize
+    - name: Set up Kustomize
+      run: |
+        curl -o kustomize --location https://github.com/kubernetes-sigs/kustomize/releases/download/v3.1.0/kustomize_3.1.0_linux_amd64
+        chmod u+x ./kustomize
+
+    # Deploy the Docker image to the GKE cluster
+    - name: Deploy
+      run: |
+        gcloud container clusters get-credentials $GKE_CLUSTER --zone $GKE_ZONE --project $GKE_PROJECT
+        ./kustomize edit set image $REGISTRY_HOSTNAME/$GKE_PROJECT/$IMAGE:${GITHUB_SHA}
+        ./kustomize build . | kubectl apply -f -
+        kubectl rollout status deployment/$DEPLOYMENT_NAME
+        kubectl get services -o wide
diff --git a/ci/gradle-publish.yml b/ci/gradle-publish.yml
new file mode 100644
index 000000000..12977088d
--- /dev/null
+++ b/ci/gradle-publish.yml
@@ -0,0 +1,39 @@
+---
+name: Publish Java Package with Gradle
+description: Build a Java Package using Gradle and publish to GitHub Packages.
+categories: [Java, Gradle]
+iconName: gradle
+---
+# This workflow will build a package using Gradle and then publish it to GitHub packages when a release is created
+# For more information see: https://github.com/actions/setup-java#publishing-using-gradle
+
+name: Gradle Package
+
+on:
+  release:
+    types: [created]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+        server-id: github # Value of the distributionManagement/repository/id field of the pom.xml
+        settings-path: ${{ github.workspace }} # location for the settings.xml file
+
+    - name: Build with Gradle
+      run: gradle build
+
+    # The USERNAME and TOKEN need to correspond to the credentials environment variables used in
+    # the publishing section of your build.gradle
+    - name: Publish to GitHub Packages
+      run: gradle publish
+      env:
+        USERNAME: ${{ github.actor }}
+        TOKEN: ${{ secrets.GITHUB_TOKEN }}
diff --git a/ci/gradle.yml b/ci/gradle.yml
index 8e4dc5ea3..b0d16c919 100644
--- a/ci/gradle.yml
+++ b/ci/gradle.yml
@@ -1,17 +1,32 @@
-name: Java CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up JDK 1.8
-      uses: actions/setup-java@v1
-      with:
-        java-version: 1.8
-    - name: Build with Gradle
-      run: ./gradlew build
+---
+name: Java with Gradle
+description: Build and test a Java project using a Gradle wrapper script.
+categories: [Java, Gradle]
+iconName: gradle
+---
+# This workflow will build a Java project with Gradle
+# For more information see: https://help.github.com/actions/language-and-framework-guides/building-and-testing-java-with-gradle
+
+name: Java CI with Gradle
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+    - name: Grant execute permission for gradlew
+      run: chmod +x gradlew
+    - name: Build with Gradle
+      run: ./gradlew build
diff --git a/ci/haskell.yml b/ci/haskell.yml
index 2f9a0d1dc..3354cb66e 100644
--- a/ci/haskell.yml
+++ b/ci/haskell.yml
@@ -1,25 +1,46 @@
-name: Haskell CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - uses: actions/setup-haskell@v1
-      with:
-        ghc-version: '8.6.5'
-        cabal-version: '3.0'
-    - name: Install dependencies
-      run: |
-        cabal update
-        cabal install --only-dependencies --enable-tests
-    - name: Build
-      run: |
-        cabal configure --enable-tests
-        cabal build
-    - name: Run tests
-      run: cabal test
+---
+name: Haskell
+description: Build and test a Haskell project with Cabal.
+categories: [Haskell]
+iconName: haskell
+---
+name: Haskell CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - uses: actions/setup-haskell@v1
+      with:
+        ghc-version: '8.8.2'
+        cabal-version: '3.0'
+
+    - name: Cache
+      uses: actions/cache@v1
+      env:
+        cache-name: cache-cabal
+      with:
+        path: ~/.cabal
+        key: ${{ runner.os }}-build-${{ env.cache-name }}-${{ hashFiles('**/*.cabal') }}-${{ hashFiles('**/cabal.project') }}
+        restore-keys: |
+          ${{ runner.os }}-build-${{ env.cache-name }}-
+          ${{ runner.os }}-build-
+          ${{ runner.os }}-
+
+    - name: Install dependencies
+      run: |
+        cabal update
+        cabal build --only-dependencies --enable-tests --enable-benchmarks
+    - name: Build
+      run: cabal build --enable-tests --enable-benchmarks all
+    - name: Run tests
+      run: cabal test all
diff --git a/ci/ibm.yml b/ci/ibm.yml
new file mode 100644
index 000000000..d239dcc75
--- /dev/null
+++ b/ci/ibm.yml
@@ -0,0 +1,80 @@
+---
+name: Build and Deploy to IKS
+description: Build a docker container, publish it to IBM Container Registry, and deploy to IKS.
+categories: []
+iconName: ibm
+---
+# This workflow will build a docker container, publish it to IBM Container Registry, and deploy it to IKS when a release is created
+#
+# To configure this workflow:
+#
+# 1. Ensure that your repository contains a Dockerfile
+# 2. Setup secrets in your repository by going to settings: Create ICR_NAMESPACE and IBM_CLOUD_API_KEY
+# 3. Change the values for the IBM_CLOUD_REGION, REGISTRY_HOSTNAME, IMAGE_NAME, IKS_CLUSTER, DEPLOYMENT_NAME, and PORT
+
+name: Build and Deploy to IKS
+
+on:
+  release:
+    types: [created]
+
+# Environment variables available to all jobs and steps in this workflow
+env:
+  GITHUB_SHA: ${{ github.sha }}
+  IBM_CLOUD_API_KEY: ${{ secrets.IBM_CLOUD_API_KEY }}
+  IBM_CLOUD_REGION: us-south
+  ICR_NAMESPACE: ${{ secrets.ICR_NAMESPACE }}
+  REGISTRY_HOSTNAME: us.icr.io
+  IMAGE_NAME: iks-test
+  IKS_CLUSTER: example-iks-cluster-name-or-id
+  DEPLOYMENT_NAME: iks-test
+  PORT: 5001
+
+jobs:
+  setup-build-publish-deploy:
+    name: Setup, Build, Publish, and Deploy
+    runs-on: ubuntu-latest
+    steps:
+
+    - name: Checkout
+      uses: actions/checkout@v2
+
+    # Download and Install IBM Cloud CLI
+    - name: Install IBM Cloud CLI
+      run: |
+        curl -fsSL https://clis.cloud.ibm.com/install/linux | sh
+        ibmcloud --version
+        ibmcloud config --check-version=false
+        ibmcloud plugin install -f kubernetes-service
+        ibmcloud plugin install -f container-registry
+
+    # Authenticate with IBM Cloud CLI
+    - name: Authenticate with IBM Cloud CLI
+      run: |
+        ibmcloud login --apikey "${IBM_CLOUD_API_KEY}" -r "${IBM_CLOUD_REGION}" -g default
+        ibmcloud cr region-set "${IBM_CLOUD_REGION}"
+        ibmcloud cr login
+
+    # Build the Docker image
+    - name: Build with Docker
+      run: |
+        docker build -t "$REGISTRY_HOSTNAME"/"$ICR_NAMESPACE"/"$IMAGE_NAME":"$GITHUB_SHA" \
+          --build-arg GITHUB_SHA="$GITHUB_SHA" \
+          --build-arg GITHUB_REF="$GITHUB_REF" .
+
+    # Push the image to IBM Container Registry
+    - name: Push the image to ICR
+      run: |
+        docker push $REGISTRY_HOSTNAME/$ICR_NAMESPACE/$IMAGE_NAME:$GITHUB_SHA
+
+    # Deploy the Docker image to the IKS cluster
+    - name: Deploy to IKS
+      run: |
+        ibmcloud ks cluster config --cluster $IKS_CLUSTER
+        kubectl config current-context
+        kubectl create deployment $DEPLOYMENT_NAME --image=$REGISTRY_HOSTNAME/$ICR_NAMESPACE/$IMAGE_NAME:$GITHUB_SHA --dry-run -o yaml > deployment.yaml
+        kubectl apply -f deployment.yaml
+        kubectl rollout status deployment/$DEPLOYMENT_NAME
+        kubectl create service loadbalancer $DEPLOYMENT_NAME --tcp=80:$PORT --dry-run -o yaml > service.yaml
+        kubectl apply -f service.yaml
+        kubectl get services -o wide
diff --git a/ci/jekyll.yml b/ci/jekyll.yml
index 782095829..7e695309c 100644
--- a/ci/jekyll.yml
+++ b/ci/jekyll.yml
@@ -1,16 +1,26 @@
-name: Jekyll site CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Build the site in the jekyll/builder container
-      run: |
-        docker run \
-        -v ${{ github.workspace }}:/srv/jekyll -v ${{ github.workspace }}/_site:/srv/jekyll/_site \
-        jekyll/builder:latest /bin/bash -c "chmod 777 /srv/jekyll && jekyll build --future"
+---
+name: Jekyll
+description: Package a Jekyll site using the jekyll/builder Docker image.
+categories: [HTML]
+iconName: jekyll
+---
+name: Jekyll site CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Build the site in the jekyll/builder container
+      run: |
+        docker run \
+        -v ${{ github.workspace }}:/srv/jekyll -v ${{ github.workspace }}/_site:/srv/jekyll/_site \
+        jekyll/builder:latest /bin/bash -c "chmod 777 /srv/jekyll && jekyll build --future"
diff --git a/ci/laravel.yml b/ci/laravel.yml
index c3841eb52..b7d4e7a6c 100644
--- a/ci/laravel.yml
+++ b/ci/laravel.yml
@@ -1,18 +1,32 @@
+---
+name: Laravel
+description: Test a Laravel project.
+categories: [PHP, Laravel]
+iconName: php
+---
 name: Laravel
 
-on: [push]
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
 
 jobs:
   laravel-tests:
+
     runs-on: ubuntu-latest
+    
     steps:
-    - uses: actions/checkout@v1
+    - uses: actions/checkout@v2
     - name: Copy .env
       run: php -r "file_exists('.env') || copy('.env.example', '.env');"
     - name: Install Dependencies
       run: composer install -q --no-ansi --no-interaction --no-scripts --no-suggest --no-progress --prefer-dist
     - name: Generate key
       run: php artisan key:generate
+    - name: Directory Permissions
+      run: chmod -R 777 storage bootstrap/cache
     - name: Create Database
       run: |
         mkdir -p database
diff --git a/ci/maven-publish.yml b/ci/maven-publish.yml
new file mode 100644
index 000000000..2621d4211
--- /dev/null
+++ b/ci/maven-publish.yml
@@ -0,0 +1,36 @@
+---
+name: Publish Java Package with Maven
+description: Build a Java Package using Maven and publish to GitHub Packages.
+categories: [Java, Maven]
+iconName: maven
+---
+# This workflow will build a package using Maven and then publish it to GitHub packages when a release is created
+# For more information see: https://github.com/actions/setup-java#apache-maven-with-a-settings-path
+
+name: Maven Package
+
+on:
+  release:
+    types: [created]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+        server-id: github # Value of the distributionManagement/repository/id field of the pom.xml
+        settings-path: ${{ github.workspace }} # location for the settings.xml file
+
+    - name: Build with Maven
+      run: mvn -B package --file pom.xml
+
+    - name: Publish to GitHub Packages Apache Maven
+      run: mvn deploy -s $GITHUB_WORKSPACE/settings.xml
+      env:
+        GITHUB_TOKEN: ${{ github.token }}
\ No newline at end of file
diff --git a/ci/maven.yml b/ci/maven.yml
index dbc347f9c..98f00c08f 100644
--- a/ci/maven.yml
+++ b/ci/maven.yml
@@ -1,17 +1,30 @@
-name: Java CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up JDK 1.8
-      uses: actions/setup-java@v1
-      with:
-        java-version: 1.8
-    - name: Build with Maven
-      run: mvn -B package --file pom.xml
+---
+name: Java with Maven
+description: Build and test a Java project with Apache Maven.
+categories: [Java, Maven]
+iconName: maven
+---
+# This workflow will build a Java project with Maven
+# For more information see: https://help.github.com/actions/language-and-framework-guides/building-and-testing-java-with-maven
+
+name: Java CI with Maven
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up JDK 1.8
+      uses: actions/setup-java@v1
+      with:
+        java-version: 1.8
+    - name: Build with Maven
+      run: mvn -B package --file pom.xml
diff --git a/ci/node.js.yml b/ci/node.js.yml
index 94face118..ec556747a 100644
--- a/ci/node.js.yml
+++ b/ci/node.js.yml
@@ -1,26 +1,35 @@
-name: Node CI
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    strategy:
-      matrix:
-        node-version: [8.x, 10.x, 12.x]
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Use Node.js ${{ matrix.node-version }}
-      uses: actions/setup-node@v1
-      with:
-        node-version: ${{ matrix.node-version }}
-    - name: npm install, build, and test
-      run: |
-        npm ci
-        npm run build --if-present
-        npm test
-      env:
-        CI: true
+---
+name: Node.js
+description: Build and test a Node.js project with npm.
+categories: [JavaScript, Node, Npm]
+iconName: nodejs
+---
+# This workflow will do a clean install of node dependencies, build the source code and run tests across different versions of node
+# For more information see: https://help.github.com/actions/language-and-framework-guides/using-nodejs-with-github-actions
+
+name: Node.js CI
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    strategy:
+      matrix:
+        node-version: [10.x, 12.x]
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Use Node.js ${{ matrix.node-version }}
+      uses: actions/setup-node@v1
+      with:
+        node-version: ${{ matrix.node-version }}
+    - run: npm ci
+    - run: npm run build --if-present
+    - run: npm test
diff --git a/ci/npm-publish.yml b/ci/npm-publish.yml
index ed81431b5..0f0c5ba47 100644
--- a/ci/npm-publish.yml
+++ b/ci/npm-publish.yml
@@ -1,3 +1,12 @@
+---
+name: Publish Node.js Package
+description: Publishes a Node.js package to npm and GitHub Packages.
+categories: [JavaScript, SDLC]
+iconName: node-package-transparent
+---
+# This workflow will run tests using node and then publish a package to GitHub Packages when a release is created
+# For more information see: https://help.github.com/actions/language-and-framework-guides/publishing-nodejs-packages
+
 name: Node.js Package
 
 on:
@@ -8,7 +17,7 @@ jobs:
   build:
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/checkout@v1
+      - uses: actions/checkout@v2
       - uses: actions/setup-node@v1
         with:
           node-version: 12
@@ -19,7 +28,7 @@ jobs:
     needs: build
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/checkout@v1
+      - uses: actions/checkout@v2
       - uses: actions/setup-node@v1
         with:
           node-version: 12
@@ -33,12 +42,11 @@ jobs:
     needs: build
     runs-on: ubuntu-latest
     steps:
-      - uses: actions/checkout@v1
+      - uses: actions/checkout@v2
       - uses: actions/setup-node@v1
         with:
           node-version: 12
           registry-url: https://npm.pkg.github.com/
-          scope: '@your-github-username'
       - run: npm ci
       - run: npm publish
         env:
diff --git a/ci/php.yml b/ci/php.yml
index 8e856b81f..90a731065 100644
--- a/ci/php.yml
+++ b/ci/php.yml
@@ -1,6 +1,16 @@
+---
+name: PHP
+description: Build and test a PHP application using Composer
+categories: [PHP, Composer]
+iconName: php
+---
 name: PHP Composer
 
-on: [push]
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
 
 jobs:
   build:
@@ -8,13 +18,13 @@ jobs:
     runs-on: ubuntu-latest
 
     steps:
-    - uses: actions/checkout@v1
+    - uses: actions/checkout@v2
 
     - name: Validate composer.json and composer.lock
       run: composer validate
 
     - name: Install dependencies
-      run: composer install --prefer-dist --no-progress --no-suggest
+      run: composer install --prefer-dist --no-progress
 
     # Add a test script to composer.json, for instance: "test": "vendor/bin/phpunit"
     # Docs: https://getcomposer.org/doc/articles/scripts.md
diff --git a/ci/properties/android.properties.json b/ci/properties/android.properties.json
deleted file mode 100644
index a557fd9a7..000000000
--- a/ci/properties/android.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Android CI",
-    "description": "Build an Android project with Gradle.",
-    "iconName": "android",
-    "categories": ["Java", "Mobile"]
-}
\ No newline at end of file
diff --git a/ci/properties/ant.properties.json b/ci/properties/ant.properties.json
deleted file mode 100644
index 4139b6726..000000000
--- a/ci/properties/ant.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Java with Ant",
-    "description": "Build and test a Java project with Apache Ant.",
-    "iconName": "ant",
-    "categories": ["Ant", "Java"]
-}
\ No newline at end of file
diff --git a/ci/properties/blank.properties.json b/ci/properties/blank.properties.json
deleted file mode 100644
index 927085bc5..000000000
--- a/ci/properties/blank.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Simple workflow",
-    "description": "Start with a file with the minimum necessary structure.",
-    "iconName": "blank",
-    "categories": null
-}
\ No newline at end of file
diff --git a/ci/properties/c-cpp.properties.json b/ci/properties/c-cpp.properties.json
deleted file mode 100644
index 605cd8902..000000000
--- a/ci/properties/c-cpp.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "C/C++ with Make",
-    "description": "Build and test a C/C++ project using Make.",
-    "iconName": "c-cpp",
-    "categories": ["C", "C++"]
-}
\ No newline at end of file
diff --git a/ci/properties/clojure.properties.json b/ci/properties/clojure.properties.json
deleted file mode 100644
index 9d1777266..000000000
--- a/ci/properties/clojure.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Clojure",
-    "description": "Build and test a Clojure project with Leiningen.",
-    "iconName": "clojure",
-    "categories": ["Clojure", "Java"]
-}
\ No newline at end of file
diff --git a/ci/properties/crystal.properties.json b/ci/properties/crystal.properties.json
deleted file mode 100644
index f5edf7ded..000000000
--- a/ci/properties/crystal.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Crystal",
-    "description": "Build and test a Crystal project.",
-    "iconName": "crystal",
-    "categories": ["Crystal"]
-}
\ No newline at end of file
diff --git a/ci/properties/dart.properties.json b/ci/properties/dart.properties.json
deleted file mode 100644
index a0aad8c02..000000000
--- a/ci/properties/dart.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Dart",
-    "description": "Build and test a Dart project with Pub.",
-    "iconName": "dart",
-    "categories": ["Dart"]
-}
\ No newline at end of file
diff --git a/ci/properties/docker-image.properties.json b/ci/properties/docker-image.properties.json
deleted file mode 100644
index 2db2368a7..000000000
--- a/ci/properties/docker-image.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Docker image",
-    "description": "Build a Docker image to deploy, run, or push to a registry.",
-    "iconName": "docker",
-    "categories": ["Dockerfile"]
-}
\ No newline at end of file
diff --git a/ci/properties/dotnet-core.properties.json b/ci/properties/dotnet-core.properties.json
deleted file mode 100644
index d5dc23a86..000000000
--- a/ci/properties/dotnet-core.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": ".NET Core",
-    "description": "Build and test a .NET Core or ASP.NET Core project.",
-    "iconName": "dotnetcore",
-    "categories": ["C#", "F#", "Visual Basic", "ASP", "ASP.NET", ".NET"]
-}
diff --git a/ci/properties/elixir.properties.json b/ci/properties/elixir.properties.json
deleted file mode 100644
index 4b082d71e..000000000
--- a/ci/properties/elixir.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Elixir",
-    "description": "Build and test an Elixir project with Mix.",
-    "iconName": "elixir",
-    "categories": ["Elixir", "Erlang"]
-}
\ No newline at end of file
diff --git a/ci/properties/erlang.properties.json b/ci/properties/erlang.properties.json
deleted file mode 100644
index c728ac241..000000000
--- a/ci/properties/erlang.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Erlang",
-    "description": "Build and test an Erlang project with rebar.",
-    "iconName": "erlang",
-    "categories": ["Erlang"]
-}
\ No newline at end of file
diff --git a/ci/properties/gem-push.properties.json b/ci/properties/gem-push.properties.json
deleted file mode 100644
index c54e7b57d..000000000
--- a/ci/properties/gem-push.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Ruby Gem",
-    "description": "Pushes a Ruby Gem to RubyGems and GitHub Package Registry.",
-    "iconName": "ruby-gems",
-    "categories": ["Ruby", "SDLC"]
-}
diff --git a/ci/properties/go.properties.json b/ci/properties/go.properties.json
deleted file mode 100644
index 339124515..000000000
--- a/ci/properties/go.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Go",
-    "description": "Build a Go project.",
-    "iconName": "go",
-    "categories": ["Go"]
-}
\ No newline at end of file
diff --git a/ci/properties/gradle.properties.json b/ci/properties/gradle.properties.json
deleted file mode 100644
index c58d68ab0..000000000
--- a/ci/properties/gradle.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Gradle",
-    "description": "Build and test a Java project using a Gradle wrapper script.",
-    "iconName": "gradle",
-    "categories": ["Java", "Gradle"]
-}
\ No newline at end of file
diff --git a/ci/properties/haskell.properties.json b/ci/properties/haskell.properties.json
deleted file mode 100644
index ae71a60df..000000000
--- a/ci/properties/haskell.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Haskell",
-    "description": "Build and test a Haskell project with Cabal.",
-    "iconName": "haskell",
-    "categories": ["Haskell"]
-}
\ No newline at end of file
diff --git a/ci/properties/jekyll.properties.json b/ci/properties/jekyll.properties.json
deleted file mode 100644
index c97835a4b..000000000
--- a/ci/properties/jekyll.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Jekyll",
-    "description": "Package a Jekyll site using the jekyll/builder Docker image.",
-    "iconName": "jekyll",
-    "categories": ["HTML"]
-}
\ No newline at end of file
diff --git a/ci/properties/laravel.properties.json b/ci/properties/laravel.properties.json
deleted file mode 100644
index f10a4623a..000000000
--- a/ci/properties/laravel.properties.json
+++ /dev/null
@@ -1,9 +0,0 @@
-{
-    "name": "Laravel",
-    "description": "Test a Laravel project.",
-    "iconName": "php",
-    "categories": [
-        "PHP",
-        "Laravel"
-    ]
-}
\ No newline at end of file
diff --git a/ci/properties/maven.properties.json b/ci/properties/maven.properties.json
deleted file mode 100644
index 1875bdcdc..000000000
--- a/ci/properties/maven.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Maven",
-    "description": "Build and test a Java project with Apache Maven.",
-    "iconName": "maven",
-    "categories": ["Java", "Maven"]
-}
\ No newline at end of file
diff --git a/ci/properties/node.js.properties.json b/ci/properties/node.js.properties.json
deleted file mode 100644
index 99a79bcb8..000000000
--- a/ci/properties/node.js.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Node.js",
-    "description": "Build and test a Node.js project with npm.",
-    "iconName": "nodejs",
-    "categories": ["JavaScript", "Node", "Npm"]
-}
\ No newline at end of file
diff --git a/ci/properties/npm-publish.properties.json b/ci/properties/npm-publish.properties.json
deleted file mode 100644
index 989c262c9..000000000
--- a/ci/properties/npm-publish.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Node.js Package",
-    "description": "Publishes a Node.js package to npm and GitHub Package Registry.",
-    "iconName": "node-package-transparent",
-    "categories": ["JavaScript", "SDLC"]
-}
diff --git a/ci/properties/php.properties.json b/ci/properties/php.properties.json
deleted file mode 100644
index 641e536f2..000000000
--- a/ci/properties/php.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "PHP",
-    "description": "Build and test a PHP application using Composer",
-    "iconName": "php",
-    "categories": ["PHP", "Composer"]
-}
\ No newline at end of file
diff --git a/ci/properties/python-app.properties.json b/ci/properties/python-app.properties.json
deleted file mode 100644
index cdf0330d0..000000000
--- a/ci/properties/python-app.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Python application",
-    "description": "Create and test a Python application.",
-    "iconName": "python",
-    "categories": ["Python"]
-}
\ No newline at end of file
diff --git a/ci/properties/python-package.properties.json b/ci/properties/python-package.properties.json
deleted file mode 100644
index 4b3a8da1f..000000000
--- a/ci/properties/python-package.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Python package",
-    "description": "Create and test a Python package on multiple Python versions.",
-    "iconName": "python",
-    "categories": ["Python"]
-}
\ No newline at end of file
diff --git a/ci/properties/python-publish.properties.json b/ci/properties/python-publish.properties.json
deleted file mode 100644
index 4fd9eceb6..000000000
--- a/ci/properties/python-publish.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Publish Python Package",
-    "description": "Publish a Python Package to PyPI on release.",
-    "iconName": "python",
-    "categories": ["Python"]
-}
diff --git a/ci/properties/ruby.properties.json b/ci/properties/ruby.properties.json
deleted file mode 100644
index df7493126..000000000
--- a/ci/properties/ruby.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Ruby",
-    "description": "Build and test a Ruby project with Rake.",
-    "iconName": "ruby",
-    "categories": ["Ruby"]
-}
\ No newline at end of file
diff --git a/ci/properties/rust.properties.json b/ci/properties/rust.properties.json
deleted file mode 100644
index 6f4f96736..000000000
--- a/ci/properties/rust.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Rust",
-    "description": "Build and test a Rust project with Cargo.",
-    "iconName": "rust",
-    "categories": ["Rust"]
-}
\ No newline at end of file
diff --git a/ci/properties/scala.properties.json b/ci/properties/scala.properties.json
deleted file mode 100644
index d44e8678d..000000000
--- a/ci/properties/scala.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Scala",
-    "description": "Build and test a Scala project with SBT.",
-    "iconName": "blank",
-    "categories": ["Scala", "Java"]
-}
diff --git a/ci/properties/swift.properties.json b/ci/properties/swift.properties.json
deleted file mode 100644
index 9efd64515..000000000
--- a/ci/properties/swift.properties.json
+++ /dev/null
@@ -1,6 +0,0 @@
-{
-    "name": "Swift",
-    "description": "Build and test a Swift Package.",
-    "iconName": "swift",
-    "categories": ["Swift"]
-}
diff --git a/ci/python-app.yml b/ci/python-app.yml
index 81d1ef640..9779cc2a6 100644
--- a/ci/python-app.yml
+++ b/ci/python-app.yml
@@ -1,30 +1,42 @@
-name: Python application
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up Python 3.7
-      uses: actions/setup-python@v1
-      with:
-        python-version: 3.7
-    - name: Install dependencies
-      run: |
-        python -m pip install --upgrade pip
-        pip install -r requirements.txt
-    - name: Lint with flake8
-      run: |
-        pip install flake8
-        # stop the build if there are Python syntax errors or undefined names
-        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
-        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
-        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
-    - name: Test with pytest
-      run: |
-        pip install pytest
-        pytest
+---
+name: Python application
+description: Create and test a Python application.
+categories: [Python]
+iconName: python
+---
+# This workflow will install Python dependencies, run tests and lint with a single version of Python
+# For more information see: https://help.github.com/actions/language-and-framework-guides/using-python-with-github-actions
+
+name: Python application
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up Python 3.8
+      uses: actions/setup-python@v2
+      with:
+        python-version: 3.8
+    - name: Install dependencies
+      run: |
+        python -m pip install --upgrade pip
+        pip install flake8 pytest
+        if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
+    - name: Lint with flake8
+      run: |
+        # stop the build if there are Python syntax errors or undefined names
+        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
+        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
+        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
+    - name: Test with pytest
+      run: |
+        pytest
diff --git a/ci/python-package.yml b/ci/python-package.yml
index 24f36a85b..ed9c48567 100644
--- a/ci/python-package.yml
+++ b/ci/python-package.yml
@@ -1,34 +1,45 @@
-name: Python package
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-    strategy:
-      max-parallel: 4
-      matrix:
-        python-version: [2.7, 3.5, 3.6, 3.7]
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up Python ${{ matrix.python-version }}
-      uses: actions/setup-python@v1
-      with:
-        python-version: ${{ matrix.python-version }}
-    - name: Install dependencies
-      run: |
-        python -m pip install --upgrade pip
-        pip install -r requirements.txt
-    - name: Lint with flake8
-      run: |
-        pip install flake8
-        # stop the build if there are Python syntax errors or undefined names
-        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
-        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
-        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
-    - name: Test with pytest
-      run: |
-        pip install pytest
-        pytest
+---
+name: Python package
+description: Create and test a Python package on multiple Python versions.
+categories: [Python]
+iconName: python
+---
+# This workflow will install Python dependencies, run tests and lint with a variety of Python versions
+# For more information see: https://help.github.com/actions/language-and-framework-guides/using-python-with-github-actions
+
+name: Python package
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+    strategy:
+      matrix:
+        python-version: [3.5, 3.6, 3.7, 3.8]
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up Python ${{ matrix.python-version }}
+      uses: actions/setup-python@v2
+      with:
+        python-version: ${{ matrix.python-version }}
+    - name: Install dependencies
+      run: |
+        python -m pip install --upgrade pip
+        pip install flake8 pytest
+        if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
+    - name: Lint with flake8
+      run: |
+        # stop the build if there are Python syntax errors or undefined names
+        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
+        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
+        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
+    - name: Test with pytest
+      run: |
+        pytest
diff --git a/ci/python-publish.yml b/ci/python-publish.yml
index 21f2f01de..acf66cdbd 100644
--- a/ci/python-publish.yml
+++ b/ci/python-publish.yml
@@ -1,3 +1,12 @@
+---
+name: Publish Python Package
+description: Publish a Python Package to PyPI on release.
+categories: [Python]
+iconName: python
+---
+# This workflows will upload a Python Package using Twine when a release is created
+# For more information see: https://help.github.com/en/actions/language-and-framework-guides/using-python-with-github-actions#publishing-to-package-registries
+
 name: Upload Python Package
 
 on:
@@ -6,11 +15,13 @@ on:
 
 jobs:
   deploy:
+
     runs-on: ubuntu-latest
+
     steps:
-    - uses: actions/checkout@v1
+    - uses: actions/checkout@v2
     - name: Set up Python
-      uses: actions/setup-python@v1
+      uses: actions/setup-python@v2
       with:
         python-version: '3.x'
     - name: Install dependencies
diff --git a/ci/ruby.yml b/ci/ruby.yml
index 7258d723c..aadf82c49 100644
--- a/ci/ruby.yml
+++ b/ci/ruby.yml
@@ -1,20 +1,39 @@
-name: Ruby
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Set up Ruby 2.6
-      uses: actions/setup-ruby@v1
-      with:
-        ruby-version: 2.6.x
-    - name: Build and test with Rake
-      run: |
-        gem install bundler
-        bundle install --jobs 4 --retry 3
-        bundle exec rake
+---
+name: Ruby
+description: Build and test a Ruby project with Rake.
+categories: [Ruby]
+iconName: ruby
+---
+# This workflow uses actions that are not certified by GitHub.
+# They are provided by a third-party and are governed by
+# separate terms of service, privacy policy, and support
+# documentation.
+# This workflow will download a prebuilt Ruby version, install dependencies and run tests with Rake
+# For more information see: https://github.com/marketplace/actions/setup-ruby-jruby-and-truffleruby
+
+name: Ruby
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  test:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Set up Ruby
+    # To automatically get bug fixes and new Ruby versions for ruby/setup-ruby,
+    # change this to (see https://github.com/ruby/setup-ruby#versioning):
+    # uses: ruby/setup-ruby@v1
+      uses: ruby/setup-ruby@ec106b438a1ff6ff109590de34ddc62c540232e0
+      with:
+        ruby-version: 2.6
+    - name: Install dependencies
+      run: bundle install
+    - name: Run tests
+      run: bundle exec rake
diff --git a/ci/rust.yml b/ci/rust.yml
index 9ca641ba1..68bc6a308 100644
--- a/ci/rust.yml
+++ b/ci/rust.yml
@@ -1,15 +1,25 @@
-name: Rust
-
-on: [push]
-
-jobs:
-  build:
-
-    runs-on: ubuntu-latest
-
-    steps:
-    - uses: actions/checkout@v1
-    - name: Build
-      run: cargo build --verbose
-    - name: Run tests
-      run: cargo test --verbose
+---
+name: Rust
+description: Build and test a Rust project with Cargo.
+categories: [Rust]
+iconName: rust
+---
+name: Rust
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+  build:
+
+    runs-on: ubuntu-latest
+
+    steps:
+    - uses: actions/checkout@v2
+    - name: Build
+      run: cargo build --verbose
+    - name: Run tests
+      run: cargo test --verbose
diff --git a/ci/scala.yml b/ci/scala.yml
index fbeee571c..ef5c55d37 100644
--- a/ci/scala.yml
+++ b/ci/scala.yml
@@ -1,6 +1,16 @@
+---
+name: Scala
+description: Build and test a Scala project with SBT.
+categories: [Scala, Java]
+iconName: scala
+---
 name: Scala CI
 
-on: [push]
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
 
 jobs:
   build:
@@ -8,7 +18,7 @@ jobs:
     runs-on: ubuntu-latest
 
     steps:
-    - uses: actions/checkout@v1
+    - uses: actions/checkout@v2
     - name: Set up JDK 1.8
       uses: actions/setup-java@v1
       with:
diff --git a/ci/swift.yml b/ci/swift.yml
index 2e766326a..2d9f4a6bf 100644
--- a/ci/swift.yml
+++ b/ci/swift.yml
@@ -1,14 +1,24 @@
+---
+name: Swift
+description: Build and test a Swift Package.
+categories: [Swift]
+iconName: swift
+---
 name: Swift
 
-on: [push]
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
 
 jobs:
   build:
 
-    runs-on: macOS-latest
+    runs-on: macos-latest
 
     steps:
-    - uses: actions/checkout@v1
+    - uses: actions/checkout@v2
     - name: Build
       run: swift build -v
     - name: Run tests
diff --git a/ci/tencent.yml b/ci/tencent.yml
new file mode 100644
index 000000000..338238065
--- /dev/null
+++ b/ci/tencent.yml
@@ -0,0 +1,81 @@
+---
+name: Tencent Kubernetes Engine
+description: This workflow will build a docker container, publish and deploy it to Tencent Kubernetes Engine (TKE).
+categories: []
+iconName: tencentcloud
+---
+# This workflow will build a docker container, publish and deploy it to Tencent Kubernetes Engine (TKE).
+#
+# To configure this workflow:
+#
+# 1. Ensure that your repository contains the necessary configuration for your Tencent Kubernetes Engine cluster, 
+#    including deployment.yml, kustomization.yml, service.yml, etc.
+#
+# 2. Set up secrets in your workspace: 
+#    - TENCENT_CLOUD_SECRET_ID with Tencent Cloud secret id
+#    - TENCENT_CLOUD_SECRET_KEY with Tencent Cloud secret key 
+#    - TENCENT_CLOUD_ACCOUNT_ID with Tencent Cloud account id
+#    - TKE_REGISTRY_PASSWORD with TKE registry password
+#
+# 3. Change the values for the TKE_IMAGE_URL, TKE_REGION, TKE_CLUSTER_ID and DEPLOYMENT_NAME environment variables (below).
+
+name: Tencent Kubernetes Engine
+
+on:
+  release:
+    types: [created]
+
+# Environment variables available to all jobs and steps in this workflow
+env:
+  TKE_IMAGE_URL: ccr.ccs.tencentyun.com/demo/mywebapp
+  TKE_REGION: ap-guangzhou
+  TKE_CLUSTER_ID: cls-mywebapp
+  DEPLOYMENT_NAME: tke-test
+
+jobs:
+  setup-build-publish-deploy:
+    name: Setup, Build, Publish, and Deploy
+    runs-on: ubuntu-latest
+    steps:
+
+    - name: Checkout
+      uses: actions/checkout@v2
+      
+    # Build
+    - name: Build Docker image
+      run: |        
+        docker build -t ${TKE_IMAGE_URL}:${GITHUB_SHA} .
+
+    - name: Login TKE Registry
+      run: |
+        docker login -u ${{ secrets.TENCENT_CLOUD_ACCOUNT_ID }} -p ${{ secrets.TKE_REGISTRY_PASSWORD }} ${TKE_IMAGE_URL}
+
+    # Push the Docker image to TKE Registry
+    - name: Publish
+      run: |
+        docker push ${TKE_IMAGE_URL}:${GITHUB_SHA}
+
+    - name: Set up Kustomize
+      run: |
+        curl -o kustomize --location https://github.com/kubernetes-sigs/kustomize/releases/download/v3.1.0/kustomize_3.1.0_linux_amd64
+        chmod u+x ./kustomize
+
+    - name: Set up ~/.kube/config for connecting TKE cluster
+      uses: TencentCloud/tke-cluster-credential-action@v1
+      with:
+        secret_id: ${{ secrets.TENCENT_CLOUD_SECRET_ID }}
+        secret_key: ${{ secrets.TENCENT_CLOUD_SECRET_KEY }}
+        tke_region: ${{ env.TKE_REGION }}
+        cluster_id: ${{ env.TKE_CLUSTER_ID }}
+    
+    - name: Switch to TKE context
+      run: |
+        kubectl config use-context ${TKE_CLUSTER_ID}-context-default
+
+    # Deploy the Docker image to the TKE cluster
+    - name: Deploy
+      run: |
+        ./kustomize edit set image ${TKE_IMAGE_URL}:${GITHUB_SHA}
+        ./kustomize build . | kubectl apply -f -
+        kubectl rollout status deployment/${DEPLOYMENT_NAME}
+        kubectl get services -o wide
\ No newline at end of file
diff --git a/ci/terraform.yml b/ci/terraform.yml
new file mode 100644
index 000000000..63e1a3952
--- /dev/null
+++ b/ci/terraform.yml
@@ -0,0 +1,96 @@
+---
+name: Terraform
+description: Set up Terraform CLI in your GitHub Actions workflow.
+categories: []
+iconName: terraform
+---
+# This workflow installs the latest version of Terraform CLI and configures the Terraform CLI configuration file
+# with an API token for Terraform Cloud (app.terraform.io). On pull request events, this workflow will run
+# `terraform init`, `terraform fmt`, and `terraform plan` (speculative plan via Terraform Cloud). On push events
+# to the master branch, `terraform apply` will be executed.
+#
+# Documentation for `hashicorp/setup-terraform` is located here: https://github.com/hashicorp/setup-terraform
+#
+# To use this workflow, you will need to complete the following setup steps.
+#
+# 1. Create a `main.tf` file in the root of this repository with the `remote` backend and one or more resources defined.
+#   Example `main.tf`:
+#     # The configuration for the `remote` backend.
+#     terraform {
+#       backend "remote" {
+#         # The name of your Terraform Cloud organization.
+#         organization = "example-organization"
+#
+#         # The name of the Terraform Cloud workspace to store Terraform state files in.
+#         workspaces {
+#           name = "example-workspace"
+#         }
+#       }
+#     }
+#
+#     # An example resource that does nothing.
+#     resource "null_resource" "example" {
+#       triggers = {
+#         value = "A example resource that does nothing!"
+#       }
+#     }
+#
+#
+# 2. Generate a Terraform Cloud user API token and store it as a GitHub secret (e.g. TF_API_TOKEN) on this repository.
+#   Documentation:
+#     - https://www.terraform.io/docs/cloud/users-teams-organizations/api-tokens.html
+#     - https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets
+#
+# 3. Reference the GitHub secret in step using the `hashicorp/setup-terraform` GitHub Action.
+#   Example:
+#     - name: Setup Terraform
+#       uses: hashicorp/setup-terraform@v1
+#       with:
+#         cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}
+
+name: 'Terraform'
+
+on:
+  push:
+    branches:
+    - master
+  pull_request:
+
+jobs:
+  terraform:
+    name: 'Terraform'
+    runs-on: ubuntu-latest
+
+    # Use the Bash shell regardless whether the GitHub Actions runner is ubuntu-latest, macos-latest, or windows-latest
+    defaults:
+      run:
+        shell: bash
+
+    # Checkout the repository to the GitHub Actions runner
+    steps:
+    - name: Checkout
+      uses: actions/checkout@v2
+
+    # Install the latest version of Terraform CLI and configure the Terraform CLI configuration file with a Terraform Cloud user API token 
+    - name: Setup Terraform
+      uses: hashicorp/setup-terraform@v1
+      with:
+        cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}
+
+    # Initialize a new or existing Terraform working directory by creating initial files, loading any remote state, downloading modules, etc.
+    - name: Terraform Init
+      run: terraform init
+
+    # Checks that all Terraform configuration files adhere to a canonical format
+    - name: Terraform Format
+      run: terraform fmt -check
+
+    # Generates an execution plan for Terraform
+    - name: Terraform Plan
+      run: terraform plan
+    
+      # On push to master, build or change infrastructure according to Terraform configuration files
+      # Note: It is recommended to set up a required "strict" status check in your repository for "Terraform Cloud". See the documentation on "strict" required status checks for more information: https://help.github.com/en/github/administering-a-repository/types-of-required-status-checks
+    - name: Terraform Apply
+      if: github.ref == 'refs/heads/master' && github.event_name == 'push'
+      run: terraform apply -auto-approve
diff --git a/ci/wpf-dotnet-core.yml b/ci/wpf-dotnet-core.yml
new file mode 100644
index 000000000..34a1fba0c
--- /dev/null
+++ b/ci/wpf-dotnet-core.yml
@@ -0,0 +1,121 @@
+---
+name: WPF .NET Core
+description: Build, test and publish a Wpf application built on .NET Core.
+categories: [C#, Visual Basic, WPF, .NET]
+iconName: dotnetcore
+---
+# This workflow uses actions that are not certified by GitHub.
+# They are provided by a third-party and are governed by
+# separate terms of service, privacy policy, and support
+# documentation.
+
+# This workflow will build, test and package a WPF desktop application
+# built on .NET Core.
+# To learn how to migrate your existing WPF application to .NET Core,
+# refer to https://docs.microsoft.com/en-us/dotnet/desktop-wpf/migration/convert-project-from-net-framework
+#
+# To configure this workflow:
+#
+# 1. Configure environment variables
+# GitHub sets default environment variables for every workflow run.  
+# Replace the variables relative to your project in the "env" section below.
+# 
+# 2. Signing
+# Generate a signing certificate in the Windows Application 
+# Packaging Project or add an existing signing certificate to the project.
+# Next, use PowerShell to encode the .pfx file using Base64 encoding
+# by running the following Powershell script to generate the output string:
+# 
+# $pfx_cert = Get-Content '.\SigningCertificate.pfx' -Encoding Byte
+# [System.Convert]::ToBase64String($pfx_cert) | Out-File 'SigningCertificate_Encoded.txt'
+#
+# Open the output file, SigningCertificate_Encoded.txt, and copy the
+# string inside. Then, add the string to the repo as a GitHub secret
+# and name it "Base64_Encoded_Pfx."
+# For more information on how to configure your signing certificate for 
+# this workflow, refer to https://github.com/microsoft/github-actions-for-desktop-apps#signing
+#
+# Finally, add the signing certificate password to the repo as a secret and name it "Pfx_Key".
+# See "Build the Windows Application Packaging project" below to see how the secret is used.
+#
+# For more information on GitHub Actions, refer to https://github.com/features/actions
+# For a complete CI/CD sample to get started with GitHub Action workflows for Desktop Applications,
+# refer to https://github.com/microsoft/github-actions-for-desktop-apps
+
+name:  WPF .NET Core
+
+on:
+  push:
+    branches: [ master ]
+  pull_request:
+    branches: [ master ]
+
+jobs:
+
+  build:
+
+    strategy:
+      matrix:
+        configuration: [Debug, Release]
+
+    runs-on: windows-latest  # For a list of available runner types, refer to 
+                             # https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#jobsjob_idruns-on
+
+    env:
+      Solution_Name: your-solution-name                         # Replace with your solution name, i.e. MyWpfApp.sln.
+      Test_Project_Path: your-test-project-path                 # Replace with the path to your test project, i.e. MyWpfApp.Tests\MyWpfApp.Tests.csproj.
+      Wap_Project_Directory: your-wap-project-directory-name    # Replace with the Wap project directory relative to the solution, i.e. MyWpfApp.Package.
+      Wap_Project_Path: your-wap-project-path                   # Replace with the path to your Wap project, i.e. MyWpf.App.Package\MyWpfApp.Package.wapproj.
+
+    steps:
+    - name: Checkout
+      uses: actions/checkout@v2
+      with:
+        fetch-depth: 0
+
+    # Install the .NET Core workload
+    - name: Install .NET Core
+      uses: actions/setup-dotnet@v1
+      with:
+        dotnet-version: 3.1.101
+
+    # Add  MSBuild to the PATH: https://github.com/microsoft/setup-msbuild
+    - name: Setup MSBuild.exe
+      uses: microsoft/setup-msbuild@2008f912f56e61277eefaac6d1888b750582aa16
+
+    # Execute all unit tests in the solution
+    - name: Execute unit tests
+      run: dotnet test
+
+    # Restore the WPF application to populate the obj folder with RuntimeIdentifiers
+    - name: Restore the WPF application
+      run: msbuild $env:Solution_Name /t:Restore /p:Configuration=$env:Configuration
+      env:
+        Configuration: ${{ matrix.configuration }}
+
+    # Decode the base 64 encoded pfx and save the Signing_Certificate
+    - name: Decode the pfx
+      run: |
+        $pfx_cert_byte = [System.Convert]::FromBase64String("${{ secrets.Base64_Encoded_Pfx }}")
+        $certificatePath = Join-Path -Path $env:Wap_Project_Directory -ChildPath GitHubActionsWorkflow.pfx
+        [IO.File]::WriteAllBytes("$certificatePath", $pfx_cert_byte)
+
+    # Create the app package by building and packaging the Windows Application Packaging project
+    - name: Create the app package
+      run: msbuild $env:Wap_Project_Path /p:Configuration=$env:Configuration /p:UapAppxPackageBuildMode=$env:Appx_Package_Build_Mode /p:AppxBundle=$env:Appx_Bundle /p:PackageCertificateKeyFile=GitHubActionsWorkflow.pfx /p:PackageCertificatePassword=${{ secrets.Pfx_Key }}
+      env:
+        Appx_Bundle: Always
+        Appx_Bundle_Platforms: x86|x64
+        Appx_Package_Build_Mode: StoreUpload
+        Configuration: ${{ matrix.configuration }}
+
+    # Remove the pfx
+    - name: Remove the pfx
+      run: Remove-Item -path $env:Wap_Project_Directory\$env:Signing_Certificate
+
+    # Upload the MSIX package: https://github.com/marketplace/actions/upload-artifact
+    - name: Upload build artifacts
+      uses: actions/upload-artifact@v1
+      with:
+        name: MSIX Package
+        path: ${{ env.Wap_Project_Directory }}\AppPackages
diff --git a/icons/aws.svg b/icons/aws.svg
new file mode 100644
index 000000000..59ff870b9
--- /dev/null
+++ b/icons/aws.svg
@@ -0,0 +1 @@
+<svg xmlns="http://www.w3.org/2000/svg" width="302" height="180" viewBox="0 0 302 180"><g fill="none"><path fill="#252F3E" d="M85.4 65.4c0 3.7.4 6.7 1.1 8.9.8 2.2 1.8 4.6 3.2 7.2.5.8.7 1.6.7 2.3 0 1-.6 2-1.9 3L82.2 91c-.9.6-1.8.9-2.6.9-1 0-2-.5-3-1.4-1.4-1.5-2.6-3.1-3.6-4.7-1-1.7-2-3.6-3.1-5.9-7.8 9.2-17.6 13.8-29.4 13.8-8.4 0-15.1-2.4-20-7.2-4.9-4.8-7.4-11.2-7.4-19.2 0-8.5 3-15.4 9.1-20.6 6.1-5.2 14.2-7.8 24.5-7.8 3.4 0 6.9.3 10.6.8 3.7.5 7.5 1.3 11.5 2.2v-7.3c0-7.6-1.6-12.9-4.7-16-3.2-3.1-8.6-4.6-16.3-4.6-3.5 0-7.1.4-10.8 1.3-3.7.9-7.3 2-10.8 3.4-1.6.7-2.8 1.1-3.5 1.3-.7.2-1.2.3-1.6.3-1.4 0-2.1-1-2.1-3.1v-4.9c0-1.6.2-2.8.7-3.5.5-.7 1.4-1.4 2.8-2.1 3.5-1.8 7.7-3.3 12.6-4.5C40 .9 45.2.3 50.7.3 62.6.3 71.3 3 76.9 8.4c5.5 5.4 8.3 13.6 8.3 24.6v32.4h.2zM44.8 80.6c3.3 0 6.7-.6 10.3-1.8 3.6-1.2 6.8-3.4 9.5-6.4 1.6-1.9 2.8-4 3.4-6.4.6-2.4 1-5.3 1-8.7v-4.2c-2.9-.7-6-1.3-9.2-1.7-3.2-.4-6.3-.6-9.4-.6-6.7 0-11.6 1.3-14.9 4-3.3 2.7-4.9 6.5-4.9 11.5 0 4.7 1.2 8.2 3.7 10.6 2.4 2.5 5.9 3.7 10.5 3.7zm80.3 10.8c-1.8 0-3-.3-3.8-1-.8-.6-1.5-2-2.1-3.9L95.7 9.2c-.6-2-.9-3.3-.9-4 0-1.6.8-2.5 2.4-2.5h9.8c1.9 0 3.2.3 3.9 1 .8.6 1.4 2 2 3.9l16.8 66.2 15.6-66.2c.5-2 1.1-3.3 1.9-3.9.8-.6 2.2-1 4-1h8c1.9 0 3.2.3 4 1 .8.6 1.5 2 1.9 3.9l15.8 67 17.3-67c.6-2 1.3-3.3 2-3.9.8-.6 2.1-1 3.9-1h9.3c1.6 0 2.5.8 2.5 2.5 0 .5-.1 1-.2 1.6-.1.6-.3 1.4-.7 2.5l-24.1 77.3c-.6 2-1.3 3.3-2.1 3.9-.8.6-2.1 1-3.8 1h-8.6c-1.9 0-3.2-.3-4-1-.8-.7-1.5-2-1.9-4L155 22l-15.4 64.4c-.5 2-1.1 3.3-1.9 4-.8.7-2.2 1-4 1h-8.6zm128.5 2.7c-5.2 0-10.4-.6-15.4-1.8-5-1.2-8.9-2.5-11.5-4-1.6-.9-2.7-1.9-3.1-2.8-.4-.9-.6-1.9-.6-2.8v-5.1c0-2.1.8-3.1 2.3-3.1.6 0 1.2.1 1.8.3.6.2 1.5.6 2.5 1 3.4 1.5 7.1 2.7 11 3.5 4 .8 7.9 1.2 11.9 1.2 6.3 0 11.2-1.1 14.6-3.3 3.4-2.2 5.2-5.4 5.2-9.5 0-2.8-.9-5.1-2.7-7-1.8-1.9-5.2-3.6-10.1-5.2L245 51c-7.3-2.3-12.7-5.7-16-10.2-3.3-4.4-5-9.3-5-14.5 0-4.2.9-7.9 2.7-11.1 1.8-3.2 4.2-6 7.2-8.2 3-2.3 6.4-4 10.4-5.2 4-1.2 8.2-1.7 12.6-1.7 2.2 0 4.5.1 6.7.4 2.3.3 4.4.7 6.5 1.1 2 .5 3.9 1 5.7 1.6 1.8.6 3.2 1.2 4.2 1.8 1.4.8 2.4 1.6 3 2.5.6.8.9 1.9.9 3.3v4.7c0 2.1-.8 3.2-2.3 3.2-.8 0-2.1-.4-3.8-1.2-5.7-2.6-12.1-3.9-19.2-3.9-5.7 0-10.2.9-13.3 2.8-3.1 1.9-4.7 4.8-4.7 8.9 0 2.8 1 5.2 3 7.1 2 1.9 5.7 3.8 11 5.5l14.2 4.5c7.2 2.3 12.4 5.5 15.5 9.6 3.1 4.1 4.6 8.8 4.6 14 0 4.3-.9 8.2-2.6 11.6-1.8 3.4-4.2 6.4-7.3 8.8-3.1 2.5-6.8 4.3-11.1 5.6-4.5 1.4-9.2 2.1-14.3 2.1z"/><g fill="#F90"><path d="M272.5 142.7c-32.9 24.3-80.7 37.2-121.8 37.2-57.6 0-109.5-21.3-148.7-56.7-3.1-2.8-.3-6.6 3.4-4.4 42.4 24.6 94.7 39.5 148.8 39.5 36.5 0 76.6-7.6 113.5-23.2 5.5-2.5 10.2 3.6 4.8 7.6z"/><path d="M286.2 127.1c-4.2-5.4-27.8-2.6-38.5-1.3-3.2.4-3.7-2.4-.8-4.5 18.8-13.2 49.7-9.4 53.3-5 3.6 4.5-1 35.4-18.6 50.2-2.7 2.3-5.3 1.1-4.1-1.9 4-9.9 12.9-32.2 8.7-37.5z"/></g></g></svg>
\ No newline at end of file
diff --git a/icons/azure.svg b/icons/azure.svg
new file mode 100644
index 000000000..2ff63c104
--- /dev/null
+++ b/icons/azure.svg
@@ -0,0 +1 @@
+<svg height="1995" viewBox="0 0 161.67 129" width="2500" xmlns="http://www.w3.org/2000/svg"><path d="m88.33 0-47.66 41.33-40.67 73h36.67zm6.34 9.67-20.34 57.33 39 49-75.66 13h124z" fill="#0072c6"/></svg>
\ No newline at end of file
diff --git a/icons/googlegke.svg b/icons/googlegke.svg
new file mode 100644
index 000000000..68ecb3913
--- /dev/null
+++ b/icons/googlegke.svg
@@ -0,0 +1 @@
+<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" id="svg5347" version="1.1" viewBox="0 0 216.78116 136.34911" height="136.34911mm" width="216.78116mm"><defs id="defs5341"><clipPath clipPathUnits="userSpaceOnUse" id="clipPath5908"><path d="M 0,0 H 778.44 V 563.391 H 0 Z" id="path5906" /></clipPath><clipPath clipPathUnits="userSpaceOnUse" id="clipPath5938"><path d="m 273.316,242.517 h 231.381 v 231.38 H 273.316 Z" id="path5936" /></clipPath></defs><metadata id="metadata5344"><rdf:RDF><cc:Work rdf:about=""><dc:format>image/svg+xml</dc:format><dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" /><dc:title></dc:title></cc:Work></rdf:RDF></metadata><g transform="translate(4.0691567,-83.682598)" id="layer1"><g id="g5900" transform="matrix(0.35277777,0,0,-0.35277777,-32.91135,242.36853)"><g id="g5902"><g id="g5904" clip-path="url(#clipPath5908)"><g id="g5910" transform="translate(376.9634,115.709)"><path d="m 0,0 24.292,10.087 c -0.687,1.714 -1.956,3.104 -3.809,4.169 -1.853,1.063 -3.946,1.595 -6.279,1.595 -3.499,0 -6.777,-1.441 -9.83,-4.322 C 1.32,8.646 -0.138,4.802 0,0 m 15.131,-27.998 c -7.686,0 -14.102,2.608 -19.248,7.823 -5.147,5.214 -7.72,11.665 -7.72,19.352 0,7.958 2.487,14.477 7.462,19.556 4.975,5.077 11.03,7.617 18.167,7.617 3.294,0 6.347,-0.601 9.162,-1.801 2.813,-1.201 5.146,-2.746 6.999,-4.632 1.853,-1.888 3.328,-3.723 4.426,-5.507 1.097,-1.785 1.989,-3.569 2.676,-5.352 L 38.291,5.97 1.955,-9.058 c 2.813,-5.491 7.206,-8.234 13.176,-8.234 5.489,0 9.949,2.503 13.381,7.514 l 9.263,-6.177 c -2.058,-3.087 -4.975,-5.867 -8.748,-8.337 -3.776,-2.47 -8.407,-3.706 -13.896,-3.706 m -32.732,1.648 h -11.94 v 79.875 h 11.94 z m -45.187,9.058 c 4.117,0 7.566,1.559 10.345,4.683 2.779,3.121 4.168,7.015 4.168,11.683 0,4.734 -1.389,8.679 -4.168,11.837 -2.779,3.155 -6.228,4.734 -10.345,4.734 -4.186,0 -7.755,-1.579 -10.704,-4.734 -2.952,-3.158 -4.426,-7.103 -4.426,-11.837 0,-4.668 1.474,-8.562 4.426,-11.683 2.949,-3.124 6.518,-4.683 10.704,-4.683 m -0.824,-35.1 c -6.038,0 -11.116,1.613 -15.233,4.837 -4.117,3.227 -7.069,6.966 -8.853,11.221 l 10.397,4.322 c 1.097,-2.607 2.813,-4.872 5.146,-6.793 2.332,-1.92 5.181,-2.883 8.543,-2.883 4.53,0 8.081,1.374 10.654,4.118 2.573,2.745 3.86,6.691 3.86,11.837 v 3.911 h -0.412 c -3.363,-4.117 -8.131,-6.176 -14.308,-6.176 -6.931,0 -13.004,2.642 -18.218,7.926 -5.216,5.283 -7.823,11.666 -7.823,19.146 0,7.547 2.607,13.98 7.823,19.3 5.214,5.316 11.287,7.976 18.218,7.976 3.089,0 5.884,-0.583 8.39,-1.749 2.503,-1.169 4.477,-2.609 5.918,-4.324 h 0.412 v 4.426 h 11.322 v -48.789 c 0,-9.469 -2.419,-16.554 -7.256,-21.256 -4.838,-4.699 -11.031,-7.05 -18.58,-7.05 m -69.272,39.783 c 3.019,-3.124 6.621,-4.683 10.808,-4.683 4.184,0 7.788,1.559 10.808,4.683 3.019,3.121 4.528,7.051 4.528,11.786 0,4.802 -1.492,8.749 -4.477,11.836 -2.985,3.089 -6.605,4.632 -10.859,4.632 -4.256,0 -7.875,-1.543 -10.86,-4.632 -2.984,-3.087 -4.477,-7.034 -4.477,-11.836 0,-4.735 1.509,-8.665 4.529,-11.786 m 30.159,-7.617 c -5.285,-5.182 -11.734,-7.772 -19.351,-7.772 -7.617,0 -14.068,2.59 -19.351,7.772 -5.285,5.18 -7.926,11.648 -7.926,19.403 0,7.753 2.641,14.22 7.926,19.402 5.283,5.181 11.734,7.771 19.351,7.771 7.617,0 14.066,-2.59 19.351,-7.771 5.283,-5.182 7.926,-11.649 7.926,-19.402 0,-7.755 -2.643,-14.223 -7.926,-19.403 m -89.653,7.617 c 3.019,-3.124 6.621,-4.683 10.808,-4.683 4.184,0 7.787,1.559 10.807,4.683 3.019,3.121 4.53,7.051 4.53,11.786 0,4.802 -1.493,8.749 -4.478,11.836 -2.985,3.089 -6.605,4.632 -10.859,4.632 -4.256,0 -7.875,-1.543 -10.86,-4.632 -2.985,-3.087 -4.476,-7.034 -4.476,-11.836 0,-4.735 1.508,-8.665 4.528,-11.786 m 30.159,-7.617 c -5.285,-5.182 -11.735,-7.772 -19.351,-7.772 -7.617,0 -14.068,2.59 -19.352,7.772 -5.284,5.18 -7.925,11.648 -7.925,19.403 0,7.753 2.641,14.22 7.925,19.402 5.284,5.181 11.735,7.771 19.352,7.771 7.616,0 14.066,-2.59 19.351,-7.771 5.283,-5.182 7.926,-11.649 7.926,-19.402 0,-7.755 -2.643,-14.223 -7.926,-19.403 m -90.168,-7.772 c -11.666,0 -21.718,4.134 -30.159,12.404 -8.44,8.268 -12.66,18.201 -12.66,29.798 0,11.597 4.22,21.529 12.66,29.799 8.441,8.268 18.493,12.403 30.159,12.403 11.185,0 20.826,-3.877 28.924,-11.631 l -8.132,-8.131 c -5.833,5.488 -12.763,8.234 -20.792,8.234 -8.44,0 -15.594,-2.985 -21.461,-8.955 -5.867,-5.97 -8.8,-13.211 -8.8,-21.719 0,-8.509 2.933,-15.748 8.8,-21.718 5.867,-5.97 13.021,-8.955 21.461,-8.955 8.577,0 15.679,2.813 21.307,8.44 3.362,3.362 5.455,8.199 6.279,14.514 h -27.586 v 11.527 h 38.805 c 0.412,-2.057 0.618,-4.46 0.618,-7.205 0,-11.322 -3.329,-20.312 -9.984,-26.968 -7.55,-7.891 -17.362,-11.837 -29.439,-11.837" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5912" /></g><g id="g5914" transform="translate(477.9388,87.7114)"><path d="m 0,0 c -10.843,0 -19.935,3.67 -27.277,11.013 -7.343,7.343 -11.014,16.503 -11.014,27.484 0,10.978 3.671,20.139 11.014,27.482 7.342,7.342 16.434,11.013 27.277,11.013 11.116,0 20.138,-4.014 27.071,-12.043 L 20.483,58.568 C 15.473,64.812 8.646,67.934 0,67.934 c -8.029,0 -14.806,-2.711 -20.329,-8.131 -5.525,-5.421 -8.286,-12.524 -8.286,-21.306 0,-8.785 2.761,-15.887 8.286,-21.307 5.523,-5.422 12.3,-8.132 20.329,-8.132 8.852,0 16.399,3.567 22.645,10.705 l 6.587,-6.587 C 25.869,9.126 21.649,5.919 16.572,3.552 11.492,1.184 5.97,0 0,0" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5916" /></g><path d="m 525.079,89.359 h -9.47 v 73.698 h 9.47 z" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5918" /><g id="g5920" transform="translate(547.5704,101.3496)"><path d="m 0,0 c 3.259,-3.329 7.119,-4.992 11.58,-4.992 4.459,0 8.319,1.663 11.58,4.992 3.258,3.328 4.889,7.736 4.889,13.227 0,5.489 -1.631,9.897 -4.889,13.227 -3.261,3.327 -7.121,4.992 -11.58,4.992 C 7.119,31.446 3.259,29.781 0,26.454 -3.26,23.124 -4.889,18.716 -4.889,13.227 -4.889,7.736 -3.26,3.328 0,0 m -7.051,32.424 c 4.872,5.111 11.081,7.668 18.631,7.668 7.547,0 13.757,-2.557 18.63,-7.668 4.872,-5.113 7.309,-11.513 7.309,-19.197 0,-7.686 -2.437,-14.085 -7.309,-19.197 -4.873,-5.113 -11.083,-7.668 -18.63,-7.668 -7.55,0 -13.759,2.555 -18.631,7.668 -4.872,5.112 -7.307,11.511 -7.307,19.197 0,7.684 2.435,14.084 7.307,19.197" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5922" /></g><g id="g5924" transform="translate(637.4815,89.3586)"><path d="M 0,0 H -9.058 V 6.999 H -9.47 c -1.441,-2.403 -3.638,-4.444 -6.587,-6.124 -2.951,-1.681 -6.073,-2.522 -9.367,-2.522 -6.314,0 -11.1,1.921 -14.359,5.764 -3.26,3.842 -4.889,8.989 -4.889,15.44 v 30.879 h 9.47 V 21.101 c 0,-9.402 4.151,-14.102 12.454,-14.102 3.912,0 7.102,1.578 9.573,4.735 2.47,3.156 3.705,6.794 3.705,10.911 V 50.436 H 0 Z" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5926" /></g><g id="g5928" transform="translate(671.1402,96.3577)"><path d="m 0,0 c 4.46,0 8.251,1.647 11.374,4.941 3.122,3.293 4.683,7.719 4.683,13.278 0,5.558 -1.561,9.984 -4.683,13.279 -3.123,3.293 -6.914,4.94 -11.374,4.94 -4.392,0 -8.167,-1.665 -11.323,-4.992 -3.156,-3.33 -4.734,-7.738 -4.734,-13.227 0,-5.491 1.578,-9.899 4.734,-13.227 C -8.167,1.663 -4.392,0 0,0 m -1.544,-8.646 c -6.52,0 -12.146,2.573 -16.881,7.72 -4.735,5.146 -7.102,11.528 -7.102,19.145 0,7.617 2.367,13.999 7.102,19.145 4.735,5.147 10.361,7.72 16.881,7.72 3.842,0 7.29,-0.824 10.345,-2.47 3.052,-1.648 5.334,-3.706 6.845,-6.176 h 0.411 l -0.411,6.999 v 23.262 h 9.469 V -6.999 H 16.057 V 0 H 15.646 C 14.135,-2.47 11.853,-4.529 8.801,-6.176 5.746,-7.823 2.298,-8.646 -1.544,-8.646" style="fill:#5f6368;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5930" /></g></g></g><g id="g5932"><g id="g5934" clip-path="url(#clipPath5938)"><g id="g5940" transform="translate(419.2654,400.5364)"><path d="m 0,0 7.102,-0.134 19.298,19.298 0.935,8.171 c -15.333,13.639 -35.507,21.947 -57.594,21.947 -39.991,0 -73.732,-27.203 -83.736,-64.072 2.112,1.46 6.605,0.373 6.605,0.373 l 38.567,6.336 c 0,0 1.995,3.279 2.981,3.077 8.821,9.655 21.506,15.723 35.583,15.723 C -18.806,10.719 -8.279,6.697 0,0" style="fill:#ea4335;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5942" /></g><g id="g5944" transform="translate(472.7564,385.6973)"><path d="M 0,0 C -4.476,16.534 -13.723,31.121 -26.174,42.189 L -53.51,14.854 c 10.946,-8.844 17.964,-22.366 17.964,-37.501 v -4.82 c 13.29,0 24.102,-10.812 24.102,-24.102 0,-13.291 -10.812,-24.102 -24.107,-24.102 H -83.75 l -4.824,-4.846 v -28.923 l 4.824,-4.795 h 48.204 c 34.554,0 62.666,28.112 62.666,62.666 C 27.12,-30.208 16.368,-11.318 0,0" style="fill:#4285f4;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5946" /></g><g id="g5948" transform="translate(340.8001,271.4624)"><path d="M 0,0 H 48.167 V 38.563 H 0.006 c -3.542,0 -6.897,0.788 -9.93,2.166 l -6.947,-2.124 -19.307,-19.306 -1.691,-6.515 C -27.342,4.771 -14.22,0.001 0,0" style="fill:#34a853;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5950" /></g><g id="g5952" transform="translate(340.8023,396.7935)"><path d="m 0,0 c -34.554,0 -62.666,-28.112 -62.666,-62.666 0,-20.345 9.752,-38.449 24.821,-49.905 l 27.951,27.952 c -8.364,3.785 -14.208,12.191 -14.208,21.953 0,13.291 10.812,24.103 24.102,24.103 9.762,0 18.169,-5.844 21.954,-14.209 l 27.951,27.951 C 38.45,-9.752 20.345,0 0,0" style="fill:#fbbc05;fill-opacity:1;fill-rule:nonzero;stroke:none" id="path5954" /></g></g></g></g></g></svg> 
\ No newline at end of file
diff --git a/icons/ibm.svg b/icons/ibm.svg
new file mode 100644
index 000000000..3732033ce
--- /dev/null
+++ b/icons/ibm.svg
@@ -0,0 +1,61 @@
+<?xml version="1.0" standalone="no"?>
+<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN"
+ "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
+<svg version="1.0" xmlns="http://www.w3.org/2000/svg"
+ width="3200.000000pt" height="1500.000000pt" viewBox="0 0 3200.000000 1500.000000"
+ preserveAspectRatio="xMidYMid meet">
+<metadata>
+Created by potrace 1.16, written by Peter Selinger 2001-2019
+</metadata>
+<g transform="translate(0.000000,1500.000000) scale(0.100000,-0.100000)"
+fill="#000000" stroke="none">
+<path d="M17693 7818 c2 -1280 4 -1367 21 -1423 46 -152 139 -269 258 -325
+118 -55 164 -62 411 -67 l227 -5 0 246 0 246 -140 0 -140 0 0 1345 0 1345
+-320 0 -320 0 3 -1362z"/>
+<path d="M25360 8530 c0 -357 -3 -650 -8 -650 -4 0 -21 30 -36 66 -59 134
+-159 235 -299 298 -107 49 -166 61 -302 60 -450 -3 -724 -268 -820 -794 -26
+-141 -32 -517 -11 -676 41 -310 127 -514 282 -670 65 -65 98 -89 176 -128 211
+-104 478 -115 673 -26 137 62 260 188 306 313 12 31 26 57 30 57 5 0 9 -85 9
+-190 l0 -190 320 0 320 0 0 1590 0 1590 -320 0 -320 0 0 -650z m-228 -768
+c109 -39 194 -122 219 -214 6 -24 9 -187 7 -441 l-3 -402 -27 -51 c-62 -118
+-202 -188 -378 -187 -146 0 -259 57 -337 171 -73 107 -76 127 -81 464 -4 324
+1 366 54 472 47 94 144 175 243 203 67 19 232 11 303 -15z"/>
+<path d="M15905 9034 c-493 -76 -839 -381 -999 -880 -109 -341 -125 -821 -41
+-1196 92 -408 319 -718 639 -873 203 -98 359 -130 636 -130 210 0 292 12 440
+62 270 92 498 294 649 573 l40 76 -252 146 c-138 81 -259 149 -268 153 -12 4
+-20 -5 -33 -39 -28 -73 -107 -186 -172 -246 -176 -163 -465 -198 -702 -85 -85
+40 -191 139 -236 220 -42 76 -83 210 -95 310 -14 114 -14 633 -1 745 46 380
+276 600 630 600 240 0 407 -97 505 -292 25 -50 45 -96 45 -104 0 -8 4 -14 10
+-14 7 0 544 275 559 286 2 2 -18 42 -43 91 -191 358 -474 553 -871 602 -120
+15 -329 12 -440 -5z"/>
+<path d="M6000 8850 l0 -150 210 0 210 0 0 -1200 0 -1200 -210 0 -210 0 0
+-150 0 -150 600 0 600 0 0 150 0 150 -210 0 -210 0 0 1200 0 1200 210 0 210 0
+0 150 0 150 -600 0 -600 0 0 -150z"/>
+<path d="M7860 7500 l0 -1501 748 3 c672 3 753 5 807 21 278 80 499 328 559
+627 73 367 -35 667 -299 828 -59 36 -191 82 -234 82 -48 0 -38 26 15 39 191
+48 337 186 400 378 27 83 29 98 29 253 0 189 -11 243 -77 380 -33 68 -57 100
+-127 170 -97 97 -194 152 -336 192 -79 22 -91 22 -782 26 l-703 3 0 -1501z
+m1338 1165 c168 -40 275 -152 301 -316 14 -81 14 -236 1 -314 -13 -80 -61
+-174 -111 -220 -54 -49 -148 -92 -229 -104 -38 -6 -249 -11 -502 -11 l-438 0
+0 490 0 490 458 0 c368 0 469 -3 520 -15z m70 -1290 c181 -43 299 -162 332
+-334 13 -69 13 -302 0 -371 -32 -171 -153 -293 -331 -335 -52 -12 -153 -15
+-556 -15 l-493 0 0 535 0 535 493 0 c401 0 504 -3 555 -15z"/>
+<path d="M10670 7500 l0 -1500 175 0 175 0 0 1260 c0 1008 3 1260 13 1260 7 0
+56 -89 110 -197 132 -266 860 -1603 869 -1595 19 20 739 1344 844 1555 68 136
+129 247 134 247 7 0 10 -432 10 -1265 l0 -1265 175 0 175 0 0 1500 0 1500
+-236 -2 -236 -3 -431 -808 c-238 -444 -436 -806 -440 -804 -4 1 -200 364 -436
+807 l-428 805 -237 3 -236 2 0 -1500z"/>
+<path d="M19753 8300 c-302 -38 -545 -182 -702 -413 -238 -350 -268 -982 -67
+-1393 136 -276 360 -454 656 -519 103 -22 324 -30 433 -16 478 64 790 387 872
+901 22 140 22 400 0 540 -65 408 -282 704 -611 832 -42 16 -116 38 -163 49
+-101 22 -314 32 -418 19z m338 -533 c96 -46 163 -134 194 -254 19 -72 22 -670
+4 -755 -43 -204 -210 -325 -423 -305 -143 13 -241 79 -301 200 -50 102 -58
+179 -53 529 4 268 6 299 26 360 29 85 76 153 136 195 74 51 125 63 251 60 96
+-3 117 -6 166 -30z"/>
+<path d="M21393 7443 c3 -783 4 -822 24 -908 60 -262 172 -424 356 -515 115
+-57 202 -73 357 -67 98 4 142 10 206 31 156 50 279 158 355 311 23 47 46 85
+51 85 4 0 8 -85 8 -190 l0 -190 315 0 315 0 0 1130 0 1130 -315 0 -315 0 0
+-753 c0 -826 1 -811 -60 -894 -66 -89 -195 -145 -340 -146 -158 -1 -251 66
+-301 218 -10 31 -15 206 -19 805 l-5 765 -318 3 -318 2 4 -817z"/>
+</g>
+</svg>
diff --git a/icons/scala.svg b/icons/scala.svg
new file mode 100644
index 000000000..80c5b9990
--- /dev/null
+++ b/icons/scala.svg
@@ -0,0 +1 @@
+<svg width="48" height="48" enable-background="new 0 0 2000 750" version="1.1" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1.25,0,0,-1.25,0,750)"><g transform="matrix(.1059 0 0 .1059 -30.649 546.7)"><linearGradient id="path2432_1_" x1="550.94" x2="554.04" y1="-16.914" y2="-16.914" gradientTransform="matrix(90 0 0 -90 -49226 -1256.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#444" offset="0"/><stop offset="1"/></linearGradient><path d="m359.29 280.16v-27.892c0-4.702 101.44-12.576 167.53-27.893 31.926 7.402 55.61 16.534 55.61 27.893v27.892c0 11.351-23.684 20.493-55.61 27.892-66.089-15.319-167.53-23.195-167.53-27.892" fill="url(#path2432_1_)"/></g><g transform="matrix(.1059 0 0 .1059 -30.649 546.7)"><linearGradient id="path2452_1_" x1="550.94" x2="554.04" y1="-17.754" y2="-17.754" gradientTransform="matrix(90 0 0 -90 -49226 -1220.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#444" offset="0"/><stop offset="1"/></linearGradient><path d="m359.29 391.73v-27.893c0-4.702 101.44-12.576 167.53-27.892 31.926 7.399 55.61 16.534 55.61 27.892v27.893c0 11.352-23.684 20.492-55.61 27.892-66.089-15.319-167.53-23.195-167.53-27.892" fill="url(#path2452_1_)"/></g><g transform="matrix(.1059 0 0 .1059 -30.649 546.7)"><linearGradient id="path2572_1_" x1="550.94" x2="554.04" y1="-17.334" y2="-17.334" gradientTransform="matrix(90 0 0 -90 -49226 -1238.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#A61214" offset="0"/><stop stop-color="#D82023" offset="1"/></linearGradient><path d="m359.29 335.95v-83.676c0 6.973 223.14 20.919 223.14 55.784v83.677c0-34.865-223.14-48.811-223.14-55.785" fill="url(#path2572_1_)"/></g><g transform="matrix(.1059 0 0 .1059 -30.649 546.7)"><linearGradient id="path2592_1_" x1="550.94" x2="554.04" y1="-18.174" y2="-18.174" gradientTransform="matrix(90 0 0 -90 -49226 -1202.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#A61214" offset="0"/><stop stop-color="#D82023" offset="1"/></linearGradient><path d="m359.29 447.52v-83.677c0 6.973 223.14 20.92 223.14 55.785v83.676c0-34.866-223.14-48.812-223.14-55.784" fill="url(#path2592_1_)"/></g><g transform="matrix(.1059 0 0 .1059 -30.649 546.7)"><linearGradient id="path2712_1_" x1="550.94" x2="554.04" y1="-16.494" y2="-16.494" gradientTransform="matrix(90 0 0 -90 -49226 -1274.1)" gradientUnits="userSpaceOnUse"><stop stop-color="#A61214" offset="0"/><stop stop-color="#D82023" offset="1"/></linearGradient><path d="m359.29 224.38v-83.677c0 6.973 223.14 20.92 223.14 55.784v83.677c0-34.865-223.14-48.811-223.14-55.784" fill="url(#path2712_1_)"/></g></g></svg>
diff --git a/icons/tencentcloud.svg b/icons/tencentcloud.svg
new file mode 100644
index 000000000..af729a46c
--- /dev/null
+++ b/icons/tencentcloud.svg
@@ -0,0 +1,29 @@
+<?xml version="1.0" encoding="UTF-8"?>
+<svg width="408px" height="408px" viewBox="0 0 408 408" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
+    <!-- Generator: Sketch 64 (93537) - https://sketch.com -->
+    <title>矩形</title>
+    <desc>Created with Sketch.</desc>
+    <g id="CI" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
+        <g id="子步骤状态" transform="translate(-3765.000000, -1220.000000)" fill-rule="nonzero">
+            <g id="编组-21" transform="translate(3765.000000, 1220.000000)">
+                <g id="资源-1" transform="translate(59.000000, 6.000000)">
+                    <polygon id="路径" fill="#000000" points="9.86 258.979338 9.86 264.595013 27.69 264.595013 27.69 310.448041 33.86 310.448041 33.86 264.595013 51.69 264.595013 51.69 258.979338"></polygon>
+                    <path d="M162.600098,300.992163 C162.602922,300.8445 162.517305,300.709318 162.382359,300.64853 C162.247414,300.587742 162.08913,300.613055 161.98,300.712875 C158.486262,303.659231 154.135693,305.407619 149.57,305.700153 C141.29,305.700153 135.94,300.164275 135.94,291.596132 C135.94,283.02799 141.29,277.482137 149.57,277.482137 C152.13,277.482137 157.79,278.200305 161.99,281.811094 C162.100984,281.905507 162.257223,281.92607 162.38896,281.8636 C162.520697,281.801131 162.603343,281.667289 162.600098,281.521832 L162.600098,275.896183 C158.574082,273.414902 153.969533,272.022614 149.24,271.856489 C137.81,271.856489 130.12,279.836132 130.12,291.636031 C130.12,303.435929 137.81,311.405598 149.24,311.405598 C154.005805,311.464668 158.672975,310.04996 162.600098,307.355929 L162.600098,300.992163 Z" id="路径" fill="#000000"></path>
+                    <path d="M81.94,299.775267 C81.9415062,299.614539 81.8385478,299.471323 81.6854452,299.421178 C81.5323427,299.371034 81.3643097,299.425494 81.27,299.555827 C78.52,303.156641 71.96,306.069211 67.93,306.069211 C64.08,306.069211 60.45,304.802443 58.47,302.757659 C56.0642711,300.227376 54.7469768,296.858385 54.8,293.371603 L83.66,293.371603 L83.66,292.932723 C83.66,284.813435 82.28,280.205191 78.72,276.514606 C75.72,273.422494 71.65,271.856489 66.55,271.856489 C55.75,271.856489 48.77,279.566819 48.77,291.516336 C49.17,303.944631 56.25,311.355725 67.71,311.355725 C72.9708836,311.398409 78.0536497,309.456696 81.94,305.919593 L81.94,299.775267 Z M77.83,288.085089 L54.83,288.085089 L54.83,287.965394 C55.2183231,281.904498 60.3017935,277.211182 66.39,277.292621 C73.11,277.292621 77.5,281.402137 77.82,288.015267 L77.83,288.085089 Z" id="形状" fill="#000000"></path>
+                    <path d="M107.92,271.856489 C103.2,271.856489 99.19,273.432468 96.51,276.325089 L96.51,272.7143 L90.68,272.7143 L90.68,310.517863 L96.68,310.517863 L96.68,288.972824 C96.68,285.421883 97.77,282.399593 99.75,280.464529 C101.87779,278.359934 104.8103,277.269853 107.8,277.472163 C112.47,277.611807 117.19,280.693944 117.19,287.267176 L117.19,310.477964 L123.19,310.477964 L123.19,287.027786 C123.19,282.369669 121.71,278.489567 118.9,275.806412 C115.904809,273.098035 111.958826,271.678515 107.92,271.856489 L107.92,271.856489 Z" id="路径" fill="#000000"></path>
+                    <path d="M201.54,299.775267 C201.534544,299.615728 201.429461,299.476697 201.277193,299.427559 C201.124924,299.378421 200.95811,299.429709 200.86,299.555827 C198.12,303.156641 191.56,306.069211 187.53,306.069211 C183.67,306.069211 180.05,304.802443 178.07,302.757659 C175.657868,300.230709 174.336453,296.860361 174.39,293.371603 L203.26,293.371603 L203.26,292.932723 C203.26,284.813435 201.87,280.205191 198.31,276.514606 C195.31,273.422494 191.25,271.856489 186.15,271.856489 C175.35,271.856489 168.37,279.566819 168.37,291.516336 C168.76,303.944631 175.84,311.355725 187.31,311.355725 C192.570884,311.398409 197.65365,309.456696 201.54,305.919593 L201.54,299.775267 Z M197.43,288.085089 L174.38,288.085089 L174.38,287.965394 C174.769312,281.881016 179.888753,277.178896 186,277.292621 C192.73,277.292621 197.11,281.402137 197.44,288.015267 L197.43,288.085089 Z" id="形状" fill="#000000"></path>
+                    <path d="M227.42,271.856489 C222.7,271.856489 218.69,273.432468 216.01,276.325089 L216.01,272.7143 L210.18,272.7143 L210.18,310.517863 L216.18,310.517863 L216.18,288.972824 C216.18,285.421883 217.27,282.399593 219.25,280.464529 C221.365949,278.373398 224.277294,277.284422 227.25,277.472163 C231.92,277.611807 236.64,280.693944 236.64,287.267176 L236.64,310.477964 L242.64,310.477964 L242.64,287.027786 C242.64,282.369669 241.16,278.489567 238.35,275.806412 C235.366188,273.112284 231.441441,271.693944 227.42,271.856489 L227.42,271.856489 Z" id="路径" fill="#000000"></path>
+                    <path d="M262.1,311.01659 C264.752334,310.771362 267.361123,310.181183 269.86,309.261069 L269.86,303.565598 C269.86,303.44641 269.802293,303.334559 269.705058,303.265283 C269.607824,303.196006 269.483033,303.177833 269.37,303.216489 C267.285785,303.953815 265.150024,304.537238 262.98,304.962036 C262.35,305.061781 261.81,305.151552 261.4,304.802443 C261.078204,304.492509 260.925614,304.04704 260.99,303.605496 L260.99,278.21028 L271.9,278.21028 L271.9,272.704326 L261,272.704326 L261,262.64 L254.8,262.64 L254.8,272.704326 L248.59,272.704326 L248.59,278.21028 L254.8,278.21028 L254.8,304.223919 C254.67187,306.147035 255.404207,308.028006 256.8,309.360814 C258.30623,310.536846 260.190306,311.125451 262.1,311.01659 Z" id="路径" fill="#000000"></path>
+                    <path d="M94.75,377.457099 C94.7579836,377.299566 94.6647125,377.154386 94.5178864,377.095805 C94.3710602,377.037224 94.2031394,377.078193 94.1,377.197761 C89.4165254,382.525687 82.6737991,385.603551 75.57,385.656183 C63.63,385.656183 55.93,377.427176 55.93,364.709618 C55.93,351.742697 63.27,343.683257 75.1,343.683257 C81.9768429,343.81517 88.5395976,346.579298 93.43,351.403562 C93.534689,351.515069 93.6974325,351.550715 93.8393274,351.493217 C93.9812224,351.435718 94.072935,351.296963 94.07,351.144224 L94.07,344.580967 C88.7903924,340.040322 82.0410497,337.560049 75.07,337.598332 C67.65,337.598332 61.36,340.182188 56.89,345.079695 C52.42,349.977201 50.12,356.710025 50.12,364.679695 C50.12,380.868397 60.34,391.760611 75.55,391.760611 C82.6072831,391.809123 89.4352359,389.263145 94.73,384.608855 L94.75,377.457099 Z" id="路径" fill="#000000"></path>
+                    <path d="M231.41,356.560407 C228.21,353.109211 222.88,351.862392 219.04,351.862392 C214.142993,351.748518 209.424203,353.696402 206.04,357.228702 C202.72,360.789618 200.96,365.736997 200.96,371.522239 C200.96,385.247226 210.1,391.391552 219.15,391.391552 C224.44,391.391552 228.8,389.506361 231.37,386.17486 L231.37,390.523766 L237.52,390.523766 L237.52,339.055064 L231.37,339.055064 L231.41,356.560407 Z M231.24,371.661883 C231.24,378.693944 227.15,385.805802 219.34,385.805802 C213.47,385.805802 207.15,381.46687 207.15,371.96112 C207.15,364.978931 210.85,357.448142 218.97,357.448142 C228,357.448142 231.24,365.068702 231.24,371.661883 Z" id="形状" fill="#000000"></path>
+                    <rect id="矩形" fill="#000000" x="102.92" y="339.055064" width="6.25" height="51.4587277"></rect>
+                    <path d="M187.86,371.96112 C187.86,382.204987 181.94,385.8457 176.86,385.8457 C171.94,385.8457 166.71,382.454351 166.71,376.160407 L166.71,352.740153 L160.84,352.740153 L160.84,376.040712 C160.84,385.067684 167.3,391.381578 176.56,391.381578 C181.69,391.381578 185.69,389.65598 188.23,386.3943 L188.23,390.513791 L193.83,390.513791 L193.83,352.740153 L187.83,352.740153 L187.86,371.96112 Z" id="路径" fill="#000000"></path>
+                    <path d="M135.71,351.932214 C124.71,351.932214 117.33,359.861985 117.33,371.661883 C117.33,383.461781 124.72,391.391552 135.71,391.391552 C146.7,391.391552 154.09,383.461781 154.09,371.661883 C154.09,359.861985 146.7,351.932214 135.71,351.932214 Z M123,371.621985 L123,371.621985 C123,363.253333 128.12,357.657608 135.68,357.657608 C143.24,357.657608 148.36,363.303206 148.36,371.691807 C148.36,380.080407 143.26,385.726005 135.68,385.726005 C128.1,385.726005 123,380.030534 123,371.621985 Z" id="形状" fill="#000000"></path>
+                    <path d="M273.69,96.2145547 C260.970259,83.2015251 243.520752,75.8639726 225.3,75.8664625 C208.87,75.8664625 194.72,81.5120611 182.37,91.5564377 C176.98,95.9252926 171.37,101.161934 164.23,108.044377 L58.37,210.463104 C64.7799695,211.19146 71.2288914,211.524578 77.68,211.46056 C83.85,211.46056 201.42,211.46056 206.34,211.46056 C216.25,211.46056 222.7,211.46056 229.62,210.951858 C245.5,209.794809 260.51,203.969669 272.62,192.099949 C285.532064,179.516901 292.898223,162.329189 293.095179,144.324509 C293.292136,126.319828 286.303726,108.975887 273.67,96.1148092 M254,173.218117 C248.78,178.374962 239.46,184.190127 224.18,184.748702 C217.12,184.988092 208.87,185.008041 205.09,185.008041 L123,185.008041 L181.9,127.953588 C184.61,125.33028 190.7,119.515115 195.95,114.79715 C207.48,104.443562 217.87,102.35888 225.21,102.418728 C242.031016,102.439436 257.164758,112.61703 263.491331,128.16331 C269.817905,143.709589 266.077561,161.528973 254.03,173.238066" id="形状" fill="#00A1FF"></path>
+                    <path d="M108.58,89.8408142 C96.58,80.863715 83.09,75.8764377 67.82,75.8764377 C40.2140733,75.9574907 15.3968291,92.6778459 5.01348954,118.191658 C-5.36985,143.70547 0.741557328,172.948864 20.48,192.199695 C30.7776083,202.2428 44.0823459,208.655834 58.37,210.463104 L84.72,184.968142 C80.45,184.968142 74.34,184.878372 68.91,184.708804 C53.64,184.180153 44.33,178.335064 39.11,173.188193 C27.0650269,161.481639 23.3234368,143.667105 29.6448761,128.122656 C35.9663154,112.578206 51.0926265,102.397656 67.91,102.368855 C75.13,102.368855 84.91,104.423613 95.97,113.57028 C101.25,117.939135 112.97,128.212926 118.11,132.84112 C118.2264,132.958072 118.384783,133.023847 118.55,133.023847 C118.715217,133.023847 118.8736,132.958072 118.99,132.84112 L137.14,115.186158 C137.291999,115.06502 137.3805,114.881494 137.3805,114.68743 C137.3805,114.493367 137.291999,114.30984 137.14,114.188702 C128.41,106.318779 116.05,95.3068702 108.6,89.7809669" id="路径" fill="#00C4D6"></path>
+                    <path d="M232.43,60.5455471 C218.513105,21.3349352 179.678777,-3.44192042 138.155364,0.396982225 C96.6319507,4.23588487 63.0246852,35.7100758 56.57,76.8040712 C60.2876467,76.1825044 64.0504894,75.868898 67.82,75.8664631 C72.993426,75.8524349 78.1499931,76.4551825 83.18,77.661883 L83.47,77.661883 C89.1701919,50.5078467 111.696216,30.0675628 139.335847,26.9687933 C166.975478,23.8700239 193.488629,38.8123653 205.09,64.0266667 C205.131779,64.1725921 205.230313,64.295801 205.363665,64.3688647 C205.497018,64.4419284 205.654121,64.4587822 205.8,64.4156743 C214.165555,62.1093392 222.85788,61.2092827 231.52,61.7524682 C232.38,61.8123155 232.71,61.3335369 232.43,60.5455471" id="路径" fill="#006EFF"></path>
+                </g>
+            </g>
+        </g>
+    </g>
+</svg>
\ No newline at end of file
diff --git a/icons/terraform.svg b/icons/terraform.svg
new file mode 100644
index 000000000..718fc0f4e
--- /dev/null
+++ b/icons/terraform.svg
@@ -0,0 +1 @@
+<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title"><title id="title">terraform-icon logo</title><path fill-rule="evenodd" clip-rule="evenodd" d="M16.664 7.384l10.468 6.042v12.085L16.664 19.47V7.384z" fill="#623CE4"/><path fill-rule="evenodd" clip-rule="evenodd" d="M28.277 13.426v12.085l10.468-6.042V7.379l-10.468 6.047z" fill="#3C2AA8"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5.047.634v12.085l10.468 6.048V6.677L5.047.633zM16.664 32.878l10.463 6.048v-12.09l-10.463-6.043v12.085z" fill="#623CE4"/></svg>
\ No newline at end of file
diff --git a/script/sync-ghes/exec.ts b/script/sync-ghes/exec.ts
new file mode 100644
index 000000000..e5293246c
--- /dev/null
+++ b/script/sync-ghes/exec.ts
@@ -0,0 +1,42 @@
+import { spawn } from "child_process";
+
+export class ExecResult {
+  stdout = "";
+  exitCode = 0;
+}
+
+/**
+ * Executes a process
+ */
+export async function exec(
+  command: string,
+  args: string[] = [],
+  allowAllExitCodes: boolean = false
+): Promise<ExecResult> {
+  process.stdout.write(`EXEC: ${command} ${args.join(" ")}\n`);
+  return new Promise((resolve, reject) => {
+    const execResult = new ExecResult();
+    const cp = spawn(command, args, {});
+
+    // STDOUT
+    cp.stdout.on("data", (data) => {
+      process.stdout.write(data);
+      execResult.stdout += data.toString();
+    });
+
+    // STDERR
+    cp.stderr.on("data", (data) => {
+      process.stderr.write(data);
+    });
+
+    // Close
+    cp.on("close", (code) => {
+      execResult.exitCode = code;
+      if (code === 0 || allowAllExitCodes) {
+        resolve(execResult);
+      } else {
+        reject(new Error(`Command exited with code ${code}`));
+      }
+    });
+  });
+}
diff --git a/script/sync-ghes/index.ts b/script/sync-ghes/index.ts
new file mode 100755
index 000000000..5390664a2
--- /dev/null
+++ b/script/sync-ghes/index.ts
@@ -0,0 +1,169 @@
+#!/usr/bin/env npx ts-node
+import { promises as fs } from "fs";
+import { safeLoad } from "js-yaml";
+import { basename, extname, join } from "path";
+import { exec } from "./exec";
+
+interface WorkflowDesc {
+  folder: string;
+  id: string;
+  iconName?: string;
+  iconType?: "svg" | "octicon";
+}
+
+interface WorkflowsCheckResult {
+  compatibleWorkflows: WorkflowDesc[];
+  incompatibleWorkflows: WorkflowDesc[];
+}
+
+async function checkWorkflows(
+  folders: string[],
+  enabledActions: string[]
+): Promise<WorkflowsCheckResult> {
+  const result: WorkflowsCheckResult = {
+    compatibleWorkflows: [],
+    incompatibleWorkflows: [],
+  };
+
+  for (const folder of folders) {
+    const dir = await fs.readdir(folder, {
+      withFileTypes: true,
+    });
+
+    for (const e of dir) {
+      if (e.isFile()) {
+        const workflowFilePath = join(folder, e.name);
+        const enabled = await checkWorkflow(workflowFilePath, enabledActions);
+
+        const workflowId = basename(e.name, extname(e.name));
+        const workflowProperties = require(join(
+          folder,
+          "properties",
+          `${workflowId}.properties.json`
+        ));
+        const iconName: string | undefined = workflowProperties["iconName"];
+
+        const workflowDesc: WorkflowDesc = {
+          folder,
+          id: workflowId,
+          iconName,
+          iconType:
+            iconName && iconName.startsWith("octicon") ? "octicon" : "svg",
+        };
+
+        if (!enabled) {
+          result.incompatibleWorkflows.push(workflowDesc);
+        } else {
+          result.compatibleWorkflows.push(workflowDesc);
+        }
+      }
+    }
+  }
+
+  return result;
+}
+
+/**
+ * Check if a workflow uses only the given set of actions.
+ *
+ * @param workflowPath Path to workflow yaml file
+ * @param enabledActions List of enabled actions
+ */
+async function checkWorkflow(
+  workflowPath: string,
+  enabledActions: string[]
+): Promise<boolean> {
+  // Create set with lowercase action names for easier, case-insensitive lookup
+  const enabledActionsSet = new Set(enabledActions.map((x) => x.toLowerCase()));
+
+  try {
+    const workflowFileContent = await fs.readFile(workflowPath, "utf8");
+    const workflow = safeLoad(workflowFileContent);
+
+    for (const job of Object.keys(workflow.jobs || {}).map(
+      (k) => workflow.jobs[k]
+    )) {
+      for (const step of job.steps || []) {
+        if (!!step.uses) {
+          // Check if allowed action
+          const [actionName, _] = step.uses.split("@");
+          if (!enabledActionsSet.has(actionName.toLowerCase())) {
+            console.info(
+              `Workflow ${workflowPath} uses '${actionName}' which is not supported for GHES.`
+            );
+            return false;
+          }
+        }
+      }
+    }
+
+    // All used actions are enabled 🎉
+    return true;
+  } catch (e) {
+    console.error("Error while checking workflow", e);
+    throw e;
+  }
+}
+
+(async function main() {
+  try {
+    const settings = require("./settings.json");
+
+    const result = await checkWorkflows(
+      settings.folders,
+      settings.enabledActions
+    );
+
+    console.group(
+      `Found ${result.compatibleWorkflows.length} starter workflows compatible with GHES:`
+    );
+    console.log(
+      result.compatibleWorkflows.map((x) => `${x.folder}/${x.id}`).join("\n")
+    );
+    console.groupEnd();
+
+    console.group(
+      `Ignored ${result.incompatibleWorkflows.length} starter-workflows incompatible with GHES:`
+    );
+    console.log(
+      result.incompatibleWorkflows.map((x) => `${x.folder}/${x.id}`).join("\n")
+    );
+    console.groupEnd();
+
+    console.log("Switch to GHES branch");
+    await exec("git", ["checkout", "ghes"]);
+
+    // In order to sync from master, we might need to remove some workflows, add some
+    // and modify others. The lazy approach is to delete all workflows first, and then
+    // just bring the compatible ones over from the master branch. We let git figure out
+    // whether it's a deletion, add, or modify and commit the new state.
+    console.log("Remove all workflows");
+    await exec("rm", ["-fr", ...settings.folders]);
+    await exec("rm", ["-fr", "../../icons"]);
+
+    console.log("Sync changes from master for compatible workflows");
+    await exec("git", [
+      "checkout",
+      "master",
+      "--",
+      ...Array.prototype.concat.apply(
+        [],
+        result.compatibleWorkflows.map((x) => {
+          const r = [
+            join(x.folder, `${x.id}.yml`),
+            join(x.folder, "properties", `${x.id}.properties.json`),
+          ];
+
+          if (x.iconType === "svg") {
+            r.push(join("../../icons", `${x.iconName}.svg`));
+          }
+
+          return r;
+        })
+      ),
+    ]);
+  } catch (e) {
+    console.error("Unhandled error while syncing workflows", e);
+    process.exitCode = 1;
+  }
+})();
diff --git a/script/sync-ghes/package-lock.json b/script/sync-ghes/package-lock.json
new file mode 100644
index 000000000..ebcd31806
--- /dev/null
+++ b/script/sync-ghes/package-lock.json
@@ -0,0 +1,112 @@
+{
+  "name": "sync-ghes-actions",
+  "version": "1.0.0",
+  "lockfileVersion": 1,
+  "requires": true,
+  "dependencies": {
+    "@types/js-yaml": {
+      "version": "3.12.4",
+      "resolved": "https://registry.npmjs.org/@types/js-yaml/-/js-yaml-3.12.4.tgz",
+      "integrity": "sha512-fYMgzN+9e28R81weVN49inn/u798ruU91En1ZnGvSZzCRc5jXx9B2EDhlRaWmcO1RIxFHL8AajRXzxDuJu93+A==",
+      "dev": true
+    },
+    "@types/node": {
+      "version": "14.0.1",
+      "resolved": "https://registry.npmjs.org/@types/node/-/node-14.0.1.tgz",
+      "integrity": "sha512-FAYBGwC+W6F9+huFIDtn43cpy7+SzG+atzRiTfdp3inUKL2hXnd4rG8hylJLIh4+hqrQy1P17kvJByE/z825hA==",
+      "dev": true
+    },
+    "arg": {
+      "version": "4.1.3",
+      "resolved": "https://registry.npmjs.org/arg/-/arg-4.1.3.tgz",
+      "integrity": "sha512-58S9QDqG0Xx27YwPSt9fJxivjYl432YCwfDMfZ+71RAqUrZef7LrKQZ3LHLOwCS4FLNBplP533Zx895SeOCHvA==",
+      "dev": true
+    },
+    "argparse": {
+      "version": "1.0.10",
+      "resolved": "https://registry.npmjs.org/argparse/-/argparse-1.0.10.tgz",
+      "integrity": "sha512-o5Roy6tNG4SL/FOkCAN6RzjiakZS25RLYFrcMttJqbdd8BWrnA+fGz57iN5Pb06pvBGvl5gQ0B48dJlslXvoTg==",
+      "requires": {
+        "sprintf-js": "~1.0.2"
+      }
+    },
+    "buffer-from": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.1.tgz",
+      "integrity": "sha512-MQcXEUbCKtEo7bhqEs6560Hyd4XaovZlO/k9V3hjVUF/zwW7KBVdSK4gIt/bzwS9MbR5qob+F5jusZsb0YQK2A==",
+      "dev": true
+    },
+    "diff": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/diff/-/diff-4.0.2.tgz",
+      "integrity": "sha512-58lmxKSA4BNyLz+HHMUzlOEpg09FV+ev6ZMe3vJihgdxzgcwZ8VoEEPmALCZG9LmqfVoNMMKpttIYTVG6uDY7A==",
+      "dev": true
+    },
+    "esprima": {
+      "version": "4.0.1",
+      "resolved": "https://registry.npmjs.org/esprima/-/esprima-4.0.1.tgz",
+      "integrity": "sha512-eGuFFw7Upda+g4p+QHvnW0RyTX/SVeJBDM/gCtMARO0cLuT2HcEKnTPvhjV6aGeqrCB/sbNop0Kszm0jsaWU4A=="
+    },
+    "js-yaml": {
+      "version": "3.13.1",
+      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-3.13.1.tgz",
+      "integrity": "sha512-YfbcO7jXDdyj0DGxYVSlSeQNHbD7XPWvrVWeVUujrQEoZzWJIRrCPoyk6kL6IAjAG2IolMK4T0hNUe0HOUs5Jw==",
+      "requires": {
+        "argparse": "^1.0.7",
+        "esprima": "^4.0.0"
+      }
+    },
+    "make-error": {
+      "version": "1.3.6",
+      "resolved": "https://registry.npmjs.org/make-error/-/make-error-1.3.6.tgz",
+      "integrity": "sha512-s8UhlNe7vPKomQhC1qFelMokr/Sc3AgNbso3n74mVPA5LTZwkB9NlXf4XPamLxJE8h0gh73rM94xvwRT2CVInw==",
+      "dev": true
+    },
+    "source-map": {
+      "version": "0.6.1",
+      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
+      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
+      "dev": true
+    },
+    "source-map-support": {
+      "version": "0.5.19",
+      "resolved": "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.19.tgz",
+      "integrity": "sha512-Wonm7zOCIJzBGQdB+thsPar0kYuCIzYvxZwlBa87yi/Mdjv7Tip2cyVbLj5o0cFPN4EVkuTwb3GDDyUx2DGnGw==",
+      "dev": true,
+      "requires": {
+        "buffer-from": "^1.0.0",
+        "source-map": "^0.6.0"
+      }
+    },
+    "sprintf-js": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/sprintf-js/-/sprintf-js-1.0.3.tgz",
+      "integrity": "sha1-BOaSb2YolTVPPdAVIDYzuFcpfiw="
+    },
+    "ts-node": {
+      "version": "8.10.1",
+      "resolved": "https://registry.npmjs.org/ts-node/-/ts-node-8.10.1.tgz",
+      "integrity": "sha512-bdNz1L4ekHiJul6SHtZWs1ujEKERJnHs4HxN7rjTyyVOFf3HaJ6sLqe6aPG62XTzAB/63pKRh5jTSWL0D7bsvw==",
+      "dev": true,
+      "requires": {
+        "arg": "^4.1.0",
+        "diff": "^4.0.1",
+        "make-error": "^1.1.1",
+        "source-map-support": "^0.5.17",
+        "yn": "3.1.1"
+      }
+    },
+    "typescript": {
+      "version": "3.9.2",
+      "resolved": "https://registry.npmjs.org/typescript/-/typescript-3.9.2.tgz",
+      "integrity": "sha512-q2ktq4n/uLuNNShyayit+DTobV2ApPEo/6so68JaD5ojvc/6GClBipedB9zNWYxRSAlZXAe405Rlijzl6qDiSw==",
+      "dev": true
+    },
+    "yn": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/yn/-/yn-3.1.1.tgz",
+      "integrity": "sha512-Ux4ygGWsu2c7isFWe8Yu1YluJmqVhxqK2cLXNQA5AcC3QfbGNpM7fu0Y8b/z16pXLnFxZYvWhd3fhBY9DLmC6Q==",
+      "dev": true
+    }
+  }
+}
diff --git a/script/sync-ghes/package.json b/script/sync-ghes/package.json
new file mode 100644
index 000000000..c3c987245
--- /dev/null
+++ b/script/sync-ghes/package.json
@@ -0,0 +1,19 @@
+{
+  "name": "sync-ghes-actions",
+  "version": "1.0.0",
+  "main": "index.ts",
+  "scripts": {
+    "test": "echo \"Error: no test specified\" && exit 1"
+  },
+  "author": "github/c2c-actions-experience",
+  "license": "MIT",
+  "devDependencies": {
+    "@types/js-yaml": "^3.12.4",
+    "@types/node": "^14.0.1",
+    "ts-node": "^8.10.1",
+    "typescript": "^3.9.2"
+  },
+  "dependencies": {
+    "js-yaml": "^3.13.1"
+  }
+}
diff --git a/script/sync-ghes/settings.json b/script/sync-ghes/settings.json
new file mode 100644
index 000000000..050ea0a74
--- /dev/null
+++ b/script/sync-ghes/settings.json
@@ -0,0 +1,20 @@
+{
+  "folders": [
+    "../../ci",
+    "../../automation"
+  ],
+  "enabledActions": [
+    "actions/checkout",
+    "actions/create-release",
+    "actions/delete-package-versions",
+    "actions/download-artifact",
+    "actions/setup-dotnet",
+    "actions/setup-go",
+    "actions/setup-java",
+    "actions/setup-node",
+    "actions/stale",
+    "actions/starter-workflows",
+    "actions/upload-artifact",
+    "actions/upload-release-asset"
+  ]
+}
diff --git a/script/sync-ghes/tsconfig.json b/script/sync-ghes/tsconfig.json
new file mode 100644
index 000000000..7c50a205d
--- /dev/null
+++ b/script/sync-ghes/tsconfig.json
@@ -0,0 +1,5 @@
+{
+  "compilerOptions": {
+  },
+  "include": ["*.ts"]
+}
\ No newline at end of file
diff --git a/script/validate-data/index.ts b/script/validate-data/index.ts
new file mode 100755
index 000000000..dbea11344
--- /dev/null
+++ b/script/validate-data/index.ts
@@ -0,0 +1,118 @@
+#!/usr/bin/env npx ts-node
+import { promises as fs } from "fs";
+import { safeLoad } from "js-yaml";
+import { basename, extname, join } from "path";
+import { Validator as validator } from "jsonschema";
+import { endGroup, error, info, setFailed, startGroup } from '@actions/core';
+
+interface WorkflowWithErrors {
+  id: string;
+  errors: string[];
+}
+
+interface WorkflowProperties {
+  name: string;
+  description: string;
+  iconName: string;
+  categories: string[];
+}
+
+const propertiesSchema = {
+  type: "object",
+  properties: {
+    name: { type: "string", required: true },
+    description: { type: "string", required: true },
+    iconName: { type: "string", required: true },
+    categories: {
+      anyOf: [
+        {
+          type: "array",
+          items: { type: "string" }
+        },
+        {
+          type: "null",
+        }
+      ],
+      required: true
+    },
+  }
+}
+
+async function checkWorkflows(folders: string[]): Promise<WorkflowWithErrors[]> {
+  const result: WorkflowWithErrors[] = []
+
+  for (const folder of folders) {
+    const dir = await fs.readdir(folder, {
+      withFileTypes: true,
+    });
+
+    for (const e of dir) {
+      if (e.isFile()) {
+        const fileType = basename(e.name, extname(e.name))
+
+        const workflowFilePath = join(folder, e.name);
+        const propertiesFilePath = join(folder, "properties", `${fileType}.properties.json`)
+
+        const errors = await checkWorkflow(workflowFilePath, propertiesFilePath);
+        if (errors.errors.length > 0) {
+          result.push(errors)
+        }
+      }
+    }
+  }
+
+  return result;
+}
+
+async function checkWorkflow(workflowPath: string, propertiesPath: string): Promise<WorkflowWithErrors> {
+  let workflowErrors: WorkflowWithErrors = {
+    id: workflowPath,
+    errors: []
+  }
+
+  try {
+    const workflowFileContent = await fs.readFile(workflowPath, "utf8");
+    safeLoad(workflowFileContent); // Validate yaml parses without error
+
+    const propertiesFileContent = await fs.readFile(propertiesPath, "utf8")
+    const properties: WorkflowProperties = JSON.parse(propertiesFileContent)
+
+    let v = new validator();
+    const res = v.validate(properties, propertiesSchema)
+    workflowErrors.errors = res.errors.map(e => e.toString())
+
+    if (properties.iconName && !properties.iconName.startsWith("octicon")) {
+      try {
+        await fs.access(`../../icons/${properties.iconName}.svg`)
+      } catch (e) {
+        workflowErrors.errors.push(`No icon named ${properties.iconName} found`)
+      }
+    }
+  } catch (e) {
+    workflowErrors.errors.push(e.toString())
+  }
+  return workflowErrors;
+}
+
+(async function main() {
+  try {
+    const settings = require("./settings.json");
+    const erroredWorkflows = await checkWorkflows(
+      settings.folders
+    )
+
+    if (erroredWorkflows.length > 0) {
+      startGroup(`😟 - Found ${erroredWorkflows.length} workflows with errors:`);
+      erroredWorkflows.forEach(erroredWorkflow => {
+        error(`Errors in ${erroredWorkflow.id} - ${erroredWorkflow.errors.map(e => e.toString()).join(", ")}`)
+      })
+      endGroup();
+      setFailed(`Found ${erroredWorkflows.length} workflows with errors`);
+    } else {
+      info("🎉🤘 - Found no workflows with errors!")
+    }
+  } catch (e) {
+    error(`Unhandled error while syncing workflows: ${e}`);
+    setFailed(`Unhandled error`)
+  }
+})();
diff --git a/script/validate-data/package-lock.json b/script/validate-data/package-lock.json
new file mode 100644
index 000000000..110d23fbb
--- /dev/null
+++ b/script/validate-data/package-lock.json
@@ -0,0 +1,122 @@
+{
+  "name": "sync-ghes-actions",
+  "version": "1.0.0",
+  "lockfileVersion": 1,
+  "requires": true,
+  "dependencies": {
+    "@actions/core": {
+      "version": "1.2.4",
+      "resolved": "https://registry.npmjs.org/@actions/core/-/core-1.2.4.tgz",
+      "integrity": "sha512-YJCEq8BE3CdN8+7HPZ/4DxJjk/OkZV2FFIf+DlZTC/4iBlzYCD5yjRR6eiOS5llO11zbRltIRuKAjMKaWTE6cg=="
+    },
+    "@types/js-yaml": {
+      "version": "3.12.4",
+      "resolved": "https://registry.npmjs.org/@types/js-yaml/-/js-yaml-3.12.4.tgz",
+      "integrity": "sha512-fYMgzN+9e28R81weVN49inn/u798ruU91En1ZnGvSZzCRc5jXx9B2EDhlRaWmcO1RIxFHL8AajRXzxDuJu93+A==",
+      "dev": true
+    },
+    "@types/node": {
+      "version": "14.0.1",
+      "resolved": "https://registry.npmjs.org/@types/node/-/node-14.0.1.tgz",
+      "integrity": "sha512-FAYBGwC+W6F9+huFIDtn43cpy7+SzG+atzRiTfdp3inUKL2hXnd4rG8hylJLIh4+hqrQy1P17kvJByE/z825hA==",
+      "dev": true
+    },
+    "arg": {
+      "version": "4.1.3",
+      "resolved": "https://registry.npmjs.org/arg/-/arg-4.1.3.tgz",
+      "integrity": "sha512-58S9QDqG0Xx27YwPSt9fJxivjYl432YCwfDMfZ+71RAqUrZef7LrKQZ3LHLOwCS4FLNBplP533Zx895SeOCHvA==",
+      "dev": true
+    },
+    "argparse": {
+      "version": "1.0.10",
+      "resolved": "https://registry.npmjs.org/argparse/-/argparse-1.0.10.tgz",
+      "integrity": "sha512-o5Roy6tNG4SL/FOkCAN6RzjiakZS25RLYFrcMttJqbdd8BWrnA+fGz57iN5Pb06pvBGvl5gQ0B48dJlslXvoTg==",
+      "requires": {
+        "sprintf-js": "~1.0.2"
+      }
+    },
+    "buffer-from": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.1.tgz",
+      "integrity": "sha512-MQcXEUbCKtEo7bhqEs6560Hyd4XaovZlO/k9V3hjVUF/zwW7KBVdSK4gIt/bzwS9MbR5qob+F5jusZsb0YQK2A==",
+      "dev": true
+    },
+    "diff": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/diff/-/diff-4.0.2.tgz",
+      "integrity": "sha512-58lmxKSA4BNyLz+HHMUzlOEpg09FV+ev6ZMe3vJihgdxzgcwZ8VoEEPmALCZG9LmqfVoNMMKpttIYTVG6uDY7A==",
+      "dev": true
+    },
+    "esprima": {
+      "version": "4.0.1",
+      "resolved": "https://registry.npmjs.org/esprima/-/esprima-4.0.1.tgz",
+      "integrity": "sha512-eGuFFw7Upda+g4p+QHvnW0RyTX/SVeJBDM/gCtMARO0cLuT2HcEKnTPvhjV6aGeqrCB/sbNop0Kszm0jsaWU4A=="
+    },
+    "js-yaml": {
+      "version": "3.13.1",
+      "resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-3.13.1.tgz",
+      "integrity": "sha512-YfbcO7jXDdyj0DGxYVSlSeQNHbD7XPWvrVWeVUujrQEoZzWJIRrCPoyk6kL6IAjAG2IolMK4T0hNUe0HOUs5Jw==",
+      "requires": {
+        "argparse": "^1.0.7",
+        "esprima": "^4.0.0"
+      }
+    },
+    "jsonschema": {
+      "version": "1.2.6",
+      "resolved": "https://registry.npmjs.org/jsonschema/-/jsonschema-1.2.6.tgz",
+      "integrity": "sha512-SqhURKZG07JyKKeo/ir24QnS4/BV7a6gQy93bUSe4lUdNp0QNpIz2c9elWJQ9dpc5cQYY6cvCzgRwy0MQCLyqA=="
+    },
+    "make-error": {
+      "version": "1.3.6",
+      "resolved": "https://registry.npmjs.org/make-error/-/make-error-1.3.6.tgz",
+      "integrity": "sha512-s8UhlNe7vPKomQhC1qFelMokr/Sc3AgNbso3n74mVPA5LTZwkB9NlXf4XPamLxJE8h0gh73rM94xvwRT2CVInw==",
+      "dev": true
+    },
+    "source-map": {
+      "version": "0.6.1",
+      "resolved": "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
+      "integrity": "sha512-UjgapumWlbMhkBgzT7Ykc5YXUT46F0iKu8SGXq0bcwP5dz/h0Plj6enJqjz1Zbq2l5WaqYnrVbwWOWMyF3F47g==",
+      "dev": true
+    },
+    "source-map-support": {
+      "version": "0.5.19",
+      "resolved": "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.19.tgz",
+      "integrity": "sha512-Wonm7zOCIJzBGQdB+thsPar0kYuCIzYvxZwlBa87yi/Mdjv7Tip2cyVbLj5o0cFPN4EVkuTwb3GDDyUx2DGnGw==",
+      "dev": true,
+      "requires": {
+        "buffer-from": "^1.0.0",
+        "source-map": "^0.6.0"
+      }
+    },
+    "sprintf-js": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/sprintf-js/-/sprintf-js-1.0.3.tgz",
+      "integrity": "sha1-BOaSb2YolTVPPdAVIDYzuFcpfiw="
+    },
+    "ts-node": {
+      "version": "8.10.1",
+      "resolved": "https://registry.npmjs.org/ts-node/-/ts-node-8.10.1.tgz",
+      "integrity": "sha512-bdNz1L4ekHiJul6SHtZWs1ujEKERJnHs4HxN7rjTyyVOFf3HaJ6sLqe6aPG62XTzAB/63pKRh5jTSWL0D7bsvw==",
+      "dev": true,
+      "requires": {
+        "arg": "^4.1.0",
+        "diff": "^4.0.1",
+        "make-error": "^1.1.1",
+        "source-map-support": "^0.5.17",
+        "yn": "3.1.1"
+      }
+    },
+    "typescript": {
+      "version": "3.9.2",
+      "resolved": "https://registry.npmjs.org/typescript/-/typescript-3.9.2.tgz",
+      "integrity": "sha512-q2ktq4n/uLuNNShyayit+DTobV2ApPEo/6so68JaD5ojvc/6GClBipedB9zNWYxRSAlZXAe405Rlijzl6qDiSw==",
+      "dev": true
+    },
+    "yn": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/yn/-/yn-3.1.1.tgz",
+      "integrity": "sha512-Ux4ygGWsu2c7isFWe8Yu1YluJmqVhxqK2cLXNQA5AcC3QfbGNpM7fu0Y8b/z16pXLnFxZYvWhd3fhBY9DLmC6Q==",
+      "dev": true
+    }
+  }
+}
diff --git a/script/validate-data/package.json b/script/validate-data/package.json
new file mode 100644
index 000000000..a2b867d52
--- /dev/null
+++ b/script/validate-data/package.json
@@ -0,0 +1,21 @@
+{
+  "name": "validate-data",
+  "version": "1.0.0",
+  "main": "index.ts",
+  "scripts": {
+    "test": "echo \"Error: no test specified\" && exit 1"
+  },
+  "author": "github/c2c-actions-experience",
+  "license": "MIT",
+  "devDependencies": {
+    "@types/js-yaml": "^3.12.4",
+    "@types/node": "^14.0.1",
+    "ts-node": "^8.10.1",
+    "typescript": "^3.9.2"
+  },
+  "dependencies": {
+    "@actions/core": "^1.2.4",
+    "js-yaml": "^3.13.1",
+    "jsonschema": "^1.2.6"
+  }
+}
\ No newline at end of file
diff --git a/script/validate-data/settings.json b/script/validate-data/settings.json
new file mode 100644
index 000000000..1913e2fb5
--- /dev/null
+++ b/script/validate-data/settings.json
@@ -0,0 +1,6 @@
+{
+  "folders": [
+    "../../ci",
+    "../../automation"
+  ]
+}
\ No newline at end of file
diff --git a/script/validate-data/tsconfig.json b/script/validate-data/tsconfig.json
new file mode 100644
index 000000000..7c50a205d
--- /dev/null
+++ b/script/validate-data/tsconfig.json
@@ -0,0 +1,5 @@
+{
+  "compilerOptions": {
+  },
+  "include": ["*.ts"]
+}
\ No newline at end of file**'*''*'":,)
});
