name: Build Sing-box Bridge IPK

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Compilation Environment
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential ccache gettext libncurses5-dev libssl-dev xz-utils zlib1g-dev python3 rsync gawk file wget curl

      - name: Download Official OpenWrt SDK
        run: |
          ENCODED_URL="aHR0cHM6Ly9kb3dubG9hZHMub3BlbndydC5vcmcvcmVsZWFzZXMvMjIuMDMuMC90YXJnZXRzL3g4Ni82NC9vcGVud3J0LXNkay0yMi4wMy4wLXg4Ni02NF9nY2MtMTEuMi4wX211c2wuTGludXgteDg2XzY0LnRhci54eg=="
          REAL_URL=$(echo $ENCODED_URL | base64 -d)
          curl -L -o sdk.tar.xz "$REAL_URL"
          mkdir sdk
          tar -xJf sdk.tar.xz -C sdk --strip-components=1

      - name: Prepare Package
        run: |
          cd sdk
          ./scripts/feeds update -a
          ./scripts/feeds install -a
          mkdir -p package/luci-app-singbox
          # 将根目录下的 5 个文件精准复制到编译路径
          cp ../Makefile package/luci-app-singbox/
          cp ../singbox.lua package/luci-app-singbox/
          cp ../config.js package/luci-app-singbox/
          cp ../config.htm package/luci-app-singbox/
          cp ../luci-app-singbox.json package/luci-app-singbox/

      - name: Compile IPK
        run: |
          cd sdk
          make defconfig
          make package/luci-app-singbox/compile V=s

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: luci-app-singbox-ipk
          path: sdk/bin/**/*.ipk
