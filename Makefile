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
	# ... (前两项保持不变) ...

	# 2. 安装 Lua 控制器
	# 这里改为使用绝对路径或者确保引用正确
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/controller/singbox.lua $(1)/usr/lib/lua/luci/controller/singbox.lua

	# 3. 安装前端 JS 视图文件
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/singbox/config.js $(1)/www/luci-static/resources/view/singbox/config.js

	# 4. 安装视图中转文件
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/singbox
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/luasrc/view/singbox/config.htm $(1)/usr/lib/lua/luci/view/singbox/config.htm
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
