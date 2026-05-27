include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.7
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-singbox
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Support for Sing-box Bridge
  DEPENDS:=+luci-base +sing-box +jq
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-singbox/install
	# 1. 安装菜单配置文件
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./luci-app-singbox.json $(1)/usr/share/luci/menu.d/luci-app-singbox.json

	# 2. 安装 Lua 控制器
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./singbox.lua $(1)/usr/lib/lua/luci/controller/singbox.lua

	# 3. 安装前端 JS 视图文件
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(INSTALL_DATA) ./config.js $(1)/www/luci-static/resources/view/singbox/config.js

	# 4. 安装视图中转文件
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/singbox
	$(INSTALL_DATA) ./config.htm $(1)/usr/lib/lua/luci/view/singbox/config.htm
endef

define Package/luci-app-singbox/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
    rm -f /tmp/luci-indexcache
    rm -rf /tmp/luci-modulecache
fi
exit 0
endef

$(eval $(call BuildPackage,luci-app-singbox))
