# This workflow will build and push a new container image to Alibaba Cloud Container Registry (ACR),
# and then will deploy it to Alibaba Cloud Container Service for Kubernetes (ACK), when there is a push to the "main" branch.
#
# To use this workflow, you will need to complete the following set-up steps:
#
# 1. Create an ACR repository to store your container images.
#    You can use ACR EE instance for more security and better performance.
#    For instructions see https://www.alibabacloud.com/help/doc-detail/142168.htm
#
# 2. Create an ACK cluster to run your containerized application.
#    You can use ACK Pro cluster for more security and better performance.
#    For instructions see https://www.alibabacloud.com/help/doc-detail/95108.htm
#
# 3. Store your AccessKey pair in GitHub Actions secrets named `ACCESS_KEY_ID` and `ACCESS_KEY_SECRET`.
#    For instructions on setting up secrets see: https://developer.github.com/actions/managing-workflows/storing-secrets/
#
# 4. Change the values for the REGION_ID, REGISTRY, NAMESPACE, IMAGE, ACK_CLUSTER_ID, and ACK_DEPLOYMENT_NAME.
#

name: Build and Deploy to ACK

on:
  push:
    branches: [ "main" ]

# Environment variables available to all jobs and steps in this workflow.
env:
  REGION_ID: cn-hangzhou
  REGISTRY: registry.cn-hangzhou.aliyuncs.com
  NAMESPACE: namespace
  IMAGE: repo
  TAG: ${{ github.sha }}
  ACK_CLUSTER_ID: clusterID
  ACK_DEPLOYMENT_NAME: nginx-deployment

  ACR_EE_REGISTRY: myregistry.cn-hangzhou.cr.aliyuncs.com
  ACR_EE_INSTANCE_ID: instanceID
  ACR_EE_NAMESPACE: namespace
  ACR_EE_IMAGE: repo
  ACR_EE_TAG: ${{ github.sha }}

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    environment: production

    steps:
    - name: Checkout
      uses: actions/checkout@v3

    # 1.1 Login to ACR
    - name: Login to ACR with the AccessKey pair
      uses: aliyun/acr-login@v1
      with:
        region-id: "${{ env.REGION_ID }}"
        access-key-id: "${{ secrets.ACCESS_KEY_ID }}"
        access-key-secret: "${{ secrets.ACCESS_KEY_SECRET }}"

    # 1.2 Buid and push image to ACR
    - name: Build and push image to ACR
      run: |
        docker build --tag "$REGISTRY/$NAMESPACE/$IMAGE:$TAG" .
        docker push "$REGISTRY/$NAMESPACE/$IMAGE:$TAG"

    # 1.3 Scan image in ACR
    - name: Scan image in ACR
      uses: aliyun/acr-scan@v1
      with:
        region-id: "${{ env.REGION_ID }}"
        access-key-id: "${{ secrets.ACCESS_KEY_ID }}"
        access-key-secret: "${{ secrets.ACCESS_KEY_SECRET }}"
        repository: "${{ env.NAMESPACE }}/${{ env.IMAGE }}"
        tag: "${{ env.TAG }}"

    # 2.1 (Optional) Login to ACR EE
    - uses: actions/checkout@v3
    - name: Login to ACR EE with the AccessKey pair
      uses: aliyun/acr-login@v1
      with:
        login-server: "https://${{ env.ACR_EE_REGISTRY }}"
        region-id: "${{ env.REGION_ID }}"
        access-key-id: "${{ secrets.ACCESS_KEY_ID }}"
        access-key-secret: "${{ secrets.ACCESS_KEY_SECRET }}"
        instance-id: "${{ env.ACR_EE_INSTANCE_ID }}"

    # 2.2 (Optional) Build and push image ACR EE
    - name: Build and push image to ACR EE
      run: |
        docker build -t "$ACR_EE_REGISTRY/$ACR_EE_NAMESPACE/$ACR_EE_IMAGE:$TAG" .
        docker push "$ACR_EE_REGISTRY/$ACR_EE_NAMESPACE/$ACR_EE_IMAGE:$TAG"
    # 2.3 (Optional) Scan image in ACR EE
    - name: Scan image in ACR EE
      uses: aliyun/acr-scan@v1
      with:
        region-id: "${{ env.REGION_ID }}"
        access-key-id: "${{ secrets.ACCESS_KEY_ID }}"
        access-key-secret: "${{ secrets.ACCESS_KEY_SECRET }}"
        instance-id: "${{ env.ACR_EE_INSTANCE_ID }}"
        repository: "${{ env.ACR_EE_NAMESPACE}}/${{ env.ACR_EE_IMAGE }}"
        tag: "${{ env.ACR_EE_TAG }}"

    # 3.1 Set ACK context
    - name: Set K8s context
      uses: aliyun/ack-set-context@v1
      with:
        access-key-id: "${{ secrets.ACCESS_KEY_ID }}"
        access-key-secret: "${{ secrets.ACCESS_KEY_SECRET }}"
        cluster-id: "${{ env.ACK_CLUSTER_ID }}"

    # 3.2 Deploy the image to the ACK cluster
    - name: Set up Kustomize
      run: |-
        curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"  | bash /dev/stdin 3.8.6
    - name: Deploy
      run: |-
        ./kustomize edit set image REGISTRY/NAMESPACE/IMAGE:TAG=$REGISTRY/$NAMESPACE/$IMAGE:$TAG
        ./kustomize build . | kubectl apply -f -
        kubectl rollout status deployment/$ACK_DEPLOYMENT_NAME
        kubectl get services -o wide
