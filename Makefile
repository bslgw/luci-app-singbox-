include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-singbox
PKG_VERSION:=1.0.1
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

# 1. 强制清空准备阶段（不需要临时沙箱，避开 SDK 缓存 BUG）
define Build/Prepare
endef

# 2. 强制清空编译阶段（纯脚本，不需要 C 语言编译）
define Build/Compile
endef

# 3. 安装打包：简单粗暴，直接从源码目录把 root 下的所有东西搬进 IPK 镜像
define Package/luci-app-singbox/install
	$(INSTALL_DIR) $(1)
	$(CP) ./root/* $(1)/
endef

# 4. 普通用户安装后触发的后台自动化脚本
define Package/luci-app-singbox/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
    # 自动建立并修正底层配置目录权限
    mkdir -p /etc/sing-box
    chmod 755 /etc/sing-box
    chmod 644 /etc/sing-box/*.json 2>/dev/null || true

    # 强刷 LuCI 路由和模块缓存
    rm -rf /tmp/luci-indexcache /tmp/luci-modulecache/*

    # 温柔地通知 rpcd 重载 ACL 权限，而不中断当前的登录会话 (解决踢人下线问题)
    killall -HUP rpcd 2>/dev/null || true
fi
exit 0
endef

$(eval $(call BuildPackage,luci-app-singbox))
