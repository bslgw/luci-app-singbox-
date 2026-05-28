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
	# 将根目录下所有内容拷贝到编译区
	$(CP) ./* $(PKG_BUILD_DIR)/
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-singbox/install
	# 1. 安装 Lua 控制器
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(CP) $(PKG_BUILD_DIR)/luasrc/controller/* $(1)/usr/lib/lua/luci/controller/

	# 2. 安装 Lua 视图
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view
	$(CP) $(PKG_BUILD_DIR)/luasrc/view/* $(1)/usr/lib/lua/luci/view/

	# 3. 安装静态资源 (js/htm)
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/singbox
	$(CP) $(PKG_BUILD_DIR)/htdocs/luci-static/resources/view/singbox/* $(1)/www/luci-static/resources/view/singbox/

	# 4. 安装配置文件
	$(INSTALL_DIR) $(1)/etc/config
	$(CP) $(PKG_BUILD_DIR)/root/etc/config/* $(1)/etc/config/

	# 5. 安装 init 脚本 (并确保有执行权限)
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/root/etc/init.d/* $(1)/etc/init.d/

	# 6. 安装菜单配置
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(CP) $(PKG_BUILD_DIR)/root/usr/share/luci/menu.d/* $(1)/usr/share/luci/menu.d/
endef

$(eval $(call BuildPackage,luci-app-singbox))
