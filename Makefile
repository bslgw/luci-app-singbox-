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
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-singbox.json $(1)/usr/share/luci/menu.d/luci-app-singbox.json

	# 确保创建控制器的目录
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./luasrc/controller/singbox.lua $(1)/usr/lib/lua/luci/controller/singbox.lua

	# 确保创建视图文件的目录 (配合上面的 .htm 中转)
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/singbox
	$(INSTALL_DATA) ./luasrc/view/singbox/config.htm $(1)/usr/lib/lua/luci/view/singbox/config.htm

	# 确保静态资源目录
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/singbox/config.js $(1)/www/luci-static/resources/view/singbox/config.js
endef

# 如果你需要安装后自动触发更新，可以添加 postinst 脚本 (可选)
define Package/luci-app-singbox/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
    rm -f /tmp/luci-indexcache
    rm -rf /tmp/luci-modulecache
fi
exit 0
endef

$(eval $(call BuildPackage,luci-app-singbox))
