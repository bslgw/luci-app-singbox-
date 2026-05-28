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
	# 使用 $(PWD) 强制指定从当前编译目录读取文件
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) $(PWD)/luci-app-singbox.json $(1)/usr/share/luci/menu.d/luci-app-singbox.json

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) $(PWD)/singbox.lua $(1)/usr/lib/lua/luci/controller/singbox.lua

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(INSTALL_DATA) $(PWD)/config.js $(1)/www/luci-static/resources/view/singbox/config.js

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/singbox
	$(INSTALL_DATA) $(PWD)/config.htm $(1)/usr/lib/lua/luci/view/singbox/config.htm
endef

$(eval $(call BuildPackage,luci-app-singbox))
