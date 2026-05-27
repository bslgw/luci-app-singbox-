-- luasrc/controller/singbox.lua
module("luci.controller.singbox", package.seeall)

function index()
    -- 确保路径和 menu.d 中的配置完全对应
    entry({"admin", "services", "singbox"}, firstchild(), _("Sing-box Bridge"), 50).dependent = false
    
    -- 关键修改：指向视图的正确路径 (对应 /www/luci-static/resources/view/singbox/config.js)
    entry({"admin", "services", "singbox", "config"}, cbi("singbox/config"), nil).leaf = true
end
