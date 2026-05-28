include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-singbox
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Sing-box
  PKGARCH:=all
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) -r $(CURDIR)/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
endef

define Package/luci-app-singbox/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci
	$(CP) $(PKG_BUILD_DIR)/luasrc/* $(1)/usr/lib/lua/luci/

	$(INSTALL_DIR) $(1)/www/luci-static/resources
	$(CP) -r $(PKG_BUILD_DIR)/htdocs/luci-static/resources/* $(1)/www/luci-static/resources/

	$(INSTALL_DIR) $(1)/etc/config
	$(CP) $(PKG_BUILD_DIR)/root/etc/config/* $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/root/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(CP) $(PKG_BUILD_DIR)/root/usr/share/luci/menu.d/* $(1)/usr/share/luci/menu.d/
endef

$(eval $(call BuildPackage,luci-app-singbox))
