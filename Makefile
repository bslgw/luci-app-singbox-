name: Build Sing-box Bridge IPK

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Build IPK
        uses: immortalwrt/gh-action-sdk@master
        env:
          ARCH: x86_64-openwrt-22.03  # 如果你的目標是其他架構（如 arm），可以在此修改
          FEEDNAME: custom
          PACKAGES: luci-app-singbox
          NO_REFRESH_CHECK: true

      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: luci-app-singbox-ipk
          path: bin/packages/*/custom/luci-app-singbox*.ipk

      - name: Release IPK
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          files: bin/packages/*/custom/luci-app-singbox*.ipk
