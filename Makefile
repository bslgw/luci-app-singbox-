include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-singbox
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Support for Sing-box (Bridge for daed)
  DEPENDS:=+luci-base +sing-box
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-singbox/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-singbox.json $(1)/usr/share/luci/menu.d/luci-app-singbox.json

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/singbox/config.js $(1)/www/luci-static/resources/view/singbox/config.js
endef

$(eval $(call BuildPackage,luci-app-singbox))
