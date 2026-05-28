include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-singbox
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Sing-box Bridge
  DEPENDS:=+sing-box
  PKGARCH:=all
endef

# 1. 准备阶段：把仓库里的 root 文件夹内容释放到编译沙箱中
define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./root/* $(PKG_BUILD_DIR)/
endef

# 纯静态打包，不需要执行 C 语言编译
define Build/Compile
endef

# 2. 安装打包阶段：直接把沙箱里的目录树无缝塞进 IPK 根目录
define Package/luci-app-singbox/install
	$(INSTALL_DIR) $(1)
	$(CP) $(PKG_BUILD_DIR)/* $(1)/
endef

# 3. 用户安装后触发的脚本
define Package/luci-app-singbox/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
    # 自动建立并修正底层配置目录权限
    mkdir -p /etc/sing-box
    chmod 755 /etc/sing-box
    chmod 644 /etc/sing-box/*.json 2>/dev/null || true

    # 强刷 LuCI 路由和模块缓存
    rm -rf /tmp/luci-indexcache /tmp/luci-modulecache/*

    # 重启 rpcd 释放刚安装的 ACL 权限
    if [ -x /etc/init.d/rpcd ]; then
        /etc/init.d/rpcd restart >/dev/null 2>&1
    fi
fi
exit 0
endef

$(eval $(call BuildPackage,luci-app-singbox))
