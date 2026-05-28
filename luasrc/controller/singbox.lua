module("luci.controller.singbox", package.seeall)

function index()
    -- 尝试挂载到 services 根目录，不要用 firstchild
    -- 确保路径定义正确，且 i18n 标题存在
    entry({"admin", "services", "singbox"}, template("singbox/config"), "Sing-box Bridge", 50).leaf = true
end
