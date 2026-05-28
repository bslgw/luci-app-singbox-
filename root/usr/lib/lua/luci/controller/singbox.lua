module("luci.controller.singbox", package.seeall)

function index()
    -- 使用 view() 直接映射 JS，并通过 acl_depends 声明此页面应得的沙箱权限
    local page = entry({"admin", "services", "singbox"}, view("singbox/config"), _("Sing-box Bridge"), 50)
    page.leaf = true
    page.acl_depends = { "luci-app-singbox" }
end
